"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateKey } from "@/lib/backend/api-keys"

const back = "/admin/hjemmesider"
const text = (formData: FormData, key: string, max = 200) => String(formData.get(key) ?? "").trim().slice(0, max)
const fail = (message: string): never => redirect(`${back}?fejl=${encodeURIComponent(message)}`)
const platforms = ["custom", "nextjs", "wix", "wordpress", "other"]

export async function addSite(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const domain = text(formData, "domain").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) fail("Skriv et gyldigt domæne, fx firma.dk")
  const platform = platforms.includes(text(formData, "platform")) ? text(formData, "platform") : "custom"
  const { error } = await createAdminClient().from("sites").insert({
    org_id: org.id,
    name: text(formData, "name") || domain,
    domain,
    platform,
    allowed_origins: [`https://${domain}`, `https://www.${domain}`],
  })
  if (error) fail(error.message)
  revalidatePath(back)
  redirect(`${back}?gemt=1`)
}

export async function deleteSite(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  await createAdminClient().from("sites").delete().eq("org_id", org.id).eq("id", text(formData, "id", 64))
  revalidatePath(back)
}

/** Creates a secret key and returns it once; only the hash is stored. */
export async function createApiKey(_prev: unknown, formData: FormData): Promise<{ key?: string; error?: string }> {
  const { org, user } = await requireRoleAction(["admin"])
  const db = createAdminClient()
  const siteId = text(formData, "site_id", 64) || null
  if (siteId) {
    const { data } = await db.from("sites").select("id").eq("org_id", org.id).eq("id", siteId).maybeSingle()
    if (!data) return { error: "Hjemmesiden findes ikke." }
  }
  const { key, prefix, hash } = generateKey()
  const { error } = await db.from("org_api_keys").insert({ org_id: org.id, site_id: siteId, name: text(formData, "name", 80) || "API-nøgle", key_prefix: prefix, key_hash: hash, created_by: user.id })
  if (error) return { error: error.message }
  revalidatePath(back)
  return { key }
}

export async function revokeApiKey(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  await createAdminClient().from("org_api_keys").update({ revoked_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", text(formData, "id", 64))
  revalidatePath(back)
}
