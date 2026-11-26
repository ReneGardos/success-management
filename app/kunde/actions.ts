"use server"

import { redirect } from "next/navigation"
import { Resend } from "resend"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { mailConfigured, officeEmailFor } from "@/lib/backend/mail"
import { pathAllowed, photoUploadTarget } from "@/lib/backend/reports"
import { appUrl, orgSender } from "@/lib/org"
import { customerIdsFor } from "@/lib/backend/customers"
import { getViewAs } from "@/lib/view-as"

export async function submitCustomerFeedback(formData: FormData) {
  const { org, user, ctx } = await requireRoleAction(["customer", "admin"])
  if (await getViewAs(ctx)) redirect("/kunde/feedback")
  const message = String(formData.get("message") ?? "").trim().slice(0, 2000)
  const locationId = String(formData.get("location_id") ?? "") || null
  if (message.length < 2) redirect("/kunde/feedback?fejl=1")
  const db = createAdminClient()
  const customers = await customerIdsFor(org.id, user.id, user.email)
  let customerId: string | null = customers[0] ?? null
  if (locationId) {
    const { data: loc } = await db.from("locations").select("id, customer_id").eq("org_id", org.id).eq("id", locationId).maybeSingle()
    if (!loc || (loc.customer_id && !customers.includes(String(loc.customer_id)))) redirect("/kunde/feedback")
    customerId = (loc!.customer_id as string | null) ?? customerId
  }
  const { data: profile } = await db.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
  const { data: fb } = await db.from("customer_feedback").insert({ org_id: org.id, location_id: locationId, customer_id: customerId, author_user_id: user.id, author_name: profile?.full_name ?? user.email, message }).select("id").single()
  if (mailConfigured()) await new Resend(process.env.RESEND_API_KEY).emails.send({ from: orgSender(org, "noreply"), to: [officeEmailFor(org)], subject: "Ny feedback fra kundeportalen", text: `${profile?.full_name ?? user.email} skrev:\n\n${message}\n\nSe: ${appUrl()}/admin/feedback` }).catch(() => {})
  redirect(`/kunde/feedback?tak=${fb?.id ?? ""}`)
}

async function ownFeedback(feedbackId: string) {
  const { org, user } = await requireRoleAction(["customer", "admin"])
  const { data } = await createAdminClient().from("customer_feedback").select("id, location_id").eq("org_id", org.id).eq("id", feedbackId).eq("author_user_id", user.id).maybeSingle()
  if (!data) throw new Error("Ikke fundet")
  return { org, fb: data, user }
}

export async function customerUploadTarget(feedbackId: string) {
  const { org, fb } = await ownFeedback(feedbackId)
  return photoUploadTarget(org.id, `feedback/${fb.id}`, "image/jpeg")
}

export async function registerCustomerPhoto(feedbackId: string, path: string, _kind: string, caption: string) {
  const { org, fb, user } = await ownFeedback(feedbackId)
  if (!pathAllowed(org.id, `feedback/${fb.id}`, path)) return { ok: false, message: "Ugyldigt billede." }
  const { error } = await createAdminClient().from("photos").insert({ org_id: org.id, feedback_id: fb.id, location_id: fb.location_id, uploaded_by: user.id, kind: "customer", path, caption: caption.trim().slice(0, 200) || null })
  return { ok: !error, message: error?.message }
}

/** Extra job / order from the customer portal: lands in the inbox and the sales pipeline. */
export async function orderExtra(formData: FormData) {
  const { org, user, ctx } = await requireRoleAction(["customer", "admin"])
  if (await getViewAs(ctx)) redirect("/kunde/bestil")
  const db = createAdminClient()
  const customers = await customerIdsFor(org.id, user.id, user.email)
  const { data: cust } = customers.length ? await db.from("customers").select("id, name, company, email, phone").eq("org_id", org.id).eq("id", customers[0]).maybeSingle() : { data: null }
  const serviceIds = formData.getAll("service_id").map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v)).slice(0, 20)
  const { data: services } = serviceIds.length ? await db.from("services").select("name").eq("org_id", org.id).in("id", serviceIds) : { data: [] }
  const wish = String(formData.get("wish_date") ?? "").slice(0, 10)
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000)
  const locationId = String(formData.get("location_id") ?? "")
  const { data: loc } = /^[0-9a-f-]{36}$/i.test(locationId) ? await db.from("locations").select("name, customer_id").eq("org_id", org.id).eq("id", locationId).maybeSingle() : { data: null }
  if (loc?.customer_id && !customers.includes(String(loc.customer_id))) redirect("/kunde/bestil")
  if (!services?.length && note.length < 3) redirect(`/kunde/bestil?fejl=${encodeURIComponent("Vælg en opgave eller skriv hvad I ønsker.")}`)
  const { data: profile } = await db.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle()
  const message = [
    "Bestilling fra kundeportalen",
    services?.length ? `Opgaver: ${services.map((s) => s.name).join(", ")}` : "",
    loc ? `Sted: ${loc.name}` : "",
    /^\d{4}-\d{2}-\d{2}$/.test(wish) ? `Ønsket dato: ${wish}` : "",
    note,
  ].filter(Boolean).join("\n")
  const requestId = crypto.randomUUID()
  const name = profile?.full_name || cust?.name || user.email || "Kunde"
  const email = user.email || cust?.email || ""
  await db.from("contact_requests").insert({ id: requestId, org_id: org.id, name, email, phone: profile?.phone ?? cust?.phone ?? null, company: cust?.company ?? null, service: services?.map((s) => s.name).join(", ").slice(0, 80) || null, message, source: "kundeportal" })
  await db.from("leads").insert({ org_id: org.id, contact_request_id: requestId, name, company: cust?.company ?? null, email, phone: profile?.phone ?? null, message, source: "kundeportal", customer_id: cust?.id ?? null })
  if (mailConfigured()) await new Resend(process.env.RESEND_API_KEY).emails.send({ from: orgSender(org, "noreply"), to: [officeEmailFor(org)], subject: `Bestilling fra ${cust?.company || name}`, text: `${message}\n\nSvar i indbakken: ${appUrl()}/admin/mail/${requestId}` }).catch(() => {})
  redirect("/kunde/bestil?sendt=1")
}
