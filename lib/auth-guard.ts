import { redirect } from "next/navigation"
import { getOrgContext, isAdminRole, type Org, type OrgContext, type OrgRole } from "@/lib/org"

/** Coarse role used for access checks. "admin" covers both owner and admin. */
export type Role = "admin" | "employee" | "customer"

const coarse = (role: OrgRole | null): Role | null => (isAdminRole(role) ? "admin" : role === "employee" ? "employee" : role === "customer" ? "customer" : null)

export type Guarded = { user: OrgContext["user"]; role: Role; orgRole: OrgRole; fullName: string | null; org: Org; ctx: OrgContext }

/** Returns the signed-in user, active organization and role, or redirects. Use in pages. */
export async function requireRolePage(allowed: Role[], next: string): Promise<Guarded> {
  const ctx = await getOrgContext()
  if (!ctx) redirect(`/auth/login?next=${encodeURIComponent(next)}`)
  if (!ctx.org || !ctx.orgRole) redirect(ctx.isSuperadmin ? "/superadmin" : "/vaelg-virksomhed")
  const role = coarse(ctx.orgRole)!
  if (!allowed.includes(role)) redirect("/")
  return { user: ctx.user, role, orgRole: ctx.orgRole, fullName: ctx.fullName, org: ctx.org, ctx }
}

/** Throws unless the caller has one of the roles in the active organization. Use in server actions. */
export async function requireRoleAction(allowed: Role[]): Promise<Guarded> {
  const ctx = await getOrgContext()
  if (!ctx) throw new Error("Ikke logget ind")
  if (!ctx.org || !ctx.orgRole) throw new Error("Vælg en virksomhed først")
  const role = coarse(ctx.orgRole)!
  if (!allowed.includes(role)) throw new Error("Ingen adgang")
  return { user: ctx.user, role, orgRole: ctx.orgRole, fullName: ctx.fullName, org: ctx.org, ctx }
}

export async function requireSuperadminPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/auth/login?next=/superadmin")
  if (!ctx.isSuperadmin) redirect("/")
  return ctx
}

export async function requireSuperadminAction() {
  const ctx = await getOrgContext()
  if (!ctx?.isSuperadmin) throw new Error("Ingen adgang")
  return ctx
}
