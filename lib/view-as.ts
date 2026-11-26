import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminRole, type OrgContext } from "@/lib/org"

export const VIEW_COOKIE = "sm_view_as"

export type ViewAs =
  | { type: "employee"; id: string; name: string }
  | { type: "customer"; id: string; name: string }

/**
 * Admin/superadmin preview: see the employee app or customer portal as a specific person.
 * Only valid for admins of the active organization and only for people/customers in that organization.
 */
export async function getViewAs(ctx: OrgContext): Promise<ViewAs | null> {
  if (!ctx.org || !(isAdminRole(ctx.orgRole) || ctx.isSuperadmin)) return null
  const raw = (await cookies()).get(VIEW_COOKIE)?.value ?? ""
  const [orgId, type, id] = raw.split(":")
  if (orgId !== ctx.org.id || !/^[0-9a-f-]{36}$/i.test(id ?? "")) return null
  const db = createAdminClient()
  if (type === "employee") {
    const { data } = await db.from("memberships").select("user_id, role").eq("org_id", ctx.org.id).eq("user_id", id).maybeSingle()
    if (!data || data.role === "customer") return null
    const { data: p } = await db.from("profiles").select("full_name").eq("id", id).maybeSingle()
    return { type, id, name: p?.full_name || "Medarbejder" }
  }
  if (type === "customer") {
    const { data } = await db.from("customers").select("id, name, company").eq("org_id", ctx.org.id).eq("id", id).maybeSingle()
    if (!data) return null
    return { type, id, name: data.company || data.name }
  }
  return null
}
