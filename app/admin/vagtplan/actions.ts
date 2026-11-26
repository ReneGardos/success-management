"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { addDays, copenhagenToIso } from "@/lib/time"
import { expandDates, MAX_OCCURRENCES, repeatOptions, type RepeatRule } from "@/lib/recurrence"

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim()
const statuses = ["scheduled", "in_progress", "completed", "cancelled"]

/** Only allow returning to the shift plan itself (no open redirects). */
function safeBack(formData: FormData) {
  const back = text(formData, "back")
  return back.startsWith("/admin/vagtplan") && !back.includes("//") ? back : "/admin/vagtplan"
}

/** Keeps only user IDs that are staff in this organization. */
async function onlyStaff(orgId: string, ids: string[]) {
  if (!ids.length) return []
  const { data } = await createAdminClient().from("memberships").select("user_id").eq("org_id", orgId).neq("role", "customer").in("user_id", ids)
  const ok = new Set((data ?? []).map((m) => String(m.user_id)))
  return ids.filter((id) => ok.has(id))
}

function refresh() {
  revalidatePath("/admin", "layout")
  revalidatePath("/medarbejder")
}

export async function createShifts(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const back = safeBack(formData)
  const fail = (message: string): never => redirect(`${back}${back.includes("?") ? "&" : "?"}fejl=${encodeURIComponent(message)}`)

  const selected = formData.getAll("dates").map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  const start = text(formData, "start")
  const end = text(formData, "end")
  const locationId = text(formData, "location_id")
  const address = text(formData, "address")
  if (!selected.length) fail("Vælg mindst én dag i kalenderen.")
  if (!start) fail("Vælg starttidspunkt.")
  if (!locationId && !address) fail("Vælg et sted eller skriv en adresse.")

  const rule = (repeatOptions.some((o) => o.value === text(formData, "repeat")) ? text(formData, "repeat") : "none") as RepeatRule
  const until = text(formData, "until")
  if (rule !== "none" && !/^\d{4}-\d{2}-\d{2}$/.test(until)) fail("Vælg hvor længe vagterne skal gentages.")
  const dates = expandDates(selected, rule, until)
  if (dates.length >= MAX_OCCURRENCES) fail(`For mange vagter på én gang (maks ${MAX_OCCURRENCES}). Vælg en kortere periode.`)

  const db = createAdminClient()
  let locationName: string | null = null
  if (locationId) {
    const { data: loc } = await db.from("locations").select("name").eq("org_id", org.id).eq("id", locationId).maybeSingle()
    if (!loc) fail("Stedet findes ikke.")
    locationName = loc?.name ?? null
  }
  const seriesId = dates.length > 1 ? randomUUID() : null
  const employees = await onlyStaff(org.id, formData.getAll("employees").map(String).filter(Boolean))
  const maxStaff = Math.min(20, Math.max(1, Number(text(formData, "max_staff")) || Math.max(1, employees.length)))
  const isOpen = text(formData, "is_open") === "on" && employees.length < maxStaff

  const rows = dates.map((d) => {
    const startIso = copenhagenToIso(d, start)
    let endIso = end ? copenhagenToIso(d, end) : null
    if (startIso && endIso && endIso <= startIso) endIso = copenhagenToIso(addDays(d, 1), end) // over midnight
    return {
      org_id: org.id,
      title: text(formData, "title") || locationName,
      location_id: locationId || null,
      address: locationId ? null : address,
      customer_name: locationName,
      notes: text(formData, "notes") || null,
      scheduled_start: startIso,
      scheduled_end: endIso,
      status: "scheduled",
      is_open: isOpen,
      max_staff: maxStaff,
      series_id: seriesId,
    }
  })
  const { data: created, error } = await db.from("jobs").insert(rows).select("id")
  if (error || !created) fail(`Vagterne blev ikke oprettet: ${error?.message ?? "ukendt fejl"}`)
  if (employees.length) {
    const { error: assignError } = await db.from("job_assignments").insert(created!.flatMap((job) => employees.map((employee_id) => ({ org_id: org.id, job_id: job.id, employee_id }))))
    if (assignError) fail(`Vagterne er oprettet, men tildeling fejlede: ${assignError.message}`)
  }
  refresh()
  redirect(`${back}${back.includes("?") ? "&" : "?"}oprettet=${created!.length}`)
}

export async function updateShift(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id")
  const week = text(formData, "uge")
  if (!id) return
  const db = createAdminClient()
  const employees = await onlyStaff(org.id, formData.getAll("employees").map(String).filter(Boolean))
  const maxStaff = Math.min(20, Math.max(1, Number(text(formData, "max_staff")) || 1))
  const status = text(formData, "status")
  const date = text(formData, "date")
  const start = text(formData, "start")
  const end = text(formData, "end")

  const update: Record<string, unknown> = {
    title: text(formData, "title") || null,
    notes: text(formData, "notes") || null,
    max_staff: maxStaff,
    is_open: text(formData, "is_open") === "on" && employees.length < maxStaff,
    updated_at: new Date().toISOString(),
  }
  if (statuses.includes(status)) {
    update.status = status
    update.completed_at = status === "completed" ? new Date().toISOString() : null
  }
  if (date && start) {
    update.scheduled_start = copenhagenToIso(date, start)
    let endIso = end ? copenhagenToIso(date, end) : null
    if (endIso && update.scheduled_start && endIso <= (update.scheduled_start as string)) endIso = copenhagenToIso(addDays(date, 1), end)
    update.scheduled_end = endIso
  }
  const { data: updated, error } = await db.from("jobs").update(update).eq("org_id", org.id).eq("id", id).select("id")
  if (error) redirect(`${safeBack(formData)}${safeBack(formData).includes("?") ? "&" : "?"}fejl=${encodeURIComponent(error.message)}`)
  if (!updated?.length) return
  await db.from("job_assignments").delete().eq("org_id", org.id).eq("job_id", id)
  if (employees.length) await db.from("job_assignments").insert(employees.map((employee_id) => ({ org_id: org.id, job_id: id, employee_id })))
  refresh()
  redirect(`${safeBack(formData)}${safeBack(formData).includes("?") ? "&" : "?"}gemt=1`)
}

export async function deleteShift(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id")
  const week = text(formData, "uge")
  const scope = text(formData, "scope")
  if (!id) return
  const db = createAdminClient()
  const { data: job } = await db.from("jobs").select("series_id, scheduled_start").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!job) return
  let ids = [id]
  if (scope === "series" && job?.series_id) {
    const { data: future } = await db.from("jobs").select("id").eq("org_id", org.id).eq("series_id", job.series_id).gte("scheduled_start", job.scheduled_start)
    ids = (future ?? []).map((j) => String(j.id))
  }
  await db.from("job_assignments").delete().eq("org_id", org.id).in("job_id", ids)
  await db.from("time_entries").update({ job_id: null }).eq("org_id", org.id).in("job_id", ids)
  await db.from("jobs").delete().eq("org_id", org.id).in("id", ids)
  refresh()
  redirect(`${safeBack(formData)}${safeBack(formData).includes("?") ? "&" : "?"}slettet=${ids.length}`)
}

/** Assign (or remove) one employee on the existing shifts of the selected days. */
export async function assignEmployeeToDays(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const back = safeBack(formData)
  const sep = back.includes("?") ? "&" : "?"
  const employeeId = text(formData, "employee_id")
  const mode = text(formData, "mode") === "remove" ? "remove" : "add"
  const scope = text(formData, "scope")
  const locationId = text(formData, "location_id")
  const dates = formData.getAll("dates").map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  if (!employeeId || !(await onlyStaff(org.id, [employeeId])).length) redirect(`${back}${sep}fejl=${encodeURIComponent("Vælg en medarbejder.")}`)
  if (!dates.length) redirect(`${back}${sep}fejl=${encodeURIComponent("Vælg mindst én dag.")}`)

  const db = createAdminClient()
  // Fetch shifts in the outer date range, then keep only those on the selected local days.
  const from = copenhagenToIso(dates[0], "00:00")!
  const to = copenhagenToIso(addDays(dates[dates.length - 1], 1), "00:00")!
  let query = db.from("jobs").select("id, scheduled_start, max_staff, status").eq("org_id", org.id).gte("scheduled_start", from).lt("scheduled_start", to).neq("status", "cancelled")
  if (locationId) query = query.eq("location_id", locationId)
  const { data: jobs, error } = await query
  if (error) redirect(`${back}${sep}fejl=${encodeURIComponent(error.message)}`)
  const daySet = new Set(dates)
  const local = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" })
  let targets = (jobs ?? []).filter((j) => j.scheduled_start && daySet.has(local(j.scheduled_start)))
  const ids = targets.map((j) => String(j.id))
  const { data: existing } = ids.length ? await db.from("job_assignments").select("job_id, employee_id").eq("org_id", org.id).in("job_id", ids) : { data: [] }
  const countByJob = new Map<string, number>()
  const mine = new Set<string>()
  for (const a of existing ?? []) {
    countByJob.set(String(a.job_id), (countByJob.get(String(a.job_id)) ?? 0) + 1)
    if (a.employee_id === employeeId) mine.add(String(a.job_id))
  }

  if (mode === "remove") {
    const remove = targets.filter((j) => mine.has(String(j.id))).map((j) => String(j.id))
    if (remove.length) {
      await db.from("job_assignments").delete().eq("org_id", org.id).eq("employee_id", employeeId).in("job_id", remove)
      await db.from("jobs").update({ is_open: true }).eq("org_id", org.id).in("id", remove)
    }
    refresh()
    redirect(`${back}${sep}tildelt=${encodeURIComponent(`Fjernet fra ${remove.length} vagt${remove.length === 1 ? "" : "er"}`)}`)
  }

  if (scope === "open") targets = targets.filter((j) => (countByJob.get(String(j.id)) ?? 0) < Number(j.max_staff ?? 1))
  const add = targets.filter((j) => !mine.has(String(j.id)))
  if (add.length) {
    const { error: insertError } = await db.from("job_assignments").insert(add.map((j) => ({ org_id: org.id, job_id: j.id, employee_id: employeeId })))
    if (insertError) redirect(`${back}${sep}fejl=${encodeURIComponent(insertError.message)}`)
    const full = add.filter((j) => (countByJob.get(String(j.id)) ?? 0) + 1 >= Number(j.max_staff ?? 1)).map((j) => String(j.id))
    if (full.length) await db.from("jobs").update({ is_open: false }).eq("org_id", org.id).in("id", full)
  }
  refresh()
  const none = targets.length === 0 ? " – der var ingen vagter på de valgte dage. Brug 'Opret nye vagter' i stedet." : ""
  redirect(`${back}${sep}tildelt=${encodeURIComponent(`Tildelt ${add.length} vagt${add.length === 1 ? "" : "er"}${none}`)}`)
}
