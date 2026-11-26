import { NextRequest, NextResponse } from "next/server"
import { getOrgContext, isAdminRole } from "@/lib/org"
import { listStaff } from "@/lib/backend/staff"
import { entryDurationMs, entryPlace, loadTimeEntries } from "@/lib/backend/time-entries"
import { copenhagenToIso, dayKey, formatTime } from "@/lib/time"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ message: "Ikke logget ind" }, { status: 401 })
  if (!ctx.org || !isAdminRole(ctx.orgRole)) return NextResponse.json({ message: "Ingen adgang" }, { status: 403 })
  const org = ctx.org

  const from = request.nextUrl.searchParams.get("fra") ?? ""
  const to = request.nextUrl.searchParams.get("til") ?? ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return NextResponse.json({ message: "Ugyldig periode" }, { status: 400 })
  const [{ entries }, { staff }] = await Promise.all([
    loadTimeEntries(org.id, copenhagenToIso(from, "00:00")!, copenhagenToIso(to, "00:00")!, request.nextUrl.searchParams.get("medarbejder") ?? undefined),
    listStaff(org.id),
  ])
  const names = new Map(staff.map((s) => [s.id, s.name]))
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const rows = [
    ["Medarbejder", "Dato", "Sted", "Ind", "Ud", "Timer (decimal)", "Afstand ind (m)", "Afstand ud (m)", "Note"],
    ...[...entries].reverse().map((e) => [
      names.get(e.employee_id) ?? e.employee_id,
      dayKey(e.check_in_at),
      entryPlace(e),
      formatTime(e.check_in_at),
      e.check_out_at ? formatTime(e.check_out_at) : "",
      e.check_out_at ? (entryDurationMs(e) / 3600000).toFixed(2).replace(".", ",") : "",
      e.check_in_distance_m ?? "",
      e.check_out_distance_m ?? "",
      e.note ?? "",
    ]),
  ]
  const csv = "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n")
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="timer-${org.slug}-${from}.csv"` },
  })
}
