"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { notifyCustomer, notifyUsers } from "@/lib/backend/notify"
import { pathAllowed, photoUploadTarget } from "@/lib/backend/reports"

const DEFAULT: [string, string][] = [
  ["Indgang og gange", "Gulve"], ["Indgang og gange", "Måtter og indgangsparti"], ["Indgang og gange", "Glasdøre og håndtag"],
  ["Arbejdspladser", "Skriveborde og flader"], ["Arbejdspladser", "Affald tømt"], ["Arbejdspladser", "Gulve"],
  ["Toiletter", "Toiletter"], ["Toiletter", "Håndvask og spejl"], ["Toiletter", "Sæbe og papir fyldt op"],
  ["Køkken", "Bordplader og vask"], ["Køkken", "Fronter og køleskab"],
  ["Generelt", "Støv på flader"], ["Generelt", "Samlet indtryk"],
]

/** Starts an inspection at a location with its own task list (or a standard list). */
export async function startInspection(formData: FormData) {
  const { org, user } = await requireRoleAction(["admin"])
  const db = createAdminClient()
  const locationId = String(formData.get("location_id") ?? "")
  const { data: loc } = await db.from("locations").select("id").eq("org_id", org.id).eq("id", locationId).maybeSingle()
  if (!loc) redirect("/admin/kvalitet?fejl=Vælg+et+sted")
  // Who cleaned last: the most recent report at the location.
  const { data: lastReport } = await db.from("cleaning_reports").select("employee_id, job_id").eq("org_id", org.id).eq("location_id", loc!.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
  const { data: tasks } = await db.from("location_tasks").select("label, area").eq("org_id", org.id).eq("location_id", loc!.id).eq("active", true).order("position").limit(40)
  const rows: [string, string][] = tasks?.length ? tasks.map((t) => [t.area || "Opgaver", t.label]) : DEFAULT
  const { data: insp } = await db.from("quality_inspections").insert({ org_id: org.id, location_id: loc!.id, inspector_id: user.id, employee_id: lastReport?.employee_id ?? null, job_id: lastReport?.job_id ?? null }).select("id").single()
  await db.from("quality_items").insert(rows.map(([area, label], i) => ({ org_id: org.id, inspection_id: insp!.id, area, label, position: i })))
  redirect(`/admin/kvalitet/${insp!.id}`)
}

export async function saveInspection(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const db = createAdminClient()
  const id = String(formData.get("id") ?? "")
  const { data: insp } = await db.from("quality_inspections").select("id, status, location_id, employee_id, share_with_customer").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!insp) redirect("/admin/kvalitet")
  const { data: items } = await db.from("quality_items").select("id").eq("org_id", org.id).eq("inspection_id", id)
  const scores: number[] = []
  for (const it of items ?? []) {
    const raw = String(formData.get(`score_${it.id}`) ?? "")
    const score = /^[1-5]$/.test(raw) ? Number(raw) : null
    if (score) scores.push(score)
    await db.from("quality_items").update({ score, note: String(formData.get(`note_${it.id}`) ?? "").trim().slice(0, 500) || null }).eq("id", it.id)
  }
  const done = String(formData.get("intent")) === "done"
  const score = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / (scores.length * 5)) * 1000) / 10 : null
  const empId = String(formData.get("employee_id") ?? "")
  const share = formData.get("share") === "on"
  await db.from("quality_inspections").update({
    score, note: String(formData.get("note") ?? "").trim().slice(0, 3000) || null, share_with_customer: share,
    employee_id: /^[0-9a-f-]{36}$/i.test(empId) ? empId : null,
    ...(done ? { status: "done", completed_at: new Date().toISOString() } : {}),
  }).eq("id", id)
  if (done && insp!.status !== "done") {
    const { data: loc } = insp!.location_id ? await db.from("locations").select("name, customer_id").eq("id", insp!.location_id).maybeSingle() : { data: null }
    const emp = /^[0-9a-f-]{36}$/i.test(empId) ? empId : insp!.employee_id
    if (emp) await notifyUsers(org, [emp], { kind: "report", title: `Kvalitetskontrol: ${score ?? "–"} %`, body: `${loc?.name ?? ""}${score && score >= 90 ? " – flot arbejde! 🌟" : ""}`, href: "/medarbejder/kurser" })
    if (share && loc?.customer_id) await notifyCustomer(org, loc.customer_id, { kind: "report", title: `Kvalitetskontrol udført: ${score ?? "–"} %`, body: loc.name, href: "/kunde/rapporter" })
  }
  revalidatePath("/admin/kvalitet")
  redirect(done ? `/admin/kvalitet/${id}?afsluttet=1` : `/admin/kvalitet/${id}?gemt=1`)
}

export async function qualityUploadTarget(id: string) {
  const { org } = await requireRoleAction(["admin"])
  return photoUploadTarget(org.id, `quality/${id}`, "image/jpeg")
}

export async function registerQualityPhoto(id: string, path: string, _kind: string, caption: string) {
  const { org, user } = await requireRoleAction(["admin"])
  if (!pathAllowed(org.id, `quality/${id}`, path)) return { ok: false, message: "Ugyldigt billede." }
  const db = createAdminClient()
  const { data: insp } = await db.from("quality_inspections").select("location_id").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!insp) return { ok: false, message: "Ikke fundet." }
  const { error } = await db.from("photos").insert({ org_id: org.id, inspection_id: id, location_id: insp.location_id, uploaded_by: user.id, kind: "quality", path, caption: caption.trim().slice(0, 200) || null })
  return { ok: !error, message: error?.message }
}

export async function deleteInspection(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  await createAdminClient().from("quality_inspections").delete().eq("org_id", org.id).eq("id", String(formData.get("id") ?? ""))
  redirect("/admin/kvalitet")
}
