"use server"

import { revalidatePath } from "next/cache"
import { Resend } from "resend"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { mailConfigured } from "@/lib/backend/mail"
import { appUrl, orgSender } from "@/lib/org"

const labels: Record<string, string> = { vacation: "ferie/fri", sick: "sygdom", child_sick: "barns sygedag", other: "fravær" }

/** Approve or decline an absence request and tell the employee. */
export async function decideAbsence(formData: FormData) {
  const { org, user } = await requireRoleAction(["admin"])
  const id = String(formData.get("id") ?? "")
  const status = String(formData.get("status") ?? "")
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["approved", "declined", "pending"].includes(status)) return
  const db = createAdminClient()
  const { data: a } = await db.from("employee_absences").update({ status, decided_by: status === "pending" ? null : user.id, decided_at: status === "pending" ? null : new Date().toISOString() }).eq("org_id", org.id).eq("id", id).select("employee_id, kind, starts_on, ends_on").maybeSingle()
  revalidatePath("/admin/fravaer")
  revalidatePath("/admin/vagtplan")
  if (!a || status === "pending" || !mailConfigured()) return
  const { data: emp } = await db.auth.admin.getUserById(a.employee_id)
  if (!emp.user?.email) return
  const d = (x: string) => new Date(`${x}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "long" })
  const period = a.starts_on === a.ends_on ? d(a.starts_on) : `${d(a.starts_on)} – ${d(a.ends_on)}`
  const word = status === "approved" ? "godkendt" : "afvist"
  await new Resend(process.env.RESEND_API_KEY).emails.send({ from: orgSender(org, "noreply"), to: [emp.user.email], subject: `Din anmodning om ${labels[a.kind] ?? "fravær"} er ${word}`, text: `Din anmodning om ${labels[a.kind] ?? "fravær"} ${period} er ${word}.\n\nSe den her: ${appUrl()}/medarbejder/fravaer\n\n${org.name}` }).catch(() => {})
}
