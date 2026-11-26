"use server"

import { notifyAdmins, notifyCustomer } from "@/lib/backend/notify"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { button, senderFor, sendAdminEmail } from "@/lib/backend/mail"
import { defaultIntro, defaultTerms, kr, loadQuote, splitTotals, totals, type QuoteLine } from "@/lib/backend/quotes"
import { appUrl, type Org } from "@/lib/org"

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim()
const editor = (id: string) => `/admin/tilbud/${id}`
const in30Days = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

export async function createQuote(formData: FormData) {
  const { user, org } = await requireRoleAction(["admin"])
  const db = createAdminClient()
  const requestId = text(formData, "contactRequestId")
  let prefill: Record<string, unknown> = {}
  if (requestId) {
    const { data: request } = await db.from("contact_requests").select("name, email, phone, company, message").eq("org_id", org.id).eq("id", requestId).maybeSingle()
    if (request) {
      const company = request.company ?? String(request.message ?? "").match(/Virksomhed: (.+)/)?.[1] ?? null
      prefill = { recipient_name: request.name, recipient_email: request.email, recipient_phone: request.phone, recipient_company: company, contact_request_id: requestId }
    }
  }
  const { data, error } = await db
    .from("quotes")
    .insert({ org_id: org.id, status: "draft", title: "Tilbud", intro: org.quote_default_intro || defaultIntro, terms: org.quote_default_terms || defaultTerms, valid_until: in30Days(), billing: "monthly", vat_rate: 25, created_by: user.id, ...prefill })
    .select("id")
    .single()
  if (error || !data) redirect(`/admin/tilbud?fejl=${encodeURIComponent(error?.message ?? "Tilbuddet blev ikke oprettet")}`)
  await db.from("quote_line_items").insert({ org_id: org.id, quote_id: data.id, description: "", quantity: 1, unit: "md.", unit_price: 0, position: 0 })
  redirect(editor(data.id))
}

function readLines(formData: FormData): QuoteLine[] {
  const descriptions = formData.getAll("line_description").map(String)
  const quantities = formData.getAll("line_quantity").map(String)
  const units = formData.getAll("line_unit").map(String)
  const prices = formData.getAll("line_price").map(String)
  const recurring = formData.getAll("line_recurring").map(String)
  // Number inputs always submit dot decimals ("1250.5"); also accept a typed comma.
  const num = (v: string) => Number(v.replace(/\s/g, "").replace(",", ".")) || 0
  return descriptions
    .map((description, i) => ({ description: description.trim(), quantity: num(quantities[i] ?? "1") || 1, unit: (units[i] ?? "stk").trim() || "stk", unit_price: num(prices[i] ?? "0"), position: i, recurring: recurring[i] === "true" ? true : recurring[i] === "false" ? false : null }))
    .filter((l) => l.description)
}

async function persist(org: Org, id: string, formData: FormData) {
  const db = createAdminClient()
  const lines = readLines(formData)
  const vatRate = Number(text(formData, "vat_rate")) || 25
  const { subtotal } = totals(lines, vatRate)
  const { data: updated, error } = await db
    .from("quotes")
    .update({
      title: text(formData, "title") || null,
      recipient_name: text(formData, "recipient_name") || null,
      recipient_company: text(formData, "recipient_company") || null,
      recipient_email: text(formData, "recipient_email") || null,
      recipient_phone: text(formData, "recipient_phone") || null,
      recipient_address: text(formData, "recipient_address") || null,
      recipient_cvr: text(formData, "recipient_cvr") || null,
      intro: text(formData, "intro") || null,
      terms: text(formData, "terms") || null,
      notes: text(formData, "notes") || null,
      billing: text(formData, "billing") === "one_time" ? "one_time" : "monthly",
      vat_rate: vatRate,
      valid_until: text(formData, "valid_until") || null,
      total: subtotal,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", org.id)
    .eq("id", id)
    .select("id")
  if (error) return error.message
  if (!updated?.length) return "Tilbuddet findes ikke."
  await db.from("quote_line_items").delete().eq("org_id", org.id).eq("quote_id", id)
  if (lines.length) {
    const { error: lineError } = await db.from("quote_line_items").insert(lines.map((l) => ({ ...l, org_id: org.id, quote_id: id })))
    if (lineError) return lineError.message
  }
  return null
}

export async function saveQuote(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id")
  const intent = text(formData, "intent")
  const problem = await persist(org, id, formData)
  if (problem) redirect(`${editor(id)}?fejl=${encodeURIComponent(problem)}`)
  revalidatePath("/admin/tilbud")
  if (intent === "add_line") redirect(`${editor(id)}?linjer=${Number(text(formData, "extra_lines") || "0") + 1}#linjer`)
  redirect(`${editor(id)}?gemt=1`)
}

export async function sendQuote(formData: FormData) {
  const { user, org } = await requireRoleAction(["admin"])
  const id = text(formData, "id")
  const problem = await persist(org, id, formData)
  if (problem) redirect(`${editor(id)}?fejl=${encodeURIComponent(problem)}`)
  const quote = await loadQuote(org.id, id)
  if (!quote) redirect("/admin/tilbud")
  if (!quote.recipient_email) redirect(`${editor(id)}?fejl=${encodeURIComponent("Udfyld kundens email før du sender.")}`)
  if (!quote.lines.length) redirect(`${editor(id)}?fejl=${encodeURIComponent("Tilføj mindst én linje.")}`)

  const link = `${appUrl()}/t/${quote.public_token}`
  const split = splitTotals(quote.lines, quote.vat_rate, quote.billing)
  const firstName = (quote.recipient_name ?? "").split(" ")[0]
  const message = text(formData, "message") || `Hej${firstName ? ` ${firstName}` : ""}\n\nTak for en god dialog. Hermed vores ${quote.title?.toLowerCase() || "tilbud"}.\n\nI kan se hele tilbuddet og acceptere det direkte via knappen herunder. Tilbuddet kan også gemmes som PDF.`
  const summary = split.mixed
    ? `Tilbud nr. ${quote.quote_number} · ${kr(split.monthly.subtotal)} ekskl. moms pr. måned + engangsopgaver ${kr(split.oneOff.subtotal)}`
    : `Tilbud nr. ${quote.quote_number} · ${kr(quote.billing === "one_time" ? split.oneOff.subtotal : split.monthly.subtotal)} ekskl. moms${quote.billing === "one_time" ? "" : " pr. måned"}`
  try {
    await sendAdminEmail({
      org,
      to: quote.recipient_email!,
      subject: `Tilbud nr. ${quote.quote_number} fra ${org.name}`,
      text: message,
      extraHtml: `<p style="margin:22px 0 0;padding:14px 16px;background:${org.color_background};border-left:3px solid ${org.color_accent};font-size:14px;">${summary}</p>${button(org, link, "Se og acceptér tilbuddet")}`,
      extraText: `${summary}\nSe og acceptér tilbuddet: ${link}`,
      contactRequestId: quote.contact_request_id,
      sentBy: user.id,
      sender: await senderFor(org, user.id, user.email ?? null),
      bannerId: text(formData, "banner_id") || undefined,
    })
  } catch (error) {
    redirect(`${editor(id)}?fejl=${encodeURIComponent(error instanceof Error ? error.message : "Tilbuddet blev ikke sendt")}`)
  }
  await createAdminClient().from("quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", id)
  await notifyCustomer(org, quote.customer_id, { kind: "quote", title: `Nyt tilbud fra ${org.name}`, body: quote.title || `Tilbud nr. ${quote.quote_number}`, href: "/kunde/tilbud" })
  revalidatePath("/admin", "layout")
  redirect(`${editor(id)}?sendt=1`)
}

export async function duplicateQuote(formData: FormData) {
  const { user, org } = await requireRoleAction(["admin"])
  const source = await loadQuote(org.id, text(formData, "id"))
  if (!source) redirect("/admin/tilbud")
  const db = createAdminClient()
  const { data } = await db
    .from("quotes")
    .insert({
      org_id: org.id, status: "draft", title: source.title, intro: source.intro, terms: source.terms, billing: source.billing, vat_rate: source.vat_rate, total: source.total,
      recipient_name: source.recipient_name, recipient_company: source.recipient_company, recipient_email: source.recipient_email, recipient_phone: source.recipient_phone,
      recipient_address: source.recipient_address, recipient_cvr: source.recipient_cvr, valid_until: in30Days(), created_by: user.id,
    })
    .select("id")
    .single()
  if (!data) redirect("/admin/tilbud")
  if (source.lines.length) await db.from("quote_line_items").insert(source.lines.map(({ description, quantity, unit, unit_price, position, recurring }) => ({ org_id: org.id, quote_id: data.id, description, quantity, unit, unit_price, position, recurring: recurring ?? null })))
  redirect(editor(data.id))
}

export async function setQuoteStatus(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id")
  const status = text(formData, "status")
  if (!["draft", "sent", "accepted", "declined", "expired"].includes(status)) return
  await createAdminClient().from("quotes").update({ status, ...(status === "accepted" ? { accepted_at: new Date().toISOString() } : {}) }).eq("org_id", org.id).eq("id", id)
  revalidatePath("/admin/tilbud")
  redirect(`${editor(id)}?gemt=1`)
}

export async function deleteQuote(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id")
  const db = createAdminClient()
  await db.from("quote_line_items").delete().eq("org_id", org.id).eq("quote_id", id)
  await db.from("quotes").delete().eq("org_id", org.id).eq("id", id)
  revalidatePath("/admin/tilbud")
  redirect("/admin/tilbud?slettet=1")
}
