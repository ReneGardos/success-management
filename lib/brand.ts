import type { CSSProperties } from "react"
import type { Org } from "@/lib/org"

const hex = /^#[0-9a-f]{6}$/i
const safe = (value: string | null | undefined, fallback: string) => (value && hex.test(value) ? value : fallback)

/** CSS variables for the organization's colours, applied on the admin frame and portals. */
export function brandStyle(org: Pick<Org, "color_primary" | "color_accent" | "color_background" | "color_muted">): CSSProperties {
  const primary = safe(org.color_primary, "#102D46")
  const accent = safe(org.color_accent, "#C6A467")
  return {
    ["--adm-primary" as string]: primary,
    ["--adm-primary-dark" as string]: `color-mix(in srgb, ${primary} 72%, #000)`,
    ["--adm-primary-light" as string]: `color-mix(in srgb, ${primary} 80%, #fff)`,
    ["--adm-gold" as string]: accent,
    ["--adm-gold-dark" as string]: `color-mix(in srgb, ${accent} 72%, #000)`,
    ["--adm-gold-light" as string]: `color-mix(in srgb, ${accent} 40%, #fff)`,
    ["--adm-info" as string]: `color-mix(in srgb, ${primary} 80%, #fff)`,
    ["--adm-warning" as string]: accent,
    ["--adm-body" as string]: safe(org.color_background, "#F7F5F0"),
    ["--adm-success" as string]: safe(org.color_muted, "#5E7A69"),
    ["--quote-primary" as string]: primary,
    ["--quote-accent" as string]: accent,
  }
}

export const isHexColor = (value: string) => hex.test(value)
