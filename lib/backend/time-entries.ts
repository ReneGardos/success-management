import { createAdminClient } from "@/lib/supabase/admin"

export type TimeEntry = {
  id: string
  job_id: string | null
  employee_id: string
  check_in_at: string
  check_out_at: string | null
  check_in_distance_m: number | null
  check_out_distance_m: number | null
  check_in_accuracy_m: number | null
  note: string | null
  job: { title: string | null; customer_name: string | null; address: string | null; scheduled_start: string | null; scheduled_end: string | null; location: { name: string; address: string; radius_m: number } | null } | null
}

export async function loadTimeEntries(orgId: string, fromIso: string, toIso: string, employeeId?: string) {
  let query = createAdminClient()
    .from("time_entries")
    .select("*, job:jobs(title, customer_name, address, scheduled_start, scheduled_end, location:locations(name, address, radius_m))")
    .eq("org_id", orgId)
    .gte("check_in_at", fromIso)
    .lt("check_in_at", toIso)
    .order("check_in_at", { ascending: false })
    .limit(5000)
  if (employeeId) query = query.eq("employee_id", employeeId)
  const { data, error } = await query
  return { entries: (data ?? []) as unknown as TimeEntry[], error: error?.message ?? null }
}

export const entryDurationMs = (e: TimeEntry) => (e.check_out_at ? new Date(e.check_out_at).getTime() : Date.now()) - new Date(e.check_in_at).getTime()
export const entryPlace = (e: TimeEntry) => e.job?.location?.name ?? e.job?.title ?? e.job?.customer_name ?? "Uden vagt"
export function entryFarAway(e: TimeEntry) {
  const radius = e.job?.location?.radius_m ?? 200
  return (e.check_in_distance_m ?? 0) > radius || (e.check_out_distance_m ?? 0) > radius
}
