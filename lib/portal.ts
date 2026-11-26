import { cache } from "react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { customerIdsFor } from "@/lib/backend/customers"
import { getViewAs, type ViewAs } from "@/lib/view-as"

/** Employee area context. In admin preview ("Se som") the effective user is the chosen employee. */
export const employeePortal = cache(async (next = "/medarbejder") => {
  const g = await requireRolePage(["employee", "admin"], next)
  const viewAs = await getViewAs(g.ctx)
  const preview = viewAs?.type === "employee" ? (viewAs as Extract<ViewAs, { type: "employee" }>) : null
  const userId = preview ? preview.id : g.user.id
  const { data: profile } = await createAdminClient().from("profiles").select("full_name, phone").eq("id", userId).maybeSingle()
  return {
    ...g,
    preview,
    userId,
    name: (preview ? preview.name : profile?.full_name || g.fullName || g.user.email || "") as string,
    phone: (profile?.phone as string | null) ?? null,
  }
})

/** Customer area context: the customer records the user belongs to (or the previewed customer). */
export const customerPortal = cache(async (next = "/kunde") => {
  const g = await requireRolePage(["customer", "admin"], next)
  const viewAs = await getViewAs(g.ctx)
  const preview = viewAs?.type === "customer" ? (viewAs as Extract<ViewAs, { type: "customer" }>) : null
  const customerIds = preview ? [preview.id] : await customerIdsFor(g.org.id, g.user.id, g.user.email)
  const ids = customerIds.length ? customerIds : ["00000000-0000-0000-0000-000000000000"]
  const db = createAdminClient()
  const [{ data: customers }, { data: locations }] = await Promise.all([
    db.from("customers").select("id, name, company, contact_name, email, phone, address, monthly_value").eq("org_id", g.org.id).in("id", ids),
    db.from("locations").select("id, name, address").eq("org_id", g.org.id).in("customer_id", ids).order("name"),
  ])
  return { ...g, preview, customerIds, ids, customers: customers ?? [], locations: locations ?? [], locIds: (locations ?? []).map((l) => l.id) }
})
