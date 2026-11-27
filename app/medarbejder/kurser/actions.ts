"use server"

import { revalidatePath } from "next/cache"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { getViewAs } from "@/lib/view-as"
import { notifyAdmins } from "@/lib/backend/notify"

export async function completeCourse(courseId: string) {
  const { org, user, ctx } = await requireRoleAction(["employee", "admin"])
  if (await getViewAs(ctx)) return
  const db = createAdminClient()
  const { data: c } = await db.from("org_courses").select("id, title").eq("org_id", org.id).eq("id", courseId).maybeSingle()
  if (!c) return
  const { error } = await db.from("course_completions").insert({ org_id: org.id, course_id: c.id, employee_id: user.id })
  if (!error) {
    const { data: me } = await db.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
    await notifyAdmins(org, { kind: "report", title: "Kursus gennemført", body: `${me?.full_name ?? "En medarbejder"} · ${c.title}`, href: "/admin/kurser" })
  }
  revalidatePath("/medarbejder/kurser", "layout")
}
