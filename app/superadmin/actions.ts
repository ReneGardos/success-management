"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { Resend } from "resend"
import { z } from "zod"
import { requireSuperadminAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"

const back = "/superadmin"
const fail = (message: string): never => redirect(`${back}?fejl=${encodeURIComponent(message)}`)
const text = (formData: FormData, key: string, max = 200) => String(formData.get(key) ?? "").trim().slice(0, max)

const orgSchema = z.object({
  name: z.string().trim().min(2, "Skriv et navn").max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,40}$/, "Kort navn: små bogstaver, tal og bindestreg"),
  cvr: z.string().trim().max(20).optional(),
  website: z.string().trim().max(120).optional(),
  office_email: z.string().trim().email("Ugyldig kontor-email").optional().or(z.literal("")),
})

export async function createOrganization(formData: FormData) {
  const ctx = await requireSuperadminAction()
  const parsed = orgSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) fail(parsed.error!.issues[0]?.message ?? "Tjek felterne")
  const { name, slug, cvr, website, office_email } = parsed.data!
  const db = createAdminClient()
  const { data: org, error } = await db
    .from("organizations")
    .insert({ name, slug, cvr: cvr || null, website: website?.replace(/^https?:\/\//, "") || null, office_email: office_email || null, mail_from_name: name, inbound_alias: slug, legal_name: name })
    .select("id")
    .single()
  if (error || !org) fail(error?.message.includes("duplicate") ? "Det korte navn er allerede i brug." : error?.message ?? "Virksomheden blev ikke oprettet")
  await db.from("email_settings").insert({ org_id: org!.id, show_logo: false })
  // The superadmin becomes owner, so the organization can be set up and staff invited right away.
  await db.from("memberships").insert({ org_id: org!.id, user_id: ctx.user.id, role: "owner" })
  revalidatePath(back)
  redirect(`/org/skift?org=${org!.id}&next=/admin/indstillinger`)
}

export async function updateOrganizationPlatform(formData: FormData) {
  await requireSuperadminAction()
  const id = text(formData, "id", 64)
  const plan = text(formData, "plan", 20)
  const status = text(formData, "subscription_status", 20)
  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), active: formData.get("active") === "on" }
  if (["internal", "trial", "starter", "pro", "enterprise"].includes(plan)) update.plan = plan
  if (["active", "trialing", "past_due", "canceled", "paused"].includes(status)) update.subscription_status = status
  const mailDomain = text(formData, "mail_domain", 120).toLowerCase().replace(/^@/, "")
  update.mail_domain = mailDomain || null
  update.mail_from_local = text(formData, "mail_from_local", 40).toLowerCase().replace(/[^a-z0-9._-]/g, "") || "kontakt"
  if (!mailDomain) update.mail_domain_verified = false
  const alias = text(formData, "inbound_alias", 41).toLowerCase()
  if (alias && /^[a-z0-9][a-z0-9-]{1,40}$/.test(alias)) update.inbound_alias = alias
  const { error } = await createAdminClient().from("organizations").update(update).eq("id", id)
  if (error) fail(error.message)
  revalidatePath(back)
  redirect(`${back}?gemt=1`)
}

/** Registers the organization's sending domain in Resend (DNS records are shown in Resend). */
export async function registerMailDomain(formData: FormData) {
  await requireSuperadminAction()
  const id = text(formData, "id", 64)
  const db = createAdminClient()
  const { data: org } = await db.from("organizations").select("mail_domain, resend_domain_id").eq("id", id).maybeSingle()
  if (!org?.mail_domain) fail("Angiv et maildomæne først.")
  if (!process.env.RESEND_API_KEY) fail("RESEND_API_KEY mangler.")
  const resend = new Resend(process.env.RESEND_API_KEY)
  let domainId = org!.resend_domain_id as string | null
  if (!domainId) {
    const { data, error } = await resend.domains.create({ name: org!.mail_domain!, region: "eu-west-1" })
    if (error && !error.message.toLowerCase().includes("already")) fail(`Resend: ${error.message}`)
    domainId = data?.id ?? null
    if (!domainId) {
      const { data: list } = await resend.domains.list()
      domainId = list?.data?.find((d) => d.name === org!.mail_domain)?.id ?? null
    }
  }
  if (!domainId) fail("Domænet blev ikke fundet i Resend.")
  const { data: status } = await resend.domains.get(domainId!)
  const verified = status?.status === "verified"
  await db.from("organizations").update({ resend_domain_id: domainId, mail_domain_verified: verified }).eq("id", id)
  revalidatePath(back)
  redirect(`${back}?gemt=${verified ? "verificeret" : "afventer-dns"}`)
}
