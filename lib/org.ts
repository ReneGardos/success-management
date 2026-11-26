import { cache } from "react"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const ORG_COOKIE = "sm_org"

export type OrgRole = "owner" | "admin" | "employee" | "customer"

export type Org = {
  id: string
  slug: string
  name: string
  legal_name: string | null
  cvr: string | null
  address: string | null
  phone: string | null
  office_email: string | null
  website: string | null
  domain: string | null
  logo_url: string | null
  email_logo_url: string | null
  color_primary: string
  color_accent: string
  color_background: string
  color_muted: string
  font_family: string
  mail_from_name: string | null
  mail_from_local: string
  mail_domain: string | null
  mail_domain_verified: boolean
  resend_domain_id: string | null
  inbound_alias: string | null
  quote_default_intro: string | null
  quote_default_terms: string | null
  plan: string
  subscription_status: string
  active: boolean
}

export type MembershipSummary = { orgId: string; slug: string; name: string; logoUrl: string | null; colorPrimary: string; role: OrgRole }

export type OrgContext = {
  user: { id: string; email: string | null }
  fullName: string | null
  isSuperadmin: boolean
  memberships: MembershipSummary[]
  org: Org | null
  /** Role in the active organization. Superadmins without a membership act as admin. */
  orgRole: OrgRole | null
}

export const ORG_COLUMNS =
  "id, slug, name, legal_name, cvr, address, phone, office_email, website, domain, logo_url, email_logo_url, color_primary, color_accent, color_background, color_muted, font_family, mail_from_name, mail_from_local, mail_domain, mail_domain_verified, resend_domain_id, inbound_alias, quote_default_intro, quote_default_terms, plan, subscription_status, active"

/** Signed-in user, memberships and the active organization (cookie → last used → first). Cached per request. */
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const db = createAdminClient()
  const [{ data: profile }, { data: admin }, { data: rows }] = await Promise.all([
    db.from("profiles").select("full_name, last_org_id").eq("id", user.id).maybeSingle(),
    db.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    db.from("memberships").select("role, org:organizations(id, slug, name, logo_url, color_primary, active)").eq("user_id", user.id),
  ])
  const isSuperadmin = Boolean(admin)
  type Row = { role: OrgRole; org: { id: string; slug: string; name: string; logo_url: string | null; color_primary: string; active: boolean } | null }
  const memberships: MembershipSummary[] = ((rows ?? []) as unknown as Row[])
    .filter((r) => r.org && (r.org.active || isSuperadmin))
    .map((r) => ({ orgId: r.org!.id, slug: r.org!.slug, name: r.org!.name, logoUrl: r.org!.logo_url, colorPrimary: r.org!.color_primary, role: r.role }))
    .sort((a, b) => a.name.localeCompare(b.name, "da"))

  const cookieOrg = (await cookies()).get(ORG_COOKIE)?.value ?? null
  const candidates = [cookieOrg, profile?.last_org_id as string | null, memberships[0]?.orgId].filter(Boolean) as string[]
  let activeId: string | null = null
  for (const id of candidates) {
    if (memberships.some((m) => m.orgId === id) || isSuperadmin) { activeId = id; break }
  }

  let org: Org | null = null
  if (activeId) {
    const { data } = await db.from("organizations").select(ORG_COLUMNS).eq("id", activeId).maybeSingle()
    org = (data as Org | null) ?? null
    if (org && !org.active && !isSuperadmin) org = null
  }
  const membership = org ? memberships.find((m) => m.orgId === org!.id) : undefined
  const orgRole: OrgRole | null = membership?.role ?? (org && isSuperadmin ? "admin" : null)

  return {
    user: { id: user.id, email: user.email ?? null },
    fullName: (profile?.full_name as string | null) ?? null,
    isSuperadmin,
    memberships,
    org,
    orgRole,
  }
})

export const isAdminRole = (role: OrgRole | null) => role === "owner" || role === "admin"

/** Where a person should land after signing in, based on their role in the active organization. */
export function homeFor(ctx: OrgContext) {
  if (!ctx.org) return ctx.isSuperadmin ? "/superadmin" : "/vaelg-virksomhed"
  if (isAdminRole(ctx.orgRole)) return "/admin"
  if (ctx.orgRole === "employee") return "/medarbejder"
  return "/kunde"
}

export async function loadOrgById(id: string) {
  const { data } = await createAdminClient().from("organizations").select(ORG_COLUMNS).eq("id", id).maybeSingle()
  return (data as Org | null) ?? null
}

/** Display address for "from" in mails: "Success Cleaning <kontakt@successcleaningaps.dk>". */
export function orgSender(org: Org, local = org.mail_from_local || "kontakt") {
  const domain = org.mail_domain && org.mail_domain_verified ? org.mail_domain : process.env.RESEND_EMAIL_DOMAIN
  return `${org.mail_from_name || org.name} <${local}@${domain}>`
}

export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "https://success-management-ruddy.vercel.app").replace(/\/$/, "")
export const websiteUrl = (org: Org) => (org.website ? `https://${org.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : appUrl())
