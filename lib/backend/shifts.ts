import { createAdminClient } from "@/lib/supabase/admin"

export type Location = { id: string; name: string; address: string; lat: number | null; lng: number | null; radius_m: number; contact_name: string | null; contact_phone: string | null; access_notes: string | null; active: boolean }
export type Shift = {
  id: string
  title: string | null
  customer_name: string | null
  address: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  notes: string | null
  status: string
  is_open: boolean
  max_staff: number
  series_id: string | null
  location_id: string | null
  employee_note: string | null
  location: Location | null
  employeeIds: string[]
}

/** Shifts in one organization between two ISO timestamps, with location and assigned employees. */
export async function loadShifts(orgId: string, fromIso: string, toIso: string, opts: { onlyIds?: string[]; onlyOpen?: boolean } = {}) {
  const db = createAdminClient()
  let query = db.from("jobs").select("*, location:locations(*)").eq("org_id", orgId).gte("scheduled_start", fromIso).lt("scheduled_start", toIso).order("scheduled_start", { ascending: true }).limit(1000)
  if (opts.onlyIds) query = query.in("id", opts.onlyIds.length ? opts.onlyIds : ["00000000-0000-0000-0000-000000000000"])
  if (opts.onlyOpen) query = query.eq("is_open", true).neq("status", "cancelled")
  const { data, error } = await query
  if (error) return { shifts: [] as Shift[], error: error.message }
  const ids = (data ?? []).map((j) => String(j.id))
  const { data: assignments } = ids.length ? await db.from("job_assignments").select("job_id, employee_id").eq("org_id", orgId).in("job_id", ids) : { data: [] }
  const byJob = new Map<string, string[]>()
  for (const a of assignments ?? []) byJob.set(String(a.job_id), [...(byJob.get(String(a.job_id)) ?? []), String(a.employee_id)])
  const shifts = (data ?? []).map((j) => ({ ...j, is_open: Boolean(j.is_open), max_staff: Number(j.max_staff ?? 1), location: (j.location as Location | null) ?? null, employeeIds: byJob.get(String(j.id)) ?? [] })) as Shift[]
  return { shifts, error: null as string | null }
}

export async function loadLocations(orgId: string, activeOnly = true) {
  let query = createAdminClient().from("locations").select("*").eq("org_id", orgId).order("name")
  if (activeOnly) query = query.eq("active", true)
  const { data, error } = await query
  return { locations: (data ?? []) as Location[], error: error?.message ?? null }
}

export const shiftAddress = (s: Shift) => s.location?.address ?? s.address ?? ""
export const shiftName = (s: Shift) => s.title || s.location?.name || s.customer_name || "Vagt"
