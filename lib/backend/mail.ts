import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadMailSettings, resolveBanner, type Banner, type MailSettings, defaultSettingsFor } from "@/lib/backend/mail-settings"
import { appUrl, orgSender, websiteUrl, type Org } from "@/lib/org"

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/** The organization's office mailbox (notifications, fallback reply-to). */
export const officeEmailFor = (org: Org) => org.office_email || `${org.mail_from_local || "kontakt"}@${org.mail_domain || process.env.RESEND_EMAIL_DOMAIN}`

/**
 * Where customer replies go. With inbound mail set up, replies come back into the organization's
 * inbox via <alias>+<thread>@RESEND_INBOUND_DOMAIN; otherwise straight to the office mailbox.
 */
export function replyAddressFor(org: Org, contactRequestId?: string | null) {
  const inbound = process.env.RESEND_INBOUND_DOMAIN
  const alias = org.inbound_alias || org.slug
  if (inbound && contactRequestId) return `${alias}+${contactRequestId}@${inbound}`
  if (inbound) return `${alias}@${inbound}`
  return officeEmailFor(org)
}

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_EMAIL_DOMAIN)
}

export function inboundConfigured() {
  return Boolean(process.env.RESEND_INBOUND_DOMAIN && process.env.RESEND_WEBHOOK_SECRET)
}

export type Sender = { name?: string | null; title?: string | null; phone?: string | null; email?: string | null }

type Brand = { primary: string; accent: string; muted: string; border: string; background: string }
const brandOf = (org: Org): Brand => ({ primary: org.color_primary, accent: org.color_accent, muted: "#697987", border: "#E5E9EC", background: org.color_background })

type RenderOptions = { settings?: MailSettings; banner?: Banner | null }

function socialLinks(st: MailSettings, b: Brand) {
  const links = [
    st.facebook_url && ["Facebook", st.facebook_url],
    st.instagram_url && ["Instagram", st.instagram_url],
    st.linkedin_url && ["LinkedIn", st.linkedin_url],
  ].filter(Boolean) as [string, string][]
  if (!links.length) return ""
  return `<div style="margin-top:6px;font-size:12px;">${links.map(([label, url]) => `<a href="${escapeHtml(url)}" style="color:${b.primary};text-decoration:none;font-weight:bold;">${label}</a>`).join(" &nbsp;·&nbsp; ")}</div>`
}

/** HTML signature in the organization's branding: logo, person, contact details, socials. */
export function signatureHtml(org: Org, sender: Sender = {}, settings: MailSettings = defaultSettingsFor(org)) {
  const st = settings
  const b = brandOf(org)
  const site = websiteUrl(org)
  const logo = org.email_logo_url || org.logo_url
  const name = sender.name?.trim() || org.name
  const phone = sender.phone?.trim() || st.company_phone || ""
  const email = sender.email?.trim() || st.company_email || officeEmailFor(org)
  const website = (st.website || org.website || "").replace(/^https?:\/\//, "")
  const showLogo = st.show_logo && Boolean(logo)
  const logoCell = showLogo
    ? `<td style="padding:16px 20px 0 0;vertical-align:top;"><a href="${escapeHtml(site)}"><img src="${escapeHtml(logo!)}" width="170" alt="${escapeHtml(org.name)}" style="display:block;border:0;max-width:170px;height:auto;" /></a></td>`
    : ""
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;border-top:2px solid ${b.accent};padding-top:16px;font-family:Arial,Helvetica,sans-serif;">
<tr>${logoCell}
<td style="padding:16px 0 0 ${showLogo ? "20px" : "0"};${showLogo ? `border-left:1px solid ${b.border};` : ""}vertical-align:top;font-size:13px;line-height:1.6;color:#263746;">
<div style="font-size:15px;font-weight:bold;color:${b.primary};">${escapeHtml(name)}</div>
${sender.title ? `<div style="color:${b.accent};font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:bold;">${escapeHtml(sender.title)}</div>` : ""}
${st.tagline ? `<div style="color:${b.muted};font-size:12px;font-style:italic;margin-top:2px;">${escapeHtml(st.tagline)}</div>` : ""}
${phone ? `<div style="margin-top:6px;">Tlf. <a href="tel:${escapeHtml(phone.replace(/\s+/g, ""))}" style="color:${b.primary};text-decoration:none;">${escapeHtml(phone)}</a></div>` : ""}
<div><a href="mailto:${escapeHtml(email)}" style="color:${b.primary};text-decoration:none;">${escapeHtml(email)}</a></div>
${website ? `<div><a href="https://${escapeHtml(website)}" style="color:${b.primary};text-decoration:none;">${escapeHtml(website)}</a></div>` : ""}
<div style="color:${b.muted};font-size:12px;margin-top:4px;">${escapeHtml(org.legal_name || org.name)}${st.address ? ` · ${escapeHtml(st.address)}` : ""}${st.cvr ? ` · CVR ${escapeHtml(st.cvr)}` : ""}</div>
${socialLinks(st, b)}
</td></tr></table>`
}

export function signatureText(org: Org, sender: Sender = {}, settings: MailSettings = defaultSettingsFor(org)) {
  const st = settings
  const phone = sender.phone?.trim() || st.company_phone
  return [
    "",
    st.closing || "Med venlig hilsen",
    sender.name?.trim() || org.name,
    sender.title?.trim() || "",
    org.legal_name || org.name,
    phone ? `Tlf. ${phone}` : "",
    sender.email?.trim() || st.company_email || officeEmailFor(org),
    [st.website, st.address, st.cvr ? `CVR ${st.cvr}` : ""].filter(Boolean).join(" · "),
    st.disclaimer ? `\n${st.disclaimer}` : "",
  ].filter((line, i) => i < 2 || line !== "").join("\n")
}

function bannerHtml(banner: Banner | null | undefined) {
  if (!banner) return ""
  const img = `<img src="${escapeHtml(banner.image_url)}" width="556" alt="${escapeHtml(banner.alt_text || banner.name)}" style="display:block;width:100%;max-width:556px;height:auto;border:0;border-radius:6px;" />`
  return `<div style="margin:24px 0 0;">${banner.link_url ? `<a href="${escapeHtml(banner.link_url)}">${img}</a>` : img}</div>`
}

/** Wraps body text (and optional extra HTML) in the organization's branded layout. */
export function renderHtml(org: Org, text: string, sender: Sender = {}, extraHtml = "", options: RenderOptions = {}) {
  const st = options.settings ?? defaultSettingsFor(org)
  const b = brandOf(org)
  const body = escapeHtml(text).replace(/\r?\n/g, "<br />")
  const banner = bannerHtml(options.banner)
  const top = st.banner_position === "top" && banner ? `<tr><td style="padding:22px 32px 0;">${banner.replace("margin:24px 0 0;", "margin:0;")}</td></tr>` : ""
  return `<!doctype html><html lang="da"><body style="margin:0;padding:24px 12px;background:${b.background};font-family:Arial,Helvetica,sans-serif;color:#263746;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid ${b.border};border-radius:10px;">
<tr><td style="height:4px;background:${b.primary};border-radius:10px 10px 0 0;font-size:0;line-height:4px;">&nbsp;</td></tr>
${top}
<tr><td style="padding:30px 32px;font-size:15px;line-height:1.65;">${body}${extraHtml}
<p style="margin:26px 0 0;">${escapeHtml(st.closing || "Med venlig hilsen")}</p>
${signatureHtml(org, sender, st)}
${st.banner_position !== "top" ? banner : ""}
${st.disclaimer ? `<p style="margin:22px 0 0;font-size:11px;line-height:1.5;color:${b.muted};">${escapeHtml(st.disclaimer).replace(/\r?\n/g, "<br />")}</p>` : ""}
</td></tr>
</table></td></tr></table></body></html>`
}

/** Short system mail (invite, notification) in the organization's branding, without signature. */
export function renderSystemHtml(org: Org, text: string, extraHtml = "") {
  const b = brandOf(org)
  const body = escapeHtml(text).replace(/\r?\n/g, "<br />")
  return `<!doctype html><html lang="da"><body style="margin:0;padding:24px 12px;background:${b.background};font-family:Arial,Helvetica,sans-serif;color:#263746;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid ${b.border};border-radius:10px;">
<tr><td style="background:${b.primary};padding:20px 32px;border-radius:10px 10px 0 0;color:#fff;font-size:18px;font-weight:bold;">${escapeHtml(org.name)}</td></tr>
<tr><td style="padding:30px 32px;font-size:15px;line-height:1.65;">${body}${extraHtml}</td></tr>
</table></td></tr></table></body></html>`
}

type SendInput = { org: Org; to: string; subject: string; text: string; contactRequestId?: string | null; sentBy?: string | null; sender?: Sender; extraHtml?: string; extraText?: string; bannerId?: string | null }

/** Sends a mail on behalf of the organization and stores it in its thread. */
export async function sendAdminEmail({ org, to, subject, text, contactRequestId, sentBy, sender, extraHtml, extraText, bannerId }: SendInput) {
  if (!mailConfigured()) throw new Error("Mail er ikke sat op (RESEND_API_KEY / RESEND_EMAIL_DOMAIN mangler).")
  const from = orgSender(org)
  const { settings } = await loadMailSettings(org)
  const banner = await resolveBanner(org.id, bannerId, settings)
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    replyTo: replyAddressFor(org, contactRequestId),
    subject,
    text: text + (extraText ? `\n\n${extraText}` : "") + "\n" + signatureText(org, sender, settings),
    html: renderHtml(org, text, sender, extraHtml, { settings, banner }),
  })
  if (error) throw new Error(`Mailen blev ikke sendt: ${error.message}`)

  const db = createAdminClient()
  const { error: saveError } = await db.from("email_messages").insert({
    org_id: org.id,
    contact_request_id: contactRequestId ?? null,
    direction: "outbound",
    from_email: from,
    to_email: to,
    subject,
    body_text: text,
    provider_id: data?.id ?? null,
    sent_by: sentBy ?? null,
    read_at: new Date().toISOString(),
  })
  if (saveError) console.error("Sent mail not stored", saveError.message)
  if (contactRequestId) await db.from("contact_requests").update({ status: "answered" }).eq("org_id", org.id).eq("id", contactRequestId)
  return { id: data?.id ?? null, stored: !saveError }
}

/** Short notice to the organization's office when a customer replies. */
export async function notifyOfficeOfReply(org: Org, fromEmail: string, subject: string, threadUrl: string) {
  if (!mailConfigured()) return
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: orgSender(org, "noreply"),
    to: [officeEmailFor(org)],
    subject: `Nyt svar fra ${fromEmail}: ${subject}`,
    text: `${fromEmail} har svaret på en mail.\n\nLæs og svar i Success Management: ${threadUrl}`,
  })
}

export function button(org: Org, href: string, label: string) {
  return `<p style="margin:26px 0 4px;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${org.color_primary};color:#fff;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:6px;">${escapeHtml(label)}</a></p>`
}

/** Invitation with a link to choose a password (or just sign in, for existing users). */
export async function sendInviteEmail(org: Org, to: string, name: string, roleName: string, link: string, existingUser = false) {
  if (!mailConfigured()) throw new Error("Mail er ikke sat op (RESEND_API_KEY / RESEND_EMAIL_DOMAIN mangler).")
  const resend = new Resend(process.env.RESEND_API_KEY)
  const firstName = name.split(" ")[0]
  const intro = `Hej ${firstName}\n\nDu er blevet tilføjet som ${roleName} hos ${org.name}.`
  const text = existingUser
    ? `${intro} Du bruger dit eksisterende login og kan skifte virksomhed øverst i menuen.\n\n${link}`
    : `${intro} Klik på linket for at vælge din adgangskode:\n\n${link}\n\nLinket virker i 24 timer.`
  const { error } = await resend.emails.send({
    from: orgSender(org, "noreply"),
    to: [to],
    replyTo: officeEmailFor(org),
    subject: `Din adgang til ${org.name}`,
    text,
    html: renderSystemHtml(org, existingUser ? `${intro} Du bruger dit eksisterende login og kan skifte virksomhed øverst i menuen.` : `${intro} Brug knappen herunder til at vælge din adgangskode. Linket virker i 24 timer.`, button(org, link, existingUser ? "Log ind" : "Vælg adgangskode")),
  })
  if (error) throw new Error(`Invitationen blev ikke sendt: ${error.message}`)
}

/** Signature details for the signed-in person in this organization. */
export async function senderFor(org: Org, userId: string, email: string | null): Promise<Sender> {
  const db = createAdminClient()
  const [{ data: profile }, { data: membership }] = await Promise.all([
    db.from("profiles").select("full_name, job_title, phone").eq("id", userId).maybeSingle(),
    db.from("memberships").select("job_title, work_email").eq("org_id", org.id).eq("user_id", userId).maybeSingle(),
  ])
  const ownDomain = org.mail_domain && email?.toLowerCase().endsWith(`@${org.mail_domain.toLowerCase()}`) ? email : null
  return {
    name: profile?.full_name || null,
    title: membership?.job_title || profile?.job_title || null,
    phone: profile?.phone || null,
    email: membership?.work_email || ownDomain,
  }
}

export const threadLink = (contactRequestId: string) => `${appUrl()}/admin/mail/${contactRequestId}`
