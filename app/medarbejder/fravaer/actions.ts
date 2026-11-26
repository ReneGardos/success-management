"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { Resend } from "resend"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { mailConfigured, officeEmailFor } from "@/lib/backend/mail"
import { appUrl, orgSender } from "@/lib/org"
import { getViewAs } from "@/lib/view-as"

const kinds = { vacation: "Ferie / fri", sick: "Sygdom", child_sick: "Barns sygedag", other: "Andet" } as const

export async function requestAbsence(formData: FormData) {
  const { org, user, ctx } = await requireRoleAction(["employee", "admin"])
  if (await getViewAs(ctx)) redirect("/medarbejder/fravaer")
  const kind = String(formData.get("kind") ?? "vacation") as keyof typeof kinds
  const from = String(formData.get("starts_on") ?? "")
  const to = String(formData.get("ends_on") ?? "") || from
  if (!(kind in kinds) || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) redirect(`/medarbejder/fravaer?fejl=${encodeURIComponent("Vælg gyldige datoer.")}`)
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000) || null
  // Sickness is registered right away; holiday needs approval.
  const status = kind === "sick" || kind === "child_sick" ? "approved" : "pending"
  await createAdminClient().from("employee_absences").insert({ org_id: org.id, employee_id: user.id, kind, starts_on: from, ends_on: to, note, status })
  if (mailConfigured()) {
    const { data: p } = await createAdminClient().from("profiles").select("full_name").eq("id", user.id).maybeSingle()
    await new Resend(process.env.RESEND_API_KEY).emails.send({ from: orgSender(org, "noreply"), to: [officeEmailFor(org)], subject: `${kinds[kind]}: ${p?.full_name ?? user.email} ${from}${to !== from ? `–${to}` : ""}`, text: `${p?.full_name ?? user.email} har meldt ${kinds[kind].toLowerCase()} ${from}${to !== from ? ` til ${to}` : ""}.${note ? `\n\n${note}` : ""}\n\nSe: ${appUrl()}/admin/fravaer` }).catch(() => {})
  }
  revalidatePath("/medarbejder", "layout")
  revalidatePath("/admin/fravaer")
  redirect("/medarbejder?fravaer=1")
}

export async function cancelAbsence(formData: FormData) {
  const { org, user, ctx } = await requireRoleAction(["employee", "admin"])
  if (await getViewAs(ctx)) return
  await createAdminClient().from("employee_absences").delete().eq("org_id", org.id).eq("employee_id", user.id).eq("id", String(formData.get("id") ?? "")).eq("status", "pending")
  revalidatePath("/medarbejder/fravaer")
}
