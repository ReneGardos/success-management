"use server"

import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { isStaffOf } from "@/lib/backend/staff"
import { threadFor } from "@/lib/backend/chat"

/** Opens (or creates) the thread with a customer ("c:<id>") or employee ("e:<id>"). */
export async function startThread(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const [kind, id] = String(formData.get("who") ?? "").split(":")
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) redirect("/admin/beskeder")
  if (kind === "c") {
    const { data } = await createAdminClient().from("customers").select("id").eq("org_id", org.id).eq("id", id).maybeSingle()
    if (!data) redirect("/admin/beskeder")
    const t = await threadFor(org.id, "customer", id)
    redirect(`/admin/beskeder/${t?.id ?? ""}`)
  }
  if (kind === "e" && (await isStaffOf(org.id, id))) {
    const t = await threadFor(org.id, "employee", id)
    redirect(`/admin/beskeder/${t?.id ?? ""}`)
  }
  redirect("/admin/beskeder")
}
