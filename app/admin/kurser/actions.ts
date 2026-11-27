"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { notifyUsers } from "@/lib/backend/notify"

const safeVideo = (u: string) => (/^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\//.test(u) ? u : null)

export async function saveCourse(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = String(formData.get("id") ?? "")
  const row = {
    title: String(formData.get("title") ?? "").trim().slice(0, 160),
    summary: String(formData.get("summary") ?? "").trim().slice(0, 400) || null,
    content: String(formData.get("content") ?? "").slice(0, 40000) || null,
    video_url: safeVideo(String(formData.get("video_url") ?? "").trim()),
    minutes: Math.max(0, Math.min(600, Number(formData.get("minutes")) || 0)) || null,
    required: formData.get("required") === "on",
    active: formData.get("active") !== "off",
  }
  if (row.title.length < 2) redirect("/admin/kurser?fejl=Skriv+en+titel")
  const db = createAdminClient()
  if (/^[0-9a-f-]{36}$/i.test(id)) await db.from("org_courses").update(row).eq("org_id", org.id).eq("id", id)
  else {
    await db.from("org_courses").insert({ ...row, org_id: org.id })
    if (row.required) {
      const { data: staff } = await db.from("memberships").select("user_id").eq("org_id", org.id).eq("role", "employee")
      await notifyUsers(org, (staff ?? []).map((s) => String(s.user_id)), { kind: "report", title: "Nyt kursus", body: row.title, href: "/medarbejder/kurser" })
    }
  }
  revalidatePath("/admin/kurser")
  redirect("/admin/kurser?gemt=1")
}

export async function archiveCourse(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  await createAdminClient().from("org_courses").update({ active: false }).eq("org_id", org.id).eq("id", String(formData.get("id") ?? ""))
  revalidatePath("/admin/kurser")
}
