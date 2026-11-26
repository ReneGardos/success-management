"use server"

import { notifyAdmins, notifyCustomer, notifyUsers } from "@/lib/backend/notify"
import { getViewAs } from "@/lib/view-as"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { Resend } from "resend"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { mailConfigured, officeEmailFor } from "@/lib/backend/mail"
import { pathAllowed, photoUploadTarget } from "@/lib/backend/reports"
import { appUrl, orgSender, type Org } from "@/lib/org"

const text = (formData: FormData, key: string, max = 2000) => String(formData.get(key) ?? "").trim().slice(0, max)

async function ownReport(orgId: string, reportId: string, userId: string) {
  const { data } = await createAdminClient().from("cleaning_reports").select("id, job_id, location_id, employee_id, status").eq("org_id", orgId).eq("id", reportId).maybeSingle()
  if (!data || data.employee_id !== userId) throw new Error("Rapporten er ikke din.")
  return data
}

async function notifyOffice(org: Org, subject: string, body: string) {
  if (!mailConfigured()) return
  await new Resend(process.env.RESEND_API_KEY).emails.send({ from: orgSender(org, "noreply"), to: [officeEmailFor(org)], subject, text: body }).catch(() => {})
}

/** Opens a missing supply request once per product and location. */
async function openSupplyRequest(org: Org, fields: { location_id: string | null; job_id: string | null; report_id: string | null; product_id: string | null; employee_id: string; message: string; urgent: boolean }) {
  const db = createAdminClient()
  if (fields.product_id && fields.location_id) {
    const { data: open } = await db.from("supply_requests").select("id").eq("org_id", org.id).eq("location_id", fields.location_id).eq("product_id", fields.product_id).neq("status", "done").limit(1)
    if (open?.length) return false
  }
  await db.from("supply_requests").insert({ org_id: org.id, ...fields })
  return true
}

export async function saveReport(formData: FormData) {
  const { org, user, ctx } = await requireRoleAction(["employee", "admin"])
  if (await getViewAs(ctx)) redirect("/medarbejder")
  const reportId = text(formData, "report_id", 64)
  const report = await ownReport(org.id, reportId, user.id)
  const db = createAdminClient()

  // Checklist
  const { data: items } = await db.from("cleaning_report_items").select("id").eq("org_id", org.id).eq("report_id", reportId)
  for (const it of items ?? []) {
    const done = formData.get(`done_${it.id}`) === "on"
    const note = text(formData, `note_${it.id}`, 500) || null
    await db.from("cleaning_report_items").update({ done, note }).eq("org_id", org.id).eq("id", it.id)
  }

  // Products: status on site and quantity taken
  const productIds = formData.getAll("product_id").map(String).filter(Boolean)
  const newlyMissing: string[] = []
  for (const pid of productIds) {
    const status = ["ok", "low", "missing"].includes(text(formData, `status_${pid}`, 10)) ? text(formData, `status_${pid}`, 10) : "ok"
    const qty = Math.max(0, Number(text(formData, `taken_${pid}`, 10).replace(",", ".")) || 0)
    await db.from("report_products").upsert({ org_id: org.id, report_id: reportId, product_id: pid, status, qty_taken: qty }, { onConflict: "report_id,product_id" })
    if (report.location_id) {
      await db.from("location_products").upsert({ org_id: org.id, location_id: report.location_id, product_id: pid, status, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: "location_id,product_id" })
      if (status !== "ok") {
        const created = await openSupplyRequest(org, { location_id: report.location_id, job_id: report.job_id, report_id: reportId, product_id: pid, employee_id: user.id, message: status === "missing" ? "Mangler" : "Snart tom", urgent: status === "missing" })
        if (created) newlyMissing.push(pid)
      }
    }
  }

  const submit = text(formData, "intent", 20) === "submit"
  await db.from("cleaning_reports").update({ note: text(formData, "note", 4000) || null, updated_at: new Date().toISOString(), ...(submit ? { status: "submitted", submitted_at: new Date().toISOString() } : {}) }).eq("org_id", org.id).eq("id", reportId)

  if (submit) {
    const { data: r } = await db.from("cleaning_reports").select("customer_visible, location:locations(name, customer_id)").eq("org_id", org.id).eq("id", reportId).maybeSingle()
    const loc = r?.location as unknown as { name: string; customer_id: string | null } | null
    const { data: me } = await db.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
    await notifyAdmins(org, { kind: "report", title: `Rapport fra ${loc?.name ?? "et sted"}`, body: `${me?.full_name ?? "En medarbejder"} har afsluttet rengøringen.`, href: `/admin/rapporter/${reportId}` }, user.id)
    if (r?.customer_visible && loc?.customer_id) await notifyCustomer(org, loc.customer_id, { kind: "report", title: "Rengøringen er udført", body: `Se rapporten for ${loc.name}.`, href: "/kunde/rapporter" })
  }
  if (newlyMissing.length) {
    const { data: names } = await db.from("products").select("name").eq("org_id", org.id).in("id", newlyMissing)
    const { data: loc } = report.location_id ? await db.from("locations").select("name").eq("org_id", org.id).eq("id", report.location_id).maybeSingle() : { data: null }
    await notifyOffice(org, `Mangler på ${loc?.name ?? "et sted"}: ${(names ?? []).map((n) => n.name).join(", ")}`, `En medarbejder har meldt mangler.\n\nSe forsyning: ${appUrl()}/admin/forsyning`)
  }
  revalidatePath("/medarbejder")
  revalidatePath("/admin/rapporter")
  redirect(submit ? "/medarbejder?rapport=sendt" : `/medarbejder/rapport/${report.job_id}?gemt=1`)
}

export async function reportUploadTarget(reportId: string) {
  const { org, user } = await requireRoleAction(["employee", "admin"])
  await ownReport(org.id, reportId, user.id)
  return photoUploadTarget(org.id, `reports/${reportId}`, "image/jpeg")
}

export async function registerReportPhoto(reportId: string, path: string, kind: string, caption: string) {
  const { org, user } = await requireRoleAction(["employee", "admin"])
  const report = await ownReport(org.id, reportId, user.id)
  if (!pathAllowed(org.id, `reports/${reportId}`, path)) return { ok: false, message: "Ugyldigt billede." }
  const { error } = await createAdminClient().from("photos").insert({ org_id: org.id, report_id: reportId, location_id: report.location_id, uploaded_by: user.id, kind: ["issue", "unusual", "before", "after"].includes(kind) ? kind : "issue", path, caption: caption.trim().slice(0, 200) || null })
  if (!error && kind === "issue") await notifyOffice(org, "Nyt billede af et problem fra en medarbejder", `Se rapporten: ${appUrl()}/admin/rapporter/${reportId}`)
  return { ok: !error, message: error?.message }
}

/** "Mangler noget?" – free-text or product request from an employee. */
export async function requestSupply(formData: FormData) {
  const { org, user, ctx } = await requireRoleAction(["employee", "admin"])
  if (await getViewAs(ctx)) redirect("/medarbejder/mangler")
  const db = createAdminClient()
  const locationId = text(formData, "location_id", 64) || null
  const productId = text(formData, "product_id", 64) || null
  const message = text(formData, "message", 1000)
  if (!message && !productId) redirect(`/medarbejder/mangler?fejl=${encodeURIComponent("Skriv hvad der mangler.")}`)
  if (locationId) {
    const { data } = await db.from("locations").select("id").eq("org_id", org.id).eq("id", locationId).maybeSingle()
    if (!data) redirect("/medarbejder/mangler")
  }
  const urgent = formData.get("urgent") === "on"
  await db.from("supply_requests").insert({ org_id: org.id, location_id: locationId, product_id: productId, employee_id: user.id, message: message || "Mangler", urgent })
  if (locationId && productId) await db.from("location_products").upsert({ org_id: org.id, location_id: locationId, product_id: productId, status: "missing", updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: "location_id,product_id" })
  await notifyAdmins(org, { kind: "supply", title: `${urgent ? "HASTER: " : ""}Mangler`, body: message || "En medarbejder mangler noget.", href: "/admin/forsyning" }, user.id)
  await notifyOffice(org, `${urgent ? "HASTER: " : ""}Medarbejder mangler noget`, `${message}\n\nSe forsyning: ${appUrl()}/admin/forsyning`)
  revalidatePath("/admin/forsyning")
  redirect("/medarbejder?mangler=sendt")
}
