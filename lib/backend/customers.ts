import { createAdminClient } from "@/lib/supabase/admin"

/** The customer record(s) a portal user belongs to in an organization (linked profile or same email). */
export async function customerIdsFor(orgId: string, userId: string, email: string | null) {
  const db = createAdminClient()
  const safe = email && /^[^%_,()\s"]+@[^%_,()\s"]+$/.test(email) ? email : null
  const [{ data: byProfile }, { data: byEmail }] = await Promise.all([
    db.from("customers").select("id").eq("org_id", orgId).eq("profile_id", userId),
    safe ? db.from("customers").select("id").eq("org_id", orgId).ilike("email", safe) : Promise.resolve({ data: [] as { id: string }[] }),
  ])
  return [...new Set([...(byProfile ?? []), ...(byEmail ?? [])].map((c) => String(c.id)))]
}
