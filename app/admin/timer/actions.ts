"use server"

import { revalidatePath } from "next/cache"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { copenhagenToIso } from "@/lib/time"

/** Admin closes or corrects a time entry (e.g. employee forgot to check out). */
export async function correctEntry(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = String(formData.get("id") ?? "")
  const date = String(formData.get("date") ?? "")
  const checkIn = String(formData.get("check_in") ?? "")
  const checkOut = String(formData.get("check_out") ?? "")
  if (!id || !date || !checkIn) return
  const inIso = copenhagenToIso(date, checkIn)
  const outIso = checkOut ? copenhagenToIso(date, checkOut) : null
  const note = String(formData.get("note") ?? "").trim()
  const km = Math.max(0, Number(String(formData.get("km") ?? "0").replace(",", ".")) || 0)
  const breakMin = Math.max(0, Math.min(240, Math.round(Number(formData.get("break_min") ?? 0)) || 0))
  const { user } = await requireRoleAction(["admin"])
  const approve = formData.get("approve") === "on"
  await createAdminClient()
    .from("time_entries")
    .update({ check_in_at: inIso, check_out_at: outIso, km, break_min: breakMin, ...(note ? { note } : {}), ...(approve ? { approved_at: new Date().toISOString(), approved_by: user.id } : { approved_at: null, approved_by: null }) })
    .eq("org_id", org.id)
    .eq("id", id)
  revalidatePath("/admin/timer")
  revalidatePath("/admin/loen")
}

/** Approve all finished entries in a period (optionally for one employee). */
export async function approveEntries(formData: FormData) {
  const { org, user } = await requireRoleAction(["admin"])
  const from = String(formData.get("from") ?? ""), to = String(formData.get("to") ?? "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return
  let q = createAdminClient().from("time_entries").update({ approved_at: new Date().toISOString(), approved_by: user.id }).eq("org_id", org.id).is("approved_at", null).not("check_out_at", "is", null).gte("check_in_at", copenhagenToIso(from, "00:00")!).lt("check_in_at", copenhagenToIso(to, "00:00")!)
  const emp = String(formData.get("employee") ?? "")
  if (/^[0-9a-f-]{36}$/i.test(emp)) q = q.eq("employee_id", emp)
  await q
  revalidatePath("/admin/timer")
  revalidatePath("/admin/loen")
}
