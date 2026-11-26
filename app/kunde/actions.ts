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
  if (await getViewAs(ctx)) redirect("/kunde")
  const message = String(formData.get("message") ?? "").trim().slice(0, 2000)
  const locationId = String(formData.get("location_id") ?? "") || null
  if (message.length < 2) redirect("/kunde?fejl=1#feedback")
  const db = createAdminClient()
  const customers = await customerIdsFor(org.id, user.id, user.email)
  let customerId: string | null = customers[0] ?? null
  if (locationId) {
    const { data: loc } = await db.from("locations").select("id, customer_id").eq("org_id", org.id).eq("id", locationId).maybeSingle()
    if (!loc || (loc.customer_id && !customers.includes(String(loc.customer_id)))) redirect("/kunde")
    customerId = (loc!.customer_id as string | null) ?? customerId
  }
  const { data: profile } = await db.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
  const { data: fb } = await db.from("customer_feedback").insert({ org_id: org.id, location_id: locationId, customer_id: customerId, author_user_id: user.id, author_name: profile?.full_name ?? user.email, message }).select("id").single()
  if (mailConfigured()) await new Resend(process.env.RESEND_API_KEY).emails.send({ from: orgSender(org, "noreply"), to: [officeEmailFor(org)], subject: "Ny feedback fra kundeportalen", text: `${profile?.full_name ?? user.email} skrev:\n\n${message}\n\nSe: ${appUrl()}/admin/feedback` }).catch(() => {})
  redirect(`/kunde?tak=${fb?.id ?? ""}#feedback`)
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
