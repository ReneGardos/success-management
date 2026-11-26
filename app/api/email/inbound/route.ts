import { createHmac, timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { notifyOfficeOfReply, threadLink } from "@/lib/backend/mail"
import { appUrl, loadOrgById } from "@/lib/org"

export const runtime = "nodejs"

/** Verifies a Resend (Svix) webhook signature. */
function verifySignature(body: string, headers: Headers, secret: string) {
  const id = headers.get("svix-id")
  const timestamp = headers.get("svix-timestamp")
  const signatures = headers.get("svix-signature")
  if (!id || !timestamp || !signatures) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 5 * 60) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest()
  return signatures.split(" ").some((entry) => {
    const [, sig] = entry.split(",")
    if (!sig) return false
    const given = Buffer.from(sig, "base64")
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

// <alias>+<contact request id>@inbound-domain, or <alias>@inbound-domain. "svar" is the legacy alias.
const addressPattern = /([a-z0-9-]+)(?:\+([0-9a-f-]{36}))?@/gi

function bareAddress(value: string) {
  const match = value.match(/<([^>]+)>/)
  return (match ? match[1] : value).trim().toLowerCase()
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const apiKey = process.env.RESEND_API_KEY
  if (!secret || !apiKey) return NextResponse.json({ message: "Inbound mail er ikke sat op" }, { status: 503 })

  const raw = await request.text()
  if (!verifySignature(raw, request.headers, secret)) return NextResponse.json({ message: "Ugyldig signatur" }, { status: 401 })

  const event = JSON.parse(raw) as { type?: string; data?: { email_id?: string; from?: string; to?: string[]; subject?: string } }
  if (event.type !== "email.received" || !event.data?.email_id) return NextResponse.json({ ok: true })

  // The webhook only carries metadata; fetch the content.
  const response = await fetch(`https://api.resend.com/emails/receiving/${event.data.email_id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) return NextResponse.json({ message: "Kunne ikke hente mailen" }, { status: 502 })
  const email = (await response.json()) as { from?: string; to?: string[]; subject?: string; text?: string; html?: string; created_at?: string }

  const fromEmail = bareAddress(email.from ?? event.data.from ?? "")
  const recipients = [...(email.to ?? []), ...(event.data.to ?? [])].join(" ")
  const db = createAdminClient()

  const inboundDomain = (process.env.RESEND_INBOUND_DOMAIN ?? "").toLowerCase()
  let orgId: string | null = null
  let requestId: string | null = null
  for (const match of recipients.matchAll(addressPattern)) {
    const [address, alias, id] = match
    if (inboundDomain && !recipients.toLowerCase().includes(`${address.toLowerCase()}${inboundDomain}`)) continue
    if (id) {
      const { data: thread } = await db.from("contact_requests").select("id, org_id").eq("id", id).maybeSingle()
      if (thread) { orgId = String(thread.org_id); requestId = String(thread.id); break }
    }
    const { data: org } = await db.from("organizations").select("id").eq("inbound_alias", alias.toLowerCase()).maybeSingle()
    if (org) { orgId = String(org.id); break }
  }
  if (!orgId) {
    console.error("Inbound mail without known organization", recipients)
    return NextResponse.json({ ok: true, ignored: "unknown recipient" })
  }
  if (!requestId && fromEmail) {
    const { data: latest } = await db.from("contact_requests").select("id").eq("org_id", orgId).ilike("email", fromEmail).order("created_at", { ascending: false }).limit(1).maybeSingle()
    requestId = latest?.id ? String(latest.id) : null
  }

  const { error } = await db.from("email_messages").upsert(
    {
      org_id: orgId,
      contact_request_id: requestId,
      direction: "inbound",
      from_email: fromEmail,
      to_email: recipients.slice(0, 500),
      subject: email.subject ?? event.data.subject ?? "(uden emne)",
      body_text: email.text ?? null,
      body_html: email.html ?? null,
      provider_id: event.data.email_id,
    },
    { onConflict: "provider_id", ignoreDuplicates: true },
  )
  if (error) {
    console.error("Inbound mail not stored", error.message)
    return NextResponse.json({ message: "Kunne ikke gemme mailen" }, { status: 500 })
  }
  if (requestId) await db.from("contact_requests").update({ status: "customer_replied" }).eq("org_id", orgId).eq("id", requestId)

  const org = await loadOrgById(orgId)
  if (org) await notifyOfficeOfReply(org, fromEmail, email.subject ?? "", requestId ? threadLink(requestId) : `${appUrl()}/admin/mail`).catch(() => {})
  return NextResponse.json({ ok: true })
}
