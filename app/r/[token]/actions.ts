"use server"

import { redirect } from "next/navigation"
import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
import { mailConfigured, officeEmailFor } from "@/lib/backend/mail"
import { pathAllowed, photoUploadTarget } from "@/lib/backend/reports"
import { appUrl, loadOrgById, orgSender } from "@/lib/org"
import { isRateLimited } from "@/lib/backend/rate-limit"
import { notifyAdmins } from "@/lib/backend/notify"

async function reportFor(token: string) {
  if (!/^[a-f0-9]{20,64}$/.test(token)) return null
  const { data } = await createAdminClient().from("cleaning_reports").select("id, org_id, location_id, customer_visible, status").eq("public_token", token).maybeSingle()
  return data && data.customer_visible ? data : null
}

/** Feedback from the public report link (no login). */
export async function submitReportFeedback(token: string, formData: FormData) {
  const report = await reportFor(token)
  if (!report) redirect("/")
  const message = String(formData.get("message") ?? "").trim().slice(0, 2000)
  const name = String(formData.get("name") ?? "").trim().slice(0, 120) || null
  if (message.length < 2) redirect(`/r/${token}?fejl=1#feedback`)
  if (isRateLimited(`fb|${token}`, 10, 60 * 60 * 1000)) redirect(`/r/${token}?fejl=2#feedback`)
  const db = createAdminClient()
  const { data: loc } = report!.location_id ? await db.from("locations").select("customer_id, name").eq("id", report!.location_id).maybeSingle() : { data: null }
  const { data: fb } = await db.from("customer_feedback").insert({ org_id: report!.org_id, report_id: report!.id, location_id: report!.location_id, customer_id: loc?.customer_id ?? null, author_name: name, message }).select("id").single()
  const org = await loadOrgById(report!.org_id)
  if (org && mailConfigured()) await new Resend(process.env.RESEND_API_KEY).emails.send({ from: orgSender(org, "noreply"), to: [officeEmailFor(org)], subject: `Feedback fra kunden${loc?.name ? ` – ${loc.name}` : ""}`, text: `${name ?? "En kunde"} skrev:\n\n${message}\n\nSe: ${appUrl()}/admin/feedback` }).catch(() => {})
  redirect(`/r/${token}?tak=${fb?.id ?? ""}#feedback`)
}

async function feedbackFor(token: string, feedbackId: string) {
  const report = await reportFor(token)
  if (!report || !/^[0-9a-f-]{36}$/i.test(feedbackId)) throw new Error("Ikke fundet")
  const { data } = await createAdminClient().from("customer_feedback").select("id, org_id, location_id, created_at").eq("id", feedbackId).eq("report_id", report.id).maybeSingle()
  // Photos can be added for a short while after the feedback was written.
  if (!data || Date.now() - new Date(data.created_at).getTime() > 2 * 60 * 60 * 1000) throw new Error("Tiden til at tilføje billeder er udløbet.")
  return data
}

export async function feedbackUploadTarget(token: string, feedbackId: string) {
  const fb = await feedbackFor(token, feedbackId)
  return photoUploadTarget(fb.org_id, `feedback/${fb.id}`, "image/jpeg")
}

export async function registerFeedbackPhoto(token: string, feedbackId: string, path: string, _kind: string, caption: string) {
  const fb = await feedbackFor(token, feedbackId)
  if (!pathAllowed(fb.org_id, `feedback/${fb.id}`, path)) return { ok: false, message: "Ugyldigt billede." }
  const { error } = await createAdminClient().from("photos").insert({ org_id: fb.org_id, feedback_id: fb.id, location_id: fb.location_id, kind: "customer", path, caption: caption.trim().slice(0, 200) || null })
  return { ok: !error, message: error?.message }
}

/** Star rating (1–5) + optional comment for a visit, from the report link or the customer portal. */
export async function rateReport(token: string, formData: FormData) {
  const report = await reportFor(token)
  if (!report || report.status !== "submitted") redirect("/")
  const rating = Number(formData.get("rating"))
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 1000) || null
  const back = String(formData.get("back") ?? "") === "/kunde/rapporter" ? "/kunde/rapporter" : `/r/${token}`
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) redirect(`${back}?fejl=3#bedom`)
  if (isRateLimited(`rate|${token}`, 10, 60 * 60 * 1000)) redirect(`${back}?fejl=2#bedom`)
  const db = createAdminClient()
  const { data: prev } = await db.from("cleaning_reports").select("customer_rating").eq("id", report!.id).maybeSingle()
  await db.from("cleaning_reports").update({ customer_rating: rating, customer_comment: comment, rated_at: new Date().toISOString() }).eq("id", report!.id)
  const org = await loadOrgById(report!.org_id)
  if (org && !prev?.customer_rating) {
    const { data: loc } = report!.location_id ? await db.from("locations").select("name").eq("id", report!.location_id).maybeSingle() : { data: null }
    await notifyAdmins(org, { kind: "report", title: `${"★".repeat(rating)}${"☆".repeat(5 - rating)} ${loc?.name ?? "Besøg"}`, body: comment ?? (rating <= 3 ? "Lav bedømmelse – tag fat i kunden." : "Kunden har bedømt besøget."), href: `/admin/rapporter/${report!.id}` })
  }
  redirect(`${back}?bedomt=1#bedom`)
}
