import { Resend } from "resend"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { escapeHtml, mailConfigured, officeEmailFor } from "@/lib/backend/mail"
import { appUrl, orgSender, type Org } from "@/lib/org"

export const contactSubmissionSchema = z.object({
  name: z.string().trim().min(2, "Navn skal være mindst 2 tegn.").max(120),
  email: z.string().trim().email("Indtast en gyldig email.").max(180),
  phone: z.string().trim().max(40).optional().default(""),
  company: z.string().trim().max(160).optional().default(""),
  service: z.string().trim().max(80).optional().default(""),
  message: z.string().trim().min(2, "Skriv en kort besked.").max(4000),
  source: z.string().trim().max(60).optional().default("website"),
  page: z.string().trim().max(500).optional().default(""),
  // Honeypot: real visitors never see it. A filled value is treated as spam silently.
  hp_check: z.string().max(500).optional().default(""),
  website: z.string().max(500).optional().default(""),
})

export type ContactSubmissionInput = z.infer<typeof contactSubmissionSchema>

export type ContactLead = { id: string; name: string; email: string; phone: string; company: string; service: string; message: string; source: string; page: string; createdAt: string }

export function createLead(input: ContactSubmissionInput): ContactLead {
  return {
    id: crypto.randomUUID(),
    name: input.name,
    email: input.email,
    phone: input.phone ?? "",
    company: input.company ?? "",
    service: input.service ?? "",
    message: input.message,
    source: input.source || "website",
    page: input.page ?? "",
    createdAt: new Date().toISOString(),
  }
}

/** Stores the submission as a contact request (inbox) and a lead (pipeline) in the organization. */
export async function saveLead(org: Org, siteId: string | null, lead: ContactLead) {
  const db = createAdminClient()
  const details = [lead.company ? `Virksomhed: ${lead.company}` : "", lead.service ? `Service: ${lead.service}` : "", lead.message].filter(Boolean).join("\n")

  const { error } = await db.from("contact_requests").insert({
    id: lead.id,
    org_id: org.id,
    site_id: siteId,
    name: lead.name,
    email: lead.email,
    phone: lead.phone || null,
    company: lead.company || null,
    service: lead.service || null,
    message: details || lead.message,
    source: lead.source,
    created_at: lead.createdAt,
  })
  if (error) throw new Error(`Saving contact request failed: ${error.message}`)

  const { error: leadError } = await db.from("leads").insert({
    org_id: org.id,
    contact_request_id: lead.id,
    name: lead.name,
    company: lead.company || null,
    source: lead.source,
    email: lead.email,
    phone: lead.phone || null,
    message: details || lead.message,
  })
  if (leadError) console.error("Saving lead failed", leadError.message)
}

function formatDanishDate(iso: string) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Copenhagen" }).format(new Date(iso))
}

function renderLeadEmail(org: Org, lead: ContactLead, siteName: string) {
  const primary = org.color_primary
  const accent = org.color_accent
  const text = "#252D32"
  const muted = "#69757C"
  const border = "#E2E7E8"
  const light = "#F5F7F6"
  const notGiven = `<span style="color:${muted};">Ikke oplyst</span>`
  const rows: Array<[string, string]> = [
    ["Navn", escapeHtml(lead.name)],
    ["E-mail", `<a href="mailto:${escapeHtml(lead.email)}" style="color:${primary};">${escapeHtml(lead.email)}</a>`],
    ["Telefon", lead.phone ? `<a href="tel:${escapeHtml(lead.phone.replace(/\s+/g, ""))}" style="color:${primary};">${escapeHtml(lead.phone)}</a>` : notGiven],
    ["Virksomhed", lead.company ? escapeHtml(lead.company) : notGiven],
    ["Service", lead.service ? escapeHtml(lead.service) : notGiven],
    ["Modtaget", escapeHtml(formatDanishDate(lead.createdAt))],
  ]
  const detailRows = rows
    .map(([label, value], i) => `<tr><td style="padding:14px 20px;width:130px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${muted};vertical-align:top;${i ? `border-top:1px solid ${border};` : ""}">${label}</td><td style="padding:14px 20px;font-size:15px;color:${text};vertical-align:top;${i ? `border-top:1px solid ${border};` : ""}">${value}</td></tr>`)
    .join("")
  const message = escapeHtml(lead.message).replace(/\r?\n/g, "<br />")
  return `<!doctype html><html lang="da"><body style="margin:0;padding:0;background:${light};font-family:Arial,Helvetica,sans-serif;color:${text};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${light};padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid ${border};border-radius:12px;overflow:hidden;">
<tr><td style="background:${primary};padding:28px 32px;"><div style="font-size:20px;font-weight:bold;color:#fff;">${escapeHtml(org.name)}</div><div style="margin-top:4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${accent};">Ny henvendelse fra ${escapeHtml(siteName)}</div></td></tr>
<tr><td style="height:3px;background:${accent};line-height:3px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:32px 32px 8px;"><h1 style="margin:0;font-size:22px;line-height:1.3;color:${primary};">${escapeHtml(lead.name)} har sendt en forespørgsel</h1><p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:${muted};">Svar fra indbakken i Success Management, så tråden bliver samlet.</p></td></tr>
<tr><td style="padding:24px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:8px;">${detailRows}</table></td></tr>
<tr><td style="padding:28px 32px 0;"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${muted};margin-bottom:10px;">Besked</div><div style="background:${light};border-left:3px solid ${accent};border-radius:4px;padding:18px 20px;font-size:15px;line-height:1.65;">${message}</div></td></tr>
<tr><td style="padding:28px 32px 32px;"><a href="${appUrl()}/admin/mail/${lead.id}" style="display:inline-block;background:${primary};color:#fff;text-decoration:none;font-size:15px;font-weight:bold;padding:13px 24px;border-radius:6px;">Åbn i indbakken</a></td></tr>
<tr><td style="background:${light};border-top:1px solid ${border};padding:18px 32px;font-size:12px;color:${muted};">Kilde: ${escapeHtml(lead.source)}${lead.page ? ` · ${escapeHtml(lead.page)}` : ""} · Ref. ${escapeHtml(lead.id.slice(0, 8))}</td></tr>
</table></td></tr></table></body></html>`
}

/** Mails the organization's office about a new submission. */
export async function notifyLead(org: Org, lead: ContactLead, siteName: string) {
  if (!mailConfigured()) throw new Error("Resend email delivery is not configured")
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: orgSender(org, "noreply"),
    to: [officeEmailFor(org)],
    replyTo: lead.email,
    subject: `Ny henvendelse: ${lead.name}${lead.company ? ` (${lead.company})` : ""}`,
    html: renderLeadEmail(org, lead, siteName),
    text: [
      `Ny henvendelse fra ${siteName}`,
      "",
      `Navn: ${lead.name}`,
      `Email: ${lead.email}`,
      `Telefon: ${lead.phone || "Ikke oplyst"}`,
      `Virksomhed: ${lead.company || "Ikke oplyst"}`,
      `Service: ${lead.service || "Ikke valgt"}`,
      `Modtaget: ${formatDanishDate(lead.createdAt)}`,
      "",
      "Besked:",
      lead.message,
      "",
      `Åbn: ${appUrl()}/admin/mail/${lead.id}`,
    ].join("\n"),
  })
  if (error) throw new Error(`Resend delivery failed: ${error.message}`)
}
