import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { authenticateApiKey, corsHeaders, originAllowed, siteByPublicId } from "@/lib/backend/api-keys"
import { contactSubmissionSchema, createLead, notifyLead, saveLead } from "@/lib/backend/contact"
import { isRateLimited } from "@/lib/backend/rate-limit"

export const runtime = "nodejs"

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) })
}

/**
 * Contact form / quote request from a website.
 * - Server-to-server: "Authorization: Bearer smk_live_…" (recommended; Next.js route, Wix Velo backend).
 * - Browser: { site: "<public site id>", … } from an allowed origin.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const headers = corsHeaders(origin)
  const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers })

  try {
    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!payload || typeof payload !== "object") return json({ message: "Ugyldig forespørgsel. Genindlæs siden og prøv igen." }, 400)

    const byKey = await authenticateApiKey(request)
    let auth = byKey ? { org: byKey.org, site: byKey.site } : null
    if (!auth) {
      const found = await siteByPublicId(typeof payload.site === "string" ? payload.site : null)
      if (found && originAllowed(found.site, origin)) auth = found
    }
    if (!auth) return json({ message: "Ikke autoriseret." }, 401)

    const client = request.headers.get("x-visitor-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    if (isRateLimited(`${auth.org.id}|${client}`, 10, 15 * 60 * 1000)) return json({ message: "For mange beskeder på kort tid. Prøv igen senere." }, 429)

    const submission = contactSubmissionSchema.parse(payload)
    if (submission.hp_check) return json({ message: "Tak for din henvendelse." }, 202)

    const lead = createLead(submission)
    const siteName = auth.site?.domain ?? auth.org.website ?? auth.org.name
    const [saved, notified] = await Promise.allSettled([saveLead(auth.org, auth.site?.id ?? null, lead), notifyLead(auth.org, lead, siteName)])
    if (saved.status === "rejected") console.error("Contact lead save failed", saved.reason)
    if (notified.status === "rejected") console.error("Contact lead notification failed", notified.reason)
    if (saved.status === "rejected" && notified.status === "rejected") {
      return json({ message: `Vi kunne ikke sende beskeden lige nu.${auth.org.phone ? ` Ring til os på ${auth.org.phone}.` : " Prøv igen om lidt."}` }, 502)
    }
    return json({ message: "Tak for din henvendelse. Vi vender tilbage hurtigst muligt.", id: lead.id }, 201)
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors = error.flatten().fieldErrors
      const firstError = Object.values(fieldErrors).flat().find(Boolean)
      return json({ message: firstError ?? "Tjek felterne og prøv igen.", errors: fieldErrors }, 400)
    }
    console.error("Contact submission failed", error)
    return json({ message: "Vi kunne ikke sende beskeden lige nu. Prøv igen om lidt." }, 500)
  }
}
