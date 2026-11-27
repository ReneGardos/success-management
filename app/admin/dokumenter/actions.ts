"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { isStaffOf } from "@/lib/backend/staff"
import { loadQuote } from "@/lib/backend/quotes"
import { contractTemplate, docPathAllowed, docUploadTarget } from "@/lib/backend/documents"
import { button, sendAdminEmail, senderFor } from "@/lib/backend/mail"
import { notifyCustomer, notifyUsers } from "@/lib/backend/notify"
import { appUrl } from "@/lib/org"

const uuid = /^[0-9a-f-]{36}$/i

export async function createContract(formData: FormData) {
  const { org, user } = await requireRoleAction(["admin"])
  const db = createAdminClient()
  const customerId = String(formData.get("customer_id") ?? "")
  const quoteId = String(formData.get("quote_id") ?? "")
  const { data: c } = uuid.test(customerId) ? await db.from("customers").select("id, name, company, address, cvr").eq("org_id", org.id).eq("id", customerId).maybeSingle() : { data: null }
  if (!c) redirect("/admin/dokumenter?fejl=Vælg+en+kunde")
  const q = uuid.test(quoteId) ? await loadQuote(org.id, quoteId) : null
  const { data: doc } = await db.from("org_documents").insert({ org_id: org.id, kind: "contract", title: `Serviceaftale – ${c!.company || c!.name}`, body: contractTemplate(org, c!, q), customer_id: c!.id, quote_id: q?.id ?? null, created_by: user.id }).select("id").single()
  redirect(`/admin/dokumenter/${doc!.id}`)
}

export async function saveDocument(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = String(formData.get("id") ?? "")
  const expires = String(formData.get("expires_on") ?? "")
  await createAdminClient().from("org_documents").update({ title: String(formData.get("title") ?? "").trim().slice(0, 200) || "Dokument", body: String(formData.get("body") ?? "").slice(0, 60000) || null, needs_signature: formData.get("needs_signature") === "on", expires_on: /^\d{4}-\d{2}-\d{2}$/.test(expires) ? expires : null }).eq("org_id", org.id).eq("id", id).in("status", ["draft", "sent"])
  revalidatePath(`/admin/dokumenter/${id}`)
  redirect(`/admin/dokumenter/${id}?gemt=1`)
}

/** Sends the signing link to the customer (mail + portal) or employee (app). */
export async function sendDocument(formData: FormData) {
  const { org, user } = await requireRoleAction(["admin"])
  const db = createAdminClient()
  const id = String(formData.get("id") ?? "")
  const { data: d } = await db.from("org_documents").select("*").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!d) redirect("/admin/dokumenter")
  const link = `${appUrl()}/d/${d!.public_token}`
  if (d!.customer_id) {
    const { data: c } = await db.from("customers").select("email, contact_name, name").eq("id", d!.customer_id).maybeSingle()
    if (c?.email) {
      try {
        await sendAdminEmail({ org, to: c.email, subject: `${d!.title} – ${d!.needs_signature ? "klar til underskrift" : "til orientering"}`, text: `Hej${c.contact_name ? ` ${c.contact_name.split(" ")[0]}` : ""}\n\nHer er ${d!.title.toLowerCase()} fra ${org.name}. ${d!.needs_signature ? "Du kan læse og underskrive den digitalt via knappen herunder." : "Du kan læse den via knappen herunder."}`, extraHtml: button(org, link, d!.needs_signature ? "Læs og underskriv" : "Åbn dokumentet"), extraText: link, sentBy: user.id, sender: await senderFor(org, user.id, user.email ?? null) })
      } catch (e) { redirect(`/admin/dokumenter/${id}?fejl=${encodeURIComponent(e instanceof Error ? e.message : "Mail fejlede")}`) }
    }
    await notifyCustomer(org, d!.customer_id, { kind: "quote", title: d!.needs_signature ? "Dokument til underskrift" : "Nyt dokument", body: d!.title, href: "/kunde/dokumenter" })
  }
  if (d!.employee_id) await notifyUsers(org, [d!.employee_id], { kind: "report", title: d!.needs_signature ? "Dokument til underskrift" : "Nyt dokument", body: d!.title, href: "/medarbejder/dokumenter" })
  await db.from("org_documents").update({ status: d!.needs_signature ? "sent" : "signed", sent_at: new Date().toISOString() }).eq("id", id)
  revalidatePath("/admin/dokumenter")
  redirect(`/admin/dokumenter/${id}?sendt=1`)
}

export async function archiveDocument(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = String(formData.get("id") ?? "")
  if (formData.get("delete") === "1") { await createAdminClient().from("org_documents").delete().eq("org_id", org.id).eq("id", id).eq("status", "draft"); redirect("/admin/dokumenter") }
  await createAdminClient().from("org_documents").update({ status: "archived" }).eq("org_id", org.id).eq("id", id)
  redirect("/admin/dokumenter")
}

export async function adminDocTarget(name: string, type: string) {
  const { org } = await requireRoleAction(["admin"])
  return docUploadTarget(org.id, "docs", type, name)
}

/** Registers an uploaded file for an employee or customer. */
export async function registerAdminDoc(path: string, fileName: string, form: Record<string, string>) {
  const { org, user } = await requireRoleAction(["admin"])
  if (!docPathAllowed(org.id, "docs", path)) return { ok: false, message: "Ugyldig fil." }
  const [kind, ref] = String(form.who ?? "").split(":")
  const employee_id = kind === "e" && uuid.test(ref ?? "") && (await isStaffOf(org.id, ref)) ? ref : null
  const customer_id = kind === "c" && uuid.test(ref ?? "") ? ref : null
  const expires = /^\d{4}-\d{2}-\d{2}$/.test(form.expires_on ?? "") ? form.expires_on : null
  const { error } = await createAdminClient().from("org_documents").insert({ org_id: org.id, kind: employee_id ? "employee" : customer_id ? "contract" : "policy", title: (form.title || fileName).slice(0, 200), file_path: path, file_name: fileName.slice(0, 200), employee_id, customer_id, needs_signature: form.needs_signature === "on", expires_on: expires, created_by: user.id })
  revalidatePath("/admin/dokumenter")
  return { ok: !error, message: error?.message }
}
