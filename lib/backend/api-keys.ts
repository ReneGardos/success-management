import { createHash, randomBytes } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadOrgById, type Org } from "@/lib/org"

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex")

/** New secret key: "smk_live_<48 hex>". Only the hash is stored; show the key once. */
export function generateKey() {
  const key = `smk_live_${randomBytes(24).toString("hex")}`
  return { key, prefix: key.slice(0, 13), hash: hashKey(key) }
}

export type Site = { id: string; org_id: string; name: string; domain: string; public_id: string; allowed_origins: string[]; platform: string }

/** Resolves a secret API key (header "Authorization: Bearer …" or "x-api-key") to its organization. */
export async function authenticateApiKey(request: Request): Promise<{ org: Org; site: Site | null; keyId: string } | null> {
  const auth = request.headers.get("authorization")
  const key = (auth?.startsWith("Bearer ") ? auth.slice(7) : request.headers.get("x-api-key"))?.trim()
  if (!key || !key.startsWith("smk_")) return null
  const db = createAdminClient()
  const { data } = await db.from("org_api_keys").select("id, org_id, site_id, revoked_at").eq("key_hash", hashKey(key)).maybeSingle()
  if (!data || data.revoked_at) return null
  const org = await loadOrgById(String(data.org_id))
  if (!org || !org.active) return null
  let site: Site | null = null
  if (data.site_id) {
    const { data: s } = await db.from("sites").select("*").eq("id", data.site_id).eq("org_id", org.id).maybeSingle()
    site = (s as Site | null) ?? null
  }
  await db.from("org_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id)
  return { org, site, keyId: String(data.id) }
}

/** Resolves a public site ID (used by the tracking script and browser forms). */
export async function siteByPublicId(publicId: string | null | undefined) {
  if (!publicId || !/^[a-f0-9]{8,40}$/.test(publicId)) return null
  const { data } = await createAdminClient().from("sites").select("*").eq("public_id", publicId).maybeSingle()
  if (!data) return null
  const org = await loadOrgById(String(data.org_id))
  if (!org || !org.active) return null
  return { site: data as Site, org }
}

/** True when the browser Origin belongs to the site (allowed_origins, or the domain with/without www). */
export function originAllowed(site: Site, origin: string | null) {
  if (!origin) return false
  try {
    const host = new URL(origin).hostname.replace(/^www\./, "")
    if (host === site.domain.replace(/^www\./, "")) return true
    return site.allowed_origins.some((o) => o.replace(/\/$/, "") === origin.replace(/\/$/, ""))
  } catch {
    return false
  }
}

export function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, x-api-key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
}
