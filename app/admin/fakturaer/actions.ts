"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { button, senderFor, sendAdminEmail } from "@/lib/backend/mail"
import { kr, loadQuote } from "@/lib/backend/quotes"
import { addDaysIso, invoiceNo, invoiceTotals, loadInvoice, paymentLines, type InvoiceLine } from "@/lib/backend/invoices"
import { appUrl, type Org } from "@/lib/org"

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim()
const editor = (id: string) => `/admin/fakturaer/${id}`
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" })
const fail = (path: string, message: string): never => redirect(`${path}?fejl=${encodeURIComponent(message)}`)

async function insertDraft(org: Org, userId: string, fields: Record<string, unknown>, lines: InvoiceLine[]) {
  const db = createAdminClient()
  const issue = today()
  const { subtotal, vat, total } = invoiceTotals(lines, Number(fields.vat_rate ?? 25))
  const { data, error } = await db
    .from("invoices")
    .insert({ org_id: org.id, status: "draft", issue_date: issue, delivery_date: issue, due_date: addDaysIso(issue, org.payment_terms_days ?? 8), vat_rate: 25, subtotal, vat_amount: vat, total, created_by: userId, ...fields })
    .select("id")
    .single()
  if (error || !data) fail("/admin/fakturaer", error?.message ?? "Fakturaen blev ikke oprettet")
  if (lines.length) await db.from("invoice_lines").insert(lines.map((l, i) => ({ org_id: org.id, invoice_id: data!.id, description: l.description, quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, position: i })))
  return data!.id as string
}

export async function createInvoice(formData: FormData) {
  const { org, user } = await requireRoleAction(["admin"])
  const db = createAdminClient()
  const customerId = text(formData, "customer_id")
  let fields: Record<string, unknown> = {}
  if (customerId) {
    const { data: c } = await db.from("customers").select("id, name, company, email, address, cvr, contact_name").eq("org_id", org.id).eq("id", customerId).maybeSingle()
    if (c) fields = { customer_id: c.id, recipient_company: c.company || c.name, recipient_name: c.contact_name || (c.company ? c.name : null), recipient_email: c.email, recipient_address: c.address, recipient_cvr: c.cvr }
  }
  const id = await insertDraft(org, user.id, fields, [{ description: "", quantity: 1, unit: "stk", unit_price: 0, position: 0 }])
  redirect(editor(id))
}

/** Invoice from an accepted quote: same recipient and lines. */
export async function invoiceFromQuote(formData: FormData) {
  const { org, user } = await requireRoleAction(["admin"])
  const quote = await loadQuote(org.id, text(formData, "quote_id"))
  if (!quote) fail("/admin/tilbud", "Tilbuddet findes ikke.")
  const q = quote!
  const id = await insertDraft(
    org,
    user.id,
    {
      quote_id: q.id,
      customer_id: (q as unknown as { customer_id: string | null }).customer_id ?? null,
      title: q.title ? `${q.title}` : "Faktura",
      reference: `Tilbud nr. ${q.quote_number}`,
      recipient_company: q.recipient_company,
      recipient_name: q.recipient_name,
      recipient_email: q.recipient_email,
      recipient_address: q.recipient_address,
      recipient_cvr: q.recipient_cvr,
      vat_rate: q.vat_rate,
    },
    q.lines,
  )
  redirect(editor(id))
}

function readLines(formData: FormData): InvoiceLine[] {
  const d = formData.getAll("line_description").map(String)
  const q = formData.getAll("line_quantity").map(String)
  const u = formData.getAll("line_unit").map(String)
  const p = formData.getAll("line_price").map(String)
  const num = (v: string) => Number(v.replace(/\s/g, "").replace(",", ".")) || 0
  return d.map((description, i) => ({ description: description.trim(), quantity: num(q[i] ?? "1") || 1, unit: (u[i] ?? "stk").trim() || "stk", unit_price: num(p[i] ?? "0"), position: i })).filter((l) => l.description)
}

async function persist(org: Org, id: string, formData: FormData) {
  const db = createAdminClient()
  const { data: current } = await db.from("invoices").select("status").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!current) return "Fakturaen findes ikke."
  if (current.status !== "draft") return "En sendt faktura kan ikke ændres. Lav en kreditnota i stedet."
  const lines = readLines(formData)
  const vatRate = Number(text(formData, "vat_rate")) || 0
  const { subtotal, vat, total } = invoiceTotals(lines, vatRate)
  const date = (key: string) => (/^\d{4}-\d{2}-\d{2}$/.test(text(formData, key)) ? text(formData, key) : null)
  const { error } = await db
    .from("invoices")
    .update({
      title: text(formData, "title") || null,
      recipient_company: text(formData, "recipient_company") || null,
      recipient_name: text(formData, "recipient_name") || null,
      recipient_email: text(formData, "recipient_email") || null,
      recipient_address: text(formData, "recipient_address") || null,
      recipient_cvr: text(formData, "recipient_cvr") || null,
      recipient_ean: text(formData, "recipient_ean") || null,
      reference: text(formData, "reference") || null,
      issue_date: date("issue_date") ?? today(),
      delivery_date: date("delivery_date"),
      due_date: date("due_date"),
      vat_rate: vatRate,
      subtotal,
      vat_amount: vat,
      total,
      notes: text(formData, "notes") || null,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", org.id)
    .eq("id", id)
  if (error) return error.message
  await db.from("invoice_lines").delete().eq("org_id", org.id).eq("invoice_id", id)
  if (lines.length) {
    const { error: lineError } = await db.from("invoice_lines").insert(lines.map((l) => ({ ...l, org_id: org.id, invoice_id: id })))
    if (lineError) return lineError.message
  }
  return null
}

export async function saveInvoice(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id")
  const problem = await persist(org, id, formData)
  if (problem) fail(editor(id), problem)
  revalidatePath("/admin/fakturaer")
  if (text(formData, "intent") === "add_line") redirect(`${editor(id)}?linjer=${Number(text(formData, "extra_lines") || "0") + 1}#linjer`)
  redirect(`${editor(id)}?gemt=1`)
}

async function mailInvoice(org: Org, invoiceId: string, user: { id: string; email: string | null }, kind: "invoice" | "reminder", message: string, bannerId?: string) {
  const inv = await loadInvoice(org.id, invoiceId)
  if (!inv) throw new Error("Fakturaen findes ikke.")
  if (!inv.recipient_email) throw new Error("Udfyld kundens email før du sender.")
  const link = `${appUrl()}/f/${inv.public_token}`
  const no = invoiceNo(org, inv)
  const isCredit = Boolean(inv.credit_of)
  const due = inv.due_date ? new Date(`${inv.due_date}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null
  const pay = paymentLines(org, inv)
  const summary = `${isCredit ? "Kreditnota" : "Faktura"} nr. ${no} · ${kr(inv.total)} inkl. moms${due && !isCredit ? ` · forfald ${due}` : ""}`
  await sendAdminEmail({
    org,
    to: inv.recipient_email,
    subject: kind === "reminder" ? `Påmindelse: faktura nr. ${no} fra ${org.name}` : `${isCredit ? "Kreditnota" : "Faktura"} nr. ${no} fra ${org.name}`,
    text: message,
    extraHtml: `<p style="margin:22px 0 0;padding:14px 16px;background:${org.color_background};border-left:3px solid ${org.color_accent};font-size:14px;">${summary}${pay.length && !isCredit ? `<br/>${pay.join("<br/>")}` : ""}</p>${button(org, link, isCredit ? "Se kreditnota" : "Se og download faktura")}`,
    extraText: `${summary}\n${pay.join("\n")}\n\nSe fakturaen: ${link}`,
    sentBy: user.id,
    sender: await senderFor(org, user.id, user.email),
    bannerId,
  })
}

export async function sendInvoice(formData: FormData) {
  const { org, user } = await requireRoleAction(["admin"])
  const id = text(formData, "id")
  const db = createAdminClient()
  const { data: current } = await db.from("invoices").select("status").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!current) fail("/admin/fakturaer", "Fakturaen findes ikke.")
  if (current!.status === "draft") {
    const problem = await persist(org, id, formData)
    if (problem) fail(editor(id), problem)
    const check = await loadInvoice(org.id, id)
    if (!check?.lines.length) fail(editor(id), "Tilføj mindst én linje.")
    if (!check?.recipient_email) fail(editor(id), "Udfyld kundens email før du sender.")
    // Sequential number is given now, so drafts never leave gaps.
    const { error } = await db.rpc("assign_invoice_number", { p_invoice: id })
    if (error) fail(editor(id), error.message)
  }
  const inv = await loadInvoice(org.id, id)
  const first = (inv?.recipient_name ?? "").split(" ")[0]
  const message = text(formData, "message") || `Hej${first ? ` ${first}` : ""}\n\nHermed ${inv?.credit_of ? "kreditnota" : "faktura"} nr. ${inv ? invoiceNo(org, inv) : ""}. Du kan se og downloade den via knappen herunder.`
  try {
    await mailInvoice(org, id, { id: user.id, email: user.email }, "invoice", message, text(formData, "banner_id") || undefined)
  } catch (error) {
    fail(editor(id), error instanceof Error ? error.message : "Fakturaen blev ikke sendt")
  }
  await db.from("invoices").update({ status: inv?.status === "draft" ? (inv.credit_of ? "credited" : "sent") : inv?.status, sent_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", id)
  revalidatePath("/admin", "layout")
  redirect(`${editor(id)}?sendt=1`)
}

export async function sendReminder(formData: FormData) {
  const { org, user } = await requireRoleAction(["admin"])
  const id = text(formData, "id")
  const inv = await loadInvoice(org.id, id)
  if (!inv || inv.status !== "sent") fail(editor(id), "Kun sendte, ubetalte fakturaer kan rykkes.")
  const first = (inv!.recipient_name ?? "").split(" ")[0]
  const message = `Hej${first ? ` ${first}` : ""}\n\nVi kan ikke se, at faktura nr. ${invoiceNo(org, inv!)} er betalt endnu. Hvis den allerede er betalt, kan du se bort fra denne mail.`
  try {
    await mailInvoice(org, id, { id: user.id, email: user.email }, "reminder", message)
  } catch (error) {
    fail(editor(id), error instanceof Error ? error.message : "Påmindelsen blev ikke sendt")
  }
  await createAdminClient().from("invoices").update({ reminder_sent_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", id)
  revalidatePath("/admin/fakturaer")
  redirect(`${editor(id)}?rykket=1`)
}

export async function markPaid(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id")
  const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(text(formData, "paid_on")) ? text(formData, "paid_on") : today()
  const inv = await loadInvoice(org.id, id)
  if (!inv || inv.status !== "sent") fail(editor(id), "Kun sendte fakturaer kan markeres som betalt.")
  const amount = Number(text(formData, "amount").replace(",", ".")) || inv!.total
  await createAdminClient().from("invoices").update({ status: "paid", paid_at: `${paidOn}T12:00:00Z`, paid_amount: amount }).eq("org_id", org.id).eq("id", id)
  revalidatePath("/admin", "layout")
  redirect(`${editor(id)}?betalt=1`)
}

export async function markUnpaid(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id")
  await createAdminClient().from("invoices").update({ status: "sent", paid_at: null, paid_amount: null }).eq("org_id", org.id).eq("id", id).eq("status", "paid")
  revalidatePath("/admin", "layout")
  redirect(editor(id))
}

/** Credit note: a new invoice with negative lines referring to the original. */
export async function creditInvoice(formData: FormData) {
  const { org, user } = await requireRoleAction(["admin"])
  const src = await loadInvoice(org.id, text(formData, "id"))
  if (!src || src.status === "draft" || src.credit_of) fail("/admin/fakturaer", "Kun sendte fakturaer kan krediteres.")
  const s = src!
  const id = await insertDraft(
    org,
    user.id,
    { credit_of: s.id, customer_id: s.customer_id, quote_id: s.quote_id, title: "Kreditnota", reference: `Kreditering af faktura nr. ${invoiceNo(org, s)}`, recipient_company: s.recipient_company, recipient_name: s.recipient_name, recipient_email: s.recipient_email, recipient_address: s.recipient_address, recipient_cvr: s.recipient_cvr, recipient_ean: s.recipient_ean, vat_rate: s.vat_rate, due_date: null },
    s.lines.map((l) => ({ ...l, unit_price: -Math.abs(l.unit_price) })),
  )
  await createAdminClient().from("invoices").update({ status: "credited" }).eq("org_id", org.id).eq("id", s.id)
  redirect(editor(id))
}

export async function deleteDraft(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id")
  const db = createAdminClient()
  const { data } = await db.from("invoices").select("status, invoice_number").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!data || data.status !== "draft" || data.invoice_number) fail(editor(id), "Kun kladder uden nummer kan slettes.")
  await db.from("invoices").delete().eq("org_id", org.id).eq("id", id)
  revalidatePath("/admin/fakturaer")
  redirect("/admin/fakturaer?slettet=1")
}
