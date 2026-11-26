import { createAdminClient } from "@/lib/supabase/admin"
import type { OrgRole } from "@/lib/org"

export type Person = { id: string; email: string; name: string; role: OrgRole; phone: string | null; jobTitle: string | null; createdAt: string; lastSignIn: string | null; confirmed: boolean }

/** Everyone with a membership in the organization, with their profile and login status. */
export async function listPeople(orgId: string): Promise<{ people: Person[]; error: string | null }> {
  const db = createAdminClient()
  const { data: members, error: memberError } = await db.from("memberships").select("user_id, role, job_title, created_at").eq("org_id", orgId)
  if (memberError) return { people: [], error: memberError.message }
  const ids = (members ?? []).map((m) => String(m.user_id))
  if (!ids.length) return { people: [], error: null }
  const [{ data: usersPage, error }, { data: profiles }] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    db.from("profiles").select("id, full_name, phone, job_title").in("id", ids),
  ])
  if (error) return { people: [], error: error.message }
  const users = new Map(usersPage.users.map((u) => [u.id, u]))
  const byId = new Map((profiles ?? []).map((p) => [String(p.id), p]))
  const people = (members ?? []).map((m) => {
    const id = String(m.user_id)
    const u = users.get(id)
    const p = byId.get(id)
    return {
      id,
      email: u?.email ?? "",
      name: (p?.full_name as string | null) || (u?.user_metadata?.full_name as string | undefined) || u?.email || "Uden navn",
      role: m.role as OrgRole,
      phone: (p?.phone as string | null) ?? null,
      jobTitle: (m.job_title as string | null) || (p?.job_title as string | null) || null,
      createdAt: String(m.created_at),
      lastSignIn: u?.last_sign_in_at ?? null,
      confirmed: Boolean(u?.email_confirmed_at),
    }
  })
  people.sort((a, b) => a.name.localeCompare(b.name, "da"))
  return { people, error: null }
}

export async function listStaff(orgId: string) {
  const { people, error } = await listPeople(orgId)
  return { staff: people.filter((p) => p.role !== "customer"), error }
}

/** True when the user is staff (owner/admin/employee) in the organization. */
export async function isStaffOf(orgId: string, userId: string) {
  const { data } = await createAdminClient().from("memberships").select("role").eq("org_id", orgId).eq("user_id", userId).maybeSingle()
  return Boolean(data && data.role !== "customer")
}
