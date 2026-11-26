import { createAdminClient } from "@/lib/supabase/admin"
import { mondayOf } from "@/lib/time"

export type PayrollSettings = { default_wage: number; evening_start: number; evening_end: number; evening_supplement: number; weekend_supplement: number; overtime_after_hours: number; overtime_pct: number; km_rate: number; labor_overhead_pct: number }
export const defaultPayroll: PayrollSettings = { default_wage: 165, evening_start: 18, evening_end: 6, evening_supplement: 25, weekend_supplement: 45, overtime_after_hours: 37, overtime_pct: 50, km_rate: 3.79, labor_overhead_pct: 25 }
export type EmployeePay = { employee_id: string; hourly_wage: number | null; weekly_hours: number | null; payroll_no: string | null }
export type Entry = { id: string; employee_id: string; job_id: string | null; check_in_at: string; check_out_at: string | null; km: number; break_min: number; approved_at: string | null }
export type PayLine = { employee_id: string; hours: number; evening: number; weekend: number; overtime: number; km: number; wage: number; base: number; supplements: number; overtimePay: number; kmPay: number; gross: number; cost: number; entries: number; unapproved: number }

export async function loadPayrollSettings(orgId: string): Promise<PayrollSettings> {
  const { data } = await createAdminClient().from("org_payroll_settings").select("*").eq("org_id", orgId).maybeSingle()
  const merged = { ...defaultPayroll, ...(data ?? {}) } as Record<string, unknown>
  return Object.fromEntries(Object.keys(defaultPayroll).map((k) => [k, Number(merged[k])])) as PayrollSettings
}

export async function loadEmployeePay(orgId: string) {
  const { data } = await createAdminClient().from("employee_pay").select("employee_id, hourly_wage, weekly_hours, payroll_no").eq("org_id", orgId)
  return new Map((data ?? []).map((p) => [String(p.employee_id), { ...p, hourly_wage: p.hourly_wage === null ? null : Number(p.hourly_wage), weekly_hours: p.weekly_hours === null ? null : Number(p.weekly_hours) } as EmployeePay]))
}

const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", hour: "2-digit", hour12: false, weekday: "short" })
function slot(t: number) {
  const parts = fmt.formatToParts(new Date(t))
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon"
  return { hour, weekend: wd === "Sat" || wd === "Sun" }
}

/** Splits one entry into total / evening / weekend hours (15-minute resolution, Danish local time). */
export function splitEntry(e: Pick<Entry, "check_in_at" | "check_out_at" | "break_min">, s: PayrollSettings) {
  if (!e.check_out_at) return { hours: 0, evening: 0, weekend: 0 }
  const a = new Date(e.check_in_at).getTime(), b = new Date(e.check_out_at).getTime()
  if (!(b > a)) return { hours: 0, evening: 0, weekend: 0 }
  const step = 15 * 60000
  let evening = 0, weekend = 0, total = 0
  for (let t = a; t < b; t += step) {
    const len = Math.min(step, b - t) / 3600000
    const { hour, weekend: we } = slot(t + Math.min(step, b - t) / 2)
    total += len
    if (we) weekend += len
    else if (hour >= s.evening_start || hour < s.evening_end) evening += len
  }
  const factor = total ? Math.max(0, total - (e.break_min || 0) / 60) / total : 0
  return { hours: total * factor, evening: evening * factor, weekend: weekend * factor }
}

/** Gross pay and employer cost per employee for a set of time entries. */
export function computePayroll(entries: Entry[], s: PayrollSettings, pay: Map<string, EmployeePay>): PayLine[] {
  const by = new Map<string, Entry[]>()
  for (const e of entries) by.set(e.employee_id, [...(by.get(e.employee_id) ?? []), e])
  const out: PayLine[] = []
  for (const [emp, list] of by) {
    const p = pay.get(emp)
    const wage = p?.hourly_wage ?? s.default_wage
    const target = p?.weekly_hours ?? s.overtime_after_hours
    let hours = 0, evening = 0, weekend = 0, km = 0
    const perWeek = new Map<string, number>()
    for (const e of list) {
      const x = splitEntry(e, s)
      hours += x.hours; evening += x.evening; weekend += x.weekend; km += Number(e.km || 0)
      const w = mondayOf(new Date(e.check_in_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }))
      perWeek.set(w, (perWeek.get(w) ?? 0) + x.hours)
    }
    const overtime = target > 0 ? [...perWeek.values()].reduce((t, h) => t + Math.max(0, h - target), 0) : 0
    const base = hours * wage
    const supplements = evening * s.evening_supplement + weekend * s.weekend_supplement
    const overtimePay = overtime * wage * (s.overtime_pct / 100)
    const kmPay = km * s.km_rate
    const salary = base + supplements + overtimePay
    out.push({ employee_id: emp, hours, evening, weekend, overtime, km, wage, base, supplements, overtimePay, kmPay, gross: salary + kmPay, cost: salary * (1 + s.labor_overhead_pct / 100) + kmPay, entries: list.length, unapproved: list.filter((e) => !e.approved_at && e.check_out_at).length })
  }
  return out.sort((a, b) => b.hours - a.hours)
}

export async function loadEntries(orgId: string, fromIso: string, toIso: string) {
  const { data } = await createAdminClient().from("time_entries").select("id, employee_id, job_id, check_in_at, check_out_at, km, break_min, approved_at").eq("org_id", orgId).gte("check_in_at", fromIso).lt("check_in_at", toIso).order("check_in_at").limit(10000)
  return ((data ?? []) as Entry[]).map((e) => ({ ...e, km: Number(e.km ?? 0), break_min: Number(e.break_min ?? 0) }))
}

export const hrs = (h: number) => `${(Math.round(h * 100) / 100).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
