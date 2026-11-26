"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { appUrl } from "@/lib/org"
import { sendInviteEmail } from "@/lib/backend/mail"

const roleNames = { customer: "kunde", employee: "medarbejder", admin: "administrator", owner: "ejer" } as const
const roles = ["customer", "employee", "admin", "owner"] as const
const back = "/admin/brugere"
const fail = (message: string): never => redirect(`${back}?fejl=${encodeURIComponent(message)}`)

export async function setRole(formData: FormData) {
  const { user, org, orgRole } = await requireRoleAction(["admin"])
  const id = String(formData.get("id") ?? "")
  const role = String(formData.get("role") ?? "")
  const jobTitle = String(formData.get("job_title") ?? "").trim().slice(0, 80)
  if (!id || !(roles as readonly string[]).includes(role)) return
  if (role === "owner" && orgRole !== "owner") fail("Kun en ejer kan gøre andre til ejer.")
  if (id === user.id && role !== "admin" && role !== "owner") fail("Du kan ikke fjerne din egen admin-adgang.")
  const db = createAdminClient()
  const { data: current } = await db.from("memberships").select("role").eq("org_id", org.id).eq("user_id", id).maybeSingle()
  if (!current) fail("Personen er ikke medlem af virksomheden.")
  if (current!.role === "owner" && orgRole !== "owner") fail("Kun en ejer kan ændre en ejers rolle.")
  const { error } = await db.from("memberships").update({ role, job_title: jobTitle || null }).eq("org_id", org.id).eq("user_id", id)
  if (error) fail(error.message)
  revalidatePath(back)
  redirect(`${back}?gemt=1`)
}

export async function removeMember(formData: FormData) {
  const { user, org, orgRole } = await requireRoleAction(["admin"])
  const id = String(formData.get("id") ?? "")
  if (!id || id === user.id) fail("Du kan ikke fjerne dig selv.")
  const db = createAdminClient()
  const { data: current } = await db.from("memberships").select("role").eq("org_id", org.id).eq("user_id", id).maybeSingle()
  if (current?.role === "owner" && orgRole !== "owner") fail("Kun en ejer kan fjerne en ejer.")
  // Only the membership goes; the login stays if the person belongs to other organizations.
  const { error } = await db.from("memberships").delete().eq("org_id", org.id).eq("user_id", id)
  if (error) fail(error.message)
  revalidatePath(back)
  redirect(`${back}?fjernet=1`)
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ugyldig email"),
  name: z.string().trim().min(2, "Skriv et navn").max(120),
  phone: z.string().trim().max(40).optional(),
  job_title: z.string().trim().max(80).optional(),
  role: z.enum(["customer", "employee", "admin"]),
})

async function findUserByEmail(email: string) {
  const db = createAdminClient()
  for (let page = 1; page <= 10; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    const hit = data?.users.find((u) => u.email?.toLowerCase() === email)
    if (hit) return hit
    if (!data || data.users.length < 1000) return null
  }
  return null
}

export async function inviteUser(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) fail(parsed.error!.issues[0]?.message ?? "Tjek felterne")
  const { email, name, phone, role, job_title } = parsed.data!
  const db = createAdminClient()
  const next = role === "employee" ? "/medarbejder" : role === "admin" ? "/admin" : "/kunde"

  const existing = await findUserByEmail(email)
  let userId: string
  let link: string
  if (existing) {
    // Same login across organizations: just add a membership and tell them.
    userId = existing.id
    link = `${appUrl()}/auth/login?next=${encodeURIComponent(`/vaelg-virksomhed?org=${org.id}&next=${next}`)}`
  } else {
    // Generate the link ourselves and send it via Resend in the organization's branding.
    const { data, error } = await db.auth.admin.generateLink({ type: "invite", email, options: { data: { full_name: name } } })
    if (error || !data.user || !data.properties?.hashed_token) fail(`Invitationen blev ikke oprettet: ${error?.message ?? "ukendt fejl"}`)
    userId = data!.user!.id
    link = `${appUrl()}/auth/confirm?token_hash=${data!.properties!.hashed_token}&type=invite&next=${encodeURIComponent(`/auth/set-password?next=${encodeURIComponent(`/vaelg-virksomhed?org=${org.id}&next=${next}`)}`)}`
    await db.from("profiles").upsert({ id: userId, full_name: name, phone: phone || null, last_org_id: org.id }, { onConflict: "id" })
  }

  const { error: memberError } = await db.from("memberships").upsert({ org_id: org.id, user_id: userId, role, job_title: job_title || null }, { onConflict: "org_id,user_id" })
  if (memberError) fail(memberError.message)

  try {
    await sendInviteEmail(org, email, name, roleNames[role], link, Boolean(existing))
  } catch (sendError) {
    fail(`${sendError instanceof Error ? sendError.message : "Invitationen blev ikke sendt"} (personen er tilføjet – prøv at sende igen senere).`)
  }
  revalidatePath(back)
  redirect(`${back}?inviteret=${encodeURIComponent(email)}`)
}
