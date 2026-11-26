"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { tasksFromQuote } from "@/lib/backend/reports"

const text = (formData: FormData, key: string, max = 200) => String(formData.get(key) ?? "").trim().slice(0, max)

async function ownLocation(orgId: string, id: string) {
  const { data } = await createAdminClient().from("locations").select("id").eq("org_id", orgId).eq("id", id).maybeSingle()
  if (!data) throw new Error("Stedet findes ikke.")
}

export async function addTask(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const locationId = text(formData, "location_id", 64)
  await ownLocation(org.id, locationId)
  const labels = text(formData, "labels", 4000).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 50)
  const area = text(formData, "area", 60) || null
  const db = createAdminClient()
  const { count } = await db.from("location_tasks").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("location_id", locationId)
  if (labels.length) await db.from("location_tasks").insert(labels.map((label, i) => ({ org_id: org.id, location_id: locationId, label, area, position: (count ?? 0) + i })))
  revalidatePath(`/admin/steder/${locationId}`)
}

export async function importTasksFromQuote(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const locationId = text(formData, "location_id", 64)
  await ownLocation(org.id, locationId)
  const tasks = await tasksFromQuote(org.id, locationId)
  if (!tasks.length) redirect(`/admin/steder/${locationId}?fejl=${encodeURIComponent("Fandt ikke et accepteret tilbud for stedet eller kunden.")}`)
  const db = createAdminClient()
  const { data: existing } = await db.from("location_tasks").select("label").eq("org_id", org.id).eq("location_id", locationId)
  const have = new Set((existing ?? []).map((t) => t.label.toLowerCase()))
  const fresh = tasks.filter((t) => !have.has(t.label.toLowerCase()))
  if (fresh.length) await db.from("location_tasks").insert(fresh.map((t, i) => ({ org_id: org.id, location_id: locationId, label: t.label, quote_line_id: t.quote_line_id, position: (existing?.length ?? 0) + i })))
  revalidatePath(`/admin/steder/${locationId}`)
  redirect(`/admin/steder/${locationId}?hentet=${fresh.length}`)
}

export async function updateTask(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id", 64)
  const db = createAdminClient()
  if (formData.get("delete") === "1") await db.from("location_tasks").delete().eq("org_id", org.id).eq("id", id)
  else await db.from("location_tasks").update({ label: text(formData, "label"), area: text(formData, "area", 60) || null, position: Number(text(formData, "position", 6)) || 0 }).eq("org_id", org.id).eq("id", id)
  revalidatePath("/admin/steder", "layout")
}
