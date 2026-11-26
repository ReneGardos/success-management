import { createAdminClient } from "@/lib/supabase/admin"
import type { Org } from "@/lib/org"

export type MailSettings = {
  show_logo: boolean
  tagline: string | null
  company_phone: string | null
  company_email: string | null
  website: string | null
  address: string | null
  cvr: string | null
  facebook_url: string | null
  instagram_url: string | null
  linkedin_url: string | null
  closing: string | null
  disclaimer: string | null
  default_banner_id: string | null
  banner_position: "top" | "bottom"
}

export type Banner = { id: string; name: string; image_url: string; link_url: string | null; alt_text: string | null; active: boolean }

/** Defaults derived from the organization itself, used until settings are saved. */
export function defaultSettingsFor(org: Org): MailSettings {
  return {
    show_logo: Boolean(org.email_logo_url || org.logo_url),
    tagline: null,
    company_phone: org.phone,
    company_email: org.office_email,
    website: org.website,
    address: org.address,
    cvr: org.cvr,
    facebook_url: null,
    instagram_url: null,
    linkedin_url: null,
    closing: "Med venlig hilsen",
    disclaimer: null,
    default_banner_id: "none",
    banner_position: "bottom",
  }
}

export async function loadMailSettings(org: Org): Promise<{ settings: MailSettings; stored: boolean }> {
  const defaults = defaultSettingsFor(org)
  const { data, error } = await createAdminClient().from("email_settings").select("*").eq("org_id", org.id).maybeSingle()
  if (error || !data) return { settings: defaults, stored: false }
  const stored = Object.fromEntries(Object.entries(data).filter(([k, v]) => v !== null && v !== undefined && k !== "org_id" && k !== "updated_at"))
  return { settings: { ...defaults, ...stored } as MailSettings, stored: true }
}

export async function loadBanners(orgId: string, includeInactive = false): Promise<Banner[]> {
  let query = createAdminClient().from("email_banners").select("*").eq("org_id", orgId).order("created_at", { ascending: false })
  if (!includeInactive) query = query.eq("active", true)
  const { data } = await query
  return (data ?? []) as Banner[]
}

/** The banner to use: explicit choice ("none" = no banner) or the organization's default. */
export async function resolveBanner(orgId: string, choice: string | null | undefined, settings: MailSettings): Promise<Banner | null> {
  const id = choice === undefined || choice === null || choice === "" ? settings.default_banner_id : choice
  if (!id || id === "none") return null
  const banners = await loadBanners(orgId)
  return banners.find((b) => b.id === id) ?? null
}
