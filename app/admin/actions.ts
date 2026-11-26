"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireRoleAction } from "@/lib/auth-guard"

const statusOptions = {
  leads: ["new", "contacted", "qualified", "quoted", "won", "lost"],
  quotes: ["draft", "sent", "accepted", "declined", "expired"],
  jobs: ["scheduled", "in_progress", "completed", "cancelled"],
} as const

const deletable = ["contact_requests", "leads", "quotes", "jobs"] as const

type StatusTable = keyof typeof statusOptions

async function requireAdmin() {
  const { org } = await requireRoleAction(["admin"])
  return org.id
}

export async function updateStatus(table: StatusTable, id: string, status: string) {
  const orgId = await requireAdmin()
  if (!(table in statusOptions) || !(statusOptions[table] as readonly string[]).includes(status)) {
    return { ok: false, message: "Ugyldig status" }
  }
  const { error } = await createAdminClient().from(table).update({ status, updated_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", id)
  if (error) return { ok: false, message: error.message }
  revalidatePath("/admin", "layout")
  return { ok: true }
}

export async function deleteRecord(table: (typeof deletable)[number], id: string) {
  const orgId = await requireAdmin()
  if (!(deletable as readonly string[]).includes(table)) return { ok: false, message: "Ugyldig tabel" }
  const { error } = await createAdminClient().from(table).delete().eq("org_id", orgId).eq("id", id)
  if (error) return { ok: false, message: error.message }
  revalidatePath("/admin", "layout")
  return { ok: true }
}
