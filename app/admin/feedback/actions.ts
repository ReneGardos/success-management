"use server"

import { revalidatePath } from "next/cache"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"

export async function setFeedbackStatus(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const status = String(formData.get("status") ?? "") === "handled" ? "handled" : "open"
  await createAdminClient().from("customer_feedback").update({ status, handled_at: status === "handled" ? new Date().toISOString() : null }).eq("org_id", org.id).eq("id", String(formData.get("id") ?? ""))
  revalidatePath("/admin/feedback")
}
