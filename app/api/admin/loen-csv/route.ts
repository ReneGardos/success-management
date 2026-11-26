import { NextRequest, NextResponse } from "next/server"
import { getOrgContext, isAdminRole } from "@/lib/org"
import { listStaff } from "@/lib/backend/staff"
import { computePayroll, loadEmployeePay, loadEntries, loadPayrollSettings } from "@/lib/backend/payroll"
import { copenhagenToIso } from "@/lib/time"

export const runtime = "nodejs"

/** Payroll export (semicolon CSV, Danish decimals) for Danløn/DataLøn/Excel. */
export async function GET(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx?.org || !isAdminRole(ctx.orgRole)) return NextResponse.json({ message: "Ingen adgang" }, { status: 403 })
  const org = ctx.org
  const from = request.nextUrl.searchParams.get("fra") ?? "", to = request.nextUrl.searchParams.get("til") ?? ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return NextResponse.json({ message: "Ugyldig periode" }, { status: 400 })
  const [s, pay, entries, { staff }] = await Promise.all([loadPayrollSettings(org.id), loadEmployeePay(org.id), loadEntries(org.id, copenhagenToIso(from, "00:00")!, copenhagenToIso(to, "00:00")!), listStaff(org.id)])
  const lines = computePayroll(entries.filter((e) => e.check_out_at), s, pay)
  const names = new Map(staff.map((p) => [p.id, p.name]))
  const d = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace(".", ",")
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const rows = [
    ["Lønnr.", "Navn", "Periode fra", "Periode til", "Timer i alt", "Aftentimer", "Weekendtimer", "Overtidstimer", "Timeløn", "Grundløn", "Tillæg", "Overtidsbetaling", "Km", "Kørselsgodtgørelse", "Bruttoløn", "Ikke godkendte registreringer"],
    ...lines.map((l) => [pay.get(l.employee_id)?.payroll_no ?? "", names.get(l.employee_id) ?? l.employee_id, from, to, d(l.hours), d(l.evening), d(l.weekend), d(l.overtime), d(l.wage), d(l.base), d(l.supplements), d(l.overtimePay), d(l.km), d(l.kmPay), d(l.gross), l.unapproved]),
  ]
  const csv = "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n")
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="loen-${org.slug}-${from}.csv"` } })
}
