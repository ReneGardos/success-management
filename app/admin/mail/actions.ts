"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { requireRoleAction } from "@/lib/auth-guard"
import { senderFor, sendAdminEmail } from "@/lib/backend/mail"
import { createAdminClient } from "@/lib/supabase/admin"

const mailSchema = z.object({
  to: z.string().trim().email("Ugyldig modtager-email"),
  subject: z.string().trim().min(1, "Skriv et emne").max(200),
  text: z.string().trim().min(1, "Skriv en besked").max(20000),
  contactRequestId: z.string().trim().max(64).optional(),
  returnTo: z.string().trim().startsWith("/admin").optional(),
})

export async function sendMail(formData: FormData) {
  const { user, org } = await requireRoleAction(["admin"])
  const parsed = mailSchema.safeParse(Object.fromEntries(formData))
  const returnTo = (formData.get("returnTo") as string) || "/admin/mail"
  if (!parsed.success) redirect(`${returnTo}?fejl=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Tjek felterne")}`)

  try {
    const requestId = parsed.data.contactRequestId || null
    if (requestId) {
      const { data: owned } = await createAdminClient().from("contact_requests").select("id").eq("org_id", org.id).eq("id", requestId).maybeSingle()
      if (!owned) throw new Error("Henvendelsen findes ikke.")
    }
    await sendAdminEmail({
      org,
      to: parsed.data.to,
      subject: parsed.data.subject,
      text: parsed.data.text,
      contactRequestId: requestId,
      sentBy: user.id,
      sender: await senderFor(org, user.id, user.email ?? null),
      bannerId: String(formData.get("banner_id") ?? "") || undefined,
    })
  } catch (error) {
    redirect(`${returnTo}?fejl=${encodeURIComponent(error instanceof Error ? error.message : "Mailen blev ikke sendt")}`)
  }
  revalidatePath("/admin", "layout")
  redirect(`${returnTo}?sendt=1`)
}

const statuses = ["new", "answered", "customer_replied", "closed"] as const

export async function setRequestStatus(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = String(formData.get("id") ?? "")
  const status = String(formData.get("status") ?? "")
  if (!id || !(statuses as readonly string[]).includes(status)) return
  await createAdminClient().from("contact_requests").update({ status }).eq("org_id", org.id).eq("id", id)
  revalidatePath("/admin", "layout")
}

export async function saveSignature(formData: FormData) {
  const { user, org } = await requireRoleAction(["admin", "employee"])
  const value = (key: string) => String(formData.get(key) ?? "").trim().slice(0, 120) || null
  const db = createAdminClient()
  // Name and phone are personal; title and work email belong to this organization.
  await db.from("profiles").update({ full_name: value("full_name"), phone: value("phone"), updated_at: new Date().toISOString() }).eq("id", user.id)
  await db.from("memberships").update({ job_title: value("job_title"), work_email: value("work_email") }).eq("org_id", org.id).eq("user_id", user.id)
  revalidatePath("/admin/mail")
  redirect("/admin/mail?signatur=1")
}
