"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { runAutomation } from "@/lib/backend/automation"

const int = (fd: FormData, k: string, min: number, max: number, d: number) => { const n = Math.round(Number(fd.get(k))); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d }

export async function saveAutomation(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const on = (k: string) => formData.get(k) === "on"
  await createAdminClient().from("org_automation").upsert({
    org_id: org.id,
    auto_invoice: on("auto_invoice"), invoice_day: int(formData, "invoice_day", 1, 28, 1), invoice_send: on("invoice_send"),
    auto_reminders: on("auto_reminders"), reminder_after_days: int(formData, "reminder_after_days", 1, 60, 3), reminder_repeat_days: int(formData, "reminder_repeat_days", 3, 60, 10), reminder_max: int(formData, "reminder_max", 1, 5, 2),
    quote_followup: on("quote_followup"), followup_after_days: int(formData, "followup_after_days", 1, 30, 4),
    weekly_digest: on("weekly_digest"), digest_weekday: int(formData, "digest_weekday", 1, 7, 1),
    employee_morning: on("employee_morning"), customer_visit_reminder: on("customer_visit_reminder"), report_reminder: on("report_reminder"),
    updated_at: new Date().toISOString(),
  }, { onConflict: "org_id" })
  revalidatePath("/admin/automatisering")
  redirect("/admin/automatisering?gemt=1")
}

export async function runNow(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const logs = await runAutomation(org, { forceDigest: formData.get("digest") === "1" })
  revalidatePath("/admin/automatisering")
  redirect(`/admin/automatisering?koert=${logs.length}`)
}

export async function toggleQuoteAuto(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  await createAdminClient().from("quotes").update({ auto_invoice: formData.get("on") === "1" }).eq("org_id", org.id).eq("id", String(formData.get("id") ?? ""))
  revalidatePath("/admin/automatisering")
}
