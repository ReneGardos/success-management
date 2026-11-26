"use server"

import { revalidatePath } from "next/cache"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { BUCKET } from "@/lib/backend/reports"

const text = (formData: FormData, key: string, max = 200) => String(formData.get(key) ?? "").trim().slice(0, max)

export async function setReportVisibility(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id", 64)
  await createAdminClient().from("cleaning_reports").update({ customer_visible: formData.get("visible") === "true" }).eq("org_id", org.id).eq("id", id)
  revalidatePath(`/admin/rapporter/${id}`)
}

export async function deletePhoto(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const db = createAdminClient()
  const { data } = await db.from("photos").select("id, path, report_id").eq("org_id", org.id).eq("id", text(formData, "id", 64)).maybeSingle()
  if (!data) return
  if (String(data.path).startsWith(`${org.id}/`)) await db.storage.from(BUCKET).remove([data.path])
  await db.from("photos").delete().eq("org_id", org.id).eq("id", data.id)
  revalidatePath("/admin/rapporter", "layout")
}
