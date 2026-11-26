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
  await createAdminClient()
    .from("time_entries")
    .update({ check_in_at: inIso, check_out_at: outIso, ...(note ? { note } : {}) })
    .eq("org_id", org.id)
    .eq("id", id)
  revalidatePath("/admin/timer")
}
