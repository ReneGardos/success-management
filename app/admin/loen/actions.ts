"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { isStaffOf } from "@/lib/backend/staff"
import { computePayroll, loadEmployeePay, loadEntries, loadPayrollSettings } from "@/lib/backend/payroll"
import { copenhagenToIso } from "@/lib/time"

const num = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? "").replace(",", ".").trim(); return v === "" ? null : Number(v) }
const back = (fd: FormData) => { const b = String(fd.get("back") ?? ""); return b.startsWith("/admin/loen") ? b : "/admin/loen" }

export async function savePayrollSettings(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const v = (k: string, d: number, min = 0, max = 100000) => Math.min(max, Math.max(min, num(formData, k) ?? d))
  await createAdminClient().from("org_payroll_settings").upsert({
    org_id: org.id, default_wage: v("default_wage", 165), evening_start: Math.round(v("evening_start", 18, 12, 23)), evening_end: Math.round(v("evening_end", 6, 0, 12)),
    evening_supplement: v("evening_supplement", 25), weekend_supplement: v("weekend_supplement", 45), overtime_after_hours: v("overtime_after_hours", 37, 0, 80),
    overtime_pct: v("overtime_pct", 50, 0, 200), km_rate: v("km_rate", 3.79, 0, 20), labor_overhead_pct: v("labor_overhead_pct", 25, 0, 200), updated_at: new Date().toISOString(),
  }, { onConflict: "org_id" })
  revalidatePath("/admin/loen")
  redirect(`${back(formData)}${back(formData).includes("?") ? "&" : "?"}gemt=1`)
}

export async function saveEmployeePay(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = String(formData.get("employee_id") ?? "")
  if (!(await isStaffOf(org.id, id))) return
  await createAdminClient().from("employee_pay").upsert({ org_id: org.id, employee_id: id, hourly_wage: num(formData, "hourly_wage"), weekly_hours: num(formData, "weekly_hours"), payroll_no: String(formData.get("payroll_no") ?? "").trim().slice(0, 40) || null, updated_at: new Date().toISOString() }, { onConflict: "org_id,employee_id" })
  revalidatePath("/admin/loen")
}

/** Locks a pay period: saves the totals so later edits do not change what was paid. */
export async function lockPeriod(formData: FormData) {
  const { org, user } = await requireRoleAction(["admin"])
  const from = String(formData.get("from") ?? ""), to = String(formData.get("to") ?? "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return
  const [s, pay, entries] = await Promise.all([loadPayrollSettings(org.id), loadEmployeePay(org.id), loadEntries(org.id, copenhagenToIso(from, "00:00")!, copenhagenToIso(to, "00:00")!)])
  const lines = computePayroll(entries.filter((e) => e.check_out_at), s, pay)
  await createAdminClient().from("payroll_periods").upsert({ org_id: org.id, starts_on: from, ends_on: to, totals: { lines, settings: s }, locked_by: user.id, locked_at: new Date().toISOString() }, { onConflict: "org_id,starts_on,ends_on" })
  revalidatePath("/admin/loen")
  redirect(`${back(formData)}${back(formData).includes("?") ? "&" : "?"}laast=1`)
}
