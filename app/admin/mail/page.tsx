import Link from "next/link"
import { ArrowLeft, Mail, PenLine } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { inboundConfigured, mailConfigured, officeEmailFor, senderFor, signatureHtml } from "@/lib/backend/mail"
import { loadBanners, loadMailSettings } from "@/lib/backend/mail-settings"
import { saveSignature, sendMail } from "./actions"
import BannerSelect from "@/components/banner-select"

export const dynamic = "force-dynamic"

const statusLabels: Record<string, string> = { new: "Ny", answered: "Besvaret", customer_replied: "Kunden har svaret", closed: "Afsluttet" }
const filters = [
  { value: "aabne", label: "Kræver svar" },
  { value: "alle", label: "Alle" },
  { value: "afsluttet", label: "Afsluttede" },
]

type RequestRow = { id: string; name: string; email: string; phone: string | null; message: string | null; created_at: string; status?: string | null }

export default async function MailInbox({ searchParams }: { searchParams: Promise<{ vis?: string; sendt?: string; fejl?: string; ny?: string; signatur?: string }> }) {
  const { user, org } = await requireRolePage(["admin"], "/admin/mail")
  const { vis = "aabne", sendt, fejl, ny, signatur } = await searchParams
  const [me, banners, { settings }] = await Promise.all([senderFor(org, user.id, user.email ?? null), loadBanners(org.id), loadMailSettings(org)])
  const db = createAdminClient()

  let query = db.from("contact_requests").select("*").eq("org_id", org.id).order("created_at", { ascending: false }).limit(200)
  if (vis === "aabne") query = query.in("status", ["new", "customer_replied"])
  if (vis === "afsluttet") query = query.eq("status", "closed")
  const { data, error } = await query

  const requests = (data ?? []) as RequestRow[]

  const { data: messages, error: messagesError } = await db.from("email_messages").select("contact_request_id, direction, read_at, created_at, from_email, subject, id").eq("org_id", org.id).order("created_at", { ascending: false }).limit(1000)
  const counts = new Map<string, { total: number; unread: number }>()
  for (const m of messages ?? []) {
    if (!m.contact_request_id) continue
    const c = counts.get(m.contact_request_id) ?? { total: 0, unread: 0 }
    c.total += 1
    if (m.direction === "inbound" && !m.read_at) c.unread += 1
    counts.set(m.contact_request_id, c)
  }
  const unlinked = (messages ?? []).filter((m) => m.direction === "inbound" && !m.contact_request_id).slice(0, 20)

  return (
    <main className="admin-shell">
      <div className="admin-workspace">
        <Link href="/admin" className="admin-back"><ArrowLeft className="size-4" /> Tilbage til overblik</Link>
        <p className="admin-eyebrow">{org.name} / Mail</p>
        <div className="admin-workspace-heading">
          <div><h1>Indbakke</h1><p>Henvendelser fra hjemmesiden, dine svar og kundernes svar samlet ét sted. Mails sendes som {org.mail_from_name || org.name}.</p></div>
          <Link href="?ny=1#ny-mail" className="admin-primary"><PenLine className="size-4" /> Ny mail</Link>
        </div>

        {sendt && <p className="admin-notice is-ok" role="status">Mailen er sendt.</p>}
        {signatur && <p className="admin-notice is-ok" role="status">Din signatur er gemt.</p>}
        {fejl && <p className="admin-notice is-error" role="alert">{fejl}</p>}
        {!mailConfigured() && <p className="admin-notice is-error">Afsendelse af mail er ikke sat op i Vercel (RESEND_API_KEY / RESEND_EMAIL_DOMAIN).</p>}
        {mailConfigured() && !inboundConfigured() && <p className="admin-notice">Kundernes svar går lige nu til {officeEmailFor(org)}. Når modtagelse i Resend er sat op, lander de også her.</p>}
        {messagesError && <p className="admin-notice is-error">Mailhistorik kræver database-opdateringen (tabellen email_messages).</p>}

        {ny && (
          <form action={sendMail} className="admin-form" id="ny-mail">
            <h2>Ny mail</h2>
            <input type="hidden" name="returnTo" value="/admin/mail" />
            <label>Til<input name="to" type="email" required placeholder="kunde@firma.dk" /></label>
            <label>Emne<input name="subject" required /></label>
            <label>Besked<textarea name="text" rows={8} required /></label>
            <BannerSelect banners={banners} defaultId={settings.default_banner_id ?? "none"} />
            <div className="admin-form-actions"><button type="submit" className="admin-primary"><Mail className="size-4" /> Send</button><Link href="/admin/mail">Annullér</Link></div>
          </form>
        )}

        <nav className="admin-tabs" aria-label="Filter">
          {filters.map((f) => <Link key={f.value} href={`?vis=${f.value}`} aria-current={vis === f.value ? "page" : undefined}>{f.label}</Link>)}
        </nav>

        {unlinked.length > 0 && (
          <section className="admin-mail-list" aria-label="Mails uden henvendelse">
            <h2 className="admin-subheading">Mails, der ikke hører til en henvendelse</h2>
            {unlinked.map((m) => (
              <article className="admin-mail-row is-unread" key={m.id}>
                <div><strong>{m.from_email}</strong><small>{m.subject}</small></div>
                <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", dateStyle: "short", timeStyle: "short" })}</time>
              </article>
            ))}
          </section>
        )}

        <section className="admin-mail-list" aria-label="Henvendelser">
          {requests.length ? requests.map((r) => {
            const c = counts.get(String(r.id))
            return (
              <Link href={`/admin/mail/${r.id}`} className={`admin-mail-row${r.status === "new" || r.status === "customer_replied" || c?.unread ? " is-unread" : ""}`} key={r.id}>
                <div>
                  <strong>{r.name}</strong>
                  <small>{r.email}{r.phone ? ` · ${r.phone}` : ""}</small>
                  <p>{(r.message ?? "").slice(0, 160)}</p>
                </div>
                <div className="admin-mail-meta">
                  {r.status && <span className={`admin-badge status-${r.status}`}>{statusLabels[r.status] ?? r.status}</span>}
                  {c?.total ? <small>{c.total} mail{c.total === 1 ? "" : "s"}</small> : null}
                  <time dateTime={r.created_at}>{new Date(r.created_at).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen" })}</time>
                </div>
              </Link>
            )
          }) : <div className="admin-empty-state admin-empty-state-compact"><strong>0</strong><span>henvendelser</span><p>{vis === "aabne" ? "Alt er besvaret." : "Ingen henvendelser endnu."}</p></div>}
        </section>

        <details className="admin-form admin-signature">
          <summary>Min mailsignatur</summary>
          <form action={saveSignature} className="admin-form-grid">
            <label>Navn<input name="full_name" defaultValue={me.name ?? ""} placeholder="Dit navn" /></label>
            <label>Titel hos {org.name}<input name="job_title" defaultValue={me.title ?? ""} placeholder="Indehaver" /></label>
            <label>Direkte telefon<input name="phone" type="tel" defaultValue={me.phone ?? ""} /></label>
            <label>Mail i signaturen<input name="work_email" type="email" defaultValue={me.email ?? ""} placeholder={officeEmailFor(org)} /></label>
            <div className="admin-form-actions"><button type="submit" className="admin-primary">Gem signatur</button></div>
          </form>
          <p className="admin-form-hint">Sådan ser den ud i dine mails. Logo, slogan, bannere og firmaoplysninger styres under <a href="/admin/indstillinger">Indstillinger</a>.</p>
          <div className="admin-signature-preview" dangerouslySetInnerHTML={{ __html: signatureHtml(org, me, settings) }} />
        </details>
      </div>
    </main>
  )
}
