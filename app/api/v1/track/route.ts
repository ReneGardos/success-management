import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { corsHeaders, siteByPublicId } from "@/lib/backend/api-keys"

export const runtime = "nodejs"

const botPattern = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|vercel/i

function referrerHost(referrer: string, siteDomain: string) {
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "")
    if (!host || host === siteDomain.replace(/^www\./, "")) return null
    return host
  } catch {
    return null
  }
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) })
}

/**
 * Cookieless page view from a website. Body: { site, path, referrer, utm, width }.
 * Also accepts the site ID as ?site=… so navigator.sendBeacon can be used.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const headers = corsHeaders(origin)
  const done = () => new NextResponse(null, { status: 204, headers })
  const userAgent = request.headers.get("user-agent") ?? ""
  if (!userAgent || botPattern.test(userAgent)) return done()

  const body = (await request.json().catch(() => null)) as { site?: string; path?: string; referrer?: string; utm?: string; width?: number } | null
  const found = await siteByPublicId(body?.site ?? request.nextUrl.searchParams.get("site"))
  if (!found) return done()
  const { site, org } = found

  const path = typeof body?.path === "string" ? body.path.slice(0, 300) : ""
  if (!path.startsWith("/")) return done()

  // Server-to-server calls forward the visitor's IP/UA in these headers.
  const ip = request.headers.get("x-visitor-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? ""
  const ua = request.headers.get("x-visitor-ua") ?? userAgent
  const day = new Date().toISOString().slice(0, 10)
  // Daily-rotating hash: unique visitors per day without cookies or storing the IP.
  const salt = process.env.ANALYTICS_SALT ?? "success-management"
  const visitorHash = createHash("sha256").update(`${day}|${site.id}|${ip}|${ua}|${salt}`).digest("hex").slice(0, 32)
  const width = Number(body?.width) || 0
  const city = request.headers.get("x-visitor-city") ?? request.headers.get("x-vercel-ip-city")

  const { error } = await createAdminClient().from("page_views").insert({
    org_id: org.id,
    site_id: site.id,
    path,
    referrer_host: referrerHost(String(body?.referrer ?? ""), site.domain),
    utm_source: body?.utm ? String(body.utm).slice(0, 80) : null,
    device: width && width < 768 ? "mobil" : width && width < 1100 ? "tablet" : "computer",
    country: request.headers.get("x-visitor-country") ?? request.headers.get("x-vercel-ip-country"),
    city: city ? decodeURIComponent(city) : null,
    visitor_hash: visitorHash,
  })
  if (error) console.error("Page view not stored", error.message)
  return done()
}
