import Link from "next/link"
import { ArrowUpRight, BarChart3, BriefcaseBusiness, CalendarDays, CircleCheck, CircleAlert, Clock, FileText, LayoutDashboard, Mail, MapPin, MessageSquare, Phone, Users } from "lucide-react"
import { loadShifts, shiftName } from "@/lib/backend/shifts"
import { listStaff } from "@/lib/backend/staff"
import { addDays, formatTime, todayLocal } from "@/lib/time"
import { inboundConfigured } from "@/lib/backend/mail"
import { copenhagenToIso } from "@/lib/time"
import { requireRolePage } from "@/lib/auth-guard"
import { officeEmailFor } from "@/lib/backend/mail"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

const sections = [
  { label: "Vagtplan", description: "Ugekalender: opret vagter, tildel medarbejdere, slå ledige vagter op", href: "/admin/vagtplan", icon: CalendarDays },
  { label: "Tilbud", description: "Lav professionelle tilbud, send dem og se når kunden accepterer", href: "/admin/tilbud", icon: FileText },
  { label: "Mail", description: "Indbakke: læs henvendelser, svar kunder og send mails", href: "/admin/mail", icon: Mail },
  { label: "Timer", description: "Tjek ind/ud, timer pr. medarbejder og eksport til løn", href: "/admin/timer", icon: Clock },
  { label: "Steder", description: "Kunder og adresser med nøglekoder og GPS-position", href: "/admin/steder", icon: MapPin },
  { label: "Medarbejdere", description: "Invitér medarbejdere og styr roller", href: "/admin/brugere", icon: Users },
  { label: "Statistik", description: "Besøgende, populære sider og hvor de kommer fra", href: "/admin/statistik", icon: BarChart3 },
  { label: "Leads", description: "Følg potentielle kunder fra kontakt til aftale", href: "/admin/leads", icon: FileText },
]

type Db = ReturnType<typeof createAdminClient>

async function countRows(db: Db, orgId: string, table: string) {
  const result = await db.from(table).select("*", { count: "exact", head: true }).eq("org_id", orgId)
  return { table, count: result.count ?? 0, error: result.error?.message ?? null }
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("da-DK", { hour: "numeric", hour12: false, timeZone: "Europe/Copenhagen" }).format(new Date()))
  if (hour < 10) return "Godmorgen"
  if (hour < 18) return "Goddag"
  return "Godaften"
}

export default async function AdminDashboard() {
  const { org, fullName } = await requireRolePage(["admin"], "/admin")
  const orgId = org.id

  const db = createAdminClient()
  const [requests, leads, quotes, jobs, profiles, mails, views] = await Promise.all(
    ["contact_requests", "leads", "quotes", "jobs", "memberships", "email_messages", "page_views"].map((table) => countRows(db, orgId, table)),
  )
  const todayStart = copenhagenToIso(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }), "00:00") ?? new Date().toISOString()
  const { count: viewsToday } = await db.from("page_views").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", todayStart)
  const { count: unreadMails } = await db.from("email_messages").select("*", { count: "exact", head: true }).eq("org_id", orgId).eq("direction", "inbound").is("read_at", null)
  const { data: recentRequests } = await db
    .from("contact_requests")
    .select("id, name, email, phone, message, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5)

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count: newThisWeek } = await db.from("contact_requests").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", weekAgo)

  const today = todayLocal()
  const [{ shifts: todayShifts }, { staff }] = await Promise.all([loadShifts(orgId, copenhagenToIso(today, "00:00")!, copenhagenToIso(addDays(today, 1), "00:00")!), listStaff(orgId)])
  const staffNames = new Map(staff.map((p) => [p.id, p.name.split(" ")[0]]))
  const { data: openEntries } = await db.from("time_entries").select("job_id, employee_id, check_in_at").eq("org_id", orgId).is("check_out_at", null)
  const inNow = new Set((openEntries ?? []).map((e) => `${e.job_id}|${e.employee_id}`))
  const { count: openQuotes } = await db.from("quotes").select("*", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "sent")

  const metrics = [
    { label: "Nye henvendelser (7 dage)", value: newThisWeek ?? 0, icon: MessageSquare },
    { label: "Ulæste svar fra kunder", value: unreadMails ?? 0, icon: Mail },
    { label: "Sidevisninger i dag", value: viewsToday ?? 0, icon: BarChart3 },
    { label: "Vagter i dag", value: todayShifts.length, icon: CalendarDays },
    { label: "Tjekket ind nu", value: openEntries?.length ?? 0, icon: Clock },
    { label: "Tilbud afventer svar", value: openQuotes ?? 0, icon: FileText },
  ]

  const emailReady = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_EMAIL_DOMAIN)
  const checks = [
    { label: "Kontaktformularen gemmer i databasen", ok: !requests.error, detail: requests.error ? `Tabellen contact_requests: ${requests.error}` : "Tabellen contact_requests svarer" },
    { label: "Leads gemmes", ok: !leads.error, detail: leads.error ? `Tabellen leads: ${leads.error}` : "Tabellen leads svarer" },
    { label: "Email-besked ved ny henvendelse", ok: emailReady, detail: emailReady ? `Resend er sat op – mails sendes til ${officeEmailFor(org)}` : "RESEND_API_KEY eller RESEND_EMAIL_DOMAIN mangler i Vercel" },
    { label: "Opgaver og medarbejdere", ok: !jobs.error, detail: jobs.error ? `Tabellen jobs: ${jobs.error}` : `${jobs.count} opgaver · ${profiles.count} personer` },
    { label: "Mailhistorik", ok: !mails.error, detail: mails.error ? "Kør database-opdateringen (tabellen email_messages mangler)" : `${mails.count} mails gemt` },
    { label: "Kunders svar lander i admin", ok: inboundConfigured(), detail: inboundConfigured() ? "Resend-modtagelse er sat op" : `Sæt RESEND_INBOUND_DOMAIN og RESEND_WEBHOOK_SECRET i Vercel. Indtil da går svar til ${officeEmailFor(org)}` },
    { label: "Afsenderdomæne verificeret", ok: org.mail_domain_verified, detail: org.mail_domain_verified ? `Mails sendes fra @${org.mail_domain}` : `Mails sendes fra @${process.env.RESEND_EMAIL_DOMAIN ?? "?"}, indtil eget domæne er verificeret i Resend` },
    { label: "Besøgsstatistik", ok: !views.error, detail: views.error ? "Kør database-opdateringen (tabellen page_views mangler)" : `${views.count} sidevisninger målt i alt` },
  ]

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="admin-eyebrow">{org.name} / Administration</p>
          <h1>{greeting()}{fullName ? `, ${fullName.split(" ")[0]}` : ""}</h1>
          <p>Her får du et samlet overblik over henvendelser, leads, tilbud og opgaver.</p>
        </div>
      </header>

      <section className="admin-metrics" aria-label="Nøgletal">
        {metrics.map(({ label, value, icon: Icon }) => (
          <article className="admin-metric" key={label}><Icon className="size-5" /><strong>{value}</strong><span>{label}</span></article>
        ))}
      </section>

      <section className="admin-inbox">
        <div className="admin-section-heading">
          <div><p className="admin-eyebrow">I dag</p><h2>Dagens vagter</h2></div>
          <Link href="/admin/vagtplan" className="admin-view-site">Åbn vagtplan</Link>
        </div>
        {todayShifts.length ? (
          <div className="admin-request-list">
            {todayShifts.map((s) => (
              <Link href={`/admin/vagtplan?vagt=${s.id}`} className="admin-request" key={s.id}>
                <div><strong>{s.scheduled_start ? formatTime(s.scheduled_start) : ""}{s.scheduled_end ? `–${formatTime(s.scheduled_end)}` : ""}</strong><small>{shiftName(s)}</small></div>
                <p>{s.employeeIds.length ? s.employeeIds.map((id) => `${staffNames.get(id) ?? "?"}${inNow.has(`${s.id}|${id}`) ? " ✓ inde" : ""}`).join(", ") : s.is_open ? "Ledig – ikke taget endnu" : "Ingen tildelt"}</p>
                <span className={`admin-badge status-${s.status}`}>{s.status === "completed" ? "Udført" : s.status === "in_progress" ? "I gang" : s.status === "cancelled" ? "Aflyst" : "Planlagt"}</span>
              </Link>
            ))}
          </div>
        ) : <div className="admin-empty-state admin-empty-state-compact"><strong>0</strong><span>vagter i dag</span><p><Link href="/admin/vagtplan?ny=1">Opret en vagt</Link></p></div>}
      </section>

      <section className="admin-inbox">
        <div className="admin-section-heading">
          <div><p className="admin-eyebrow">Seneste henvendelser</p><h2>Kontaktindbakke</h2></div>
          <Link href="/admin/mail" className="admin-view-site">Åbn indbakke</Link>
        </div>
        {recentRequests?.length ? (
          <div className="admin-request-list">
            {recentRequests.map((request) => (
              <article className="admin-request" key={request.id}>
                <div><Link href={`/admin/mail/${request.id}`}><strong>{request.name}</strong></Link><small>{request.email}</small></div>
                <p>{request.message || "Ingen besked"}</p>
                <div className="admin-request-actions">
                  <time dateTime={request.created_at}>{new Date(request.created_at).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen" })}</time>
                  <a href={`mailto:${request.email}?subject=${encodeURIComponent(`Vedr. din henvendelse til ${org.name}`)}`} aria-label={`Send email til ${request.name}`}><Mail className="size-4" /></a>
                  {request.phone && <a href={`tel:${String(request.phone).replace(/\s+/g, "")}`} aria-label={`Ring til ${request.name}`}><Phone className="size-4" /></a>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty-state admin-empty-state-compact"><strong>0</strong><span>henvendelser</span><p>Nye kontaktformularer og tilbudsforespørgsler vises her.</p></div>
        )}
      </section>

      <section className="admin-section admin-section-spaced">
        <div className="admin-section-heading">
          <div><p className="admin-eyebrow">Arbejdsoverblik</p><h2>Hvad vil du arbejde med?</h2></div>
          <LayoutDashboard className="admin-heading-icon" />
        </div>
        <div className="admin-actions">
          {sections.map(({ label, description, href, icon: Icon }) => (
            <Link href={href} className="admin-action" key={label}>
              <span className="admin-action-icon"><Icon className="size-5" /></span>
              <span><strong>{label}</strong><small>{description}</small></span>
              <ArrowUpRight className="admin-action-arrow size-4" />
            </Link>
          ))}
        </div>
      </section>

      <section className="admin-section admin-section-spaced" aria-labelledby="system-status">
        <div className="admin-section-heading"><div><p className="admin-eyebrow">Systemstatus</p><h2 id="system-status">Virker det hele?</h2></div></div>
        <div className="admin-status-list">
          {checks.map((check) => (
            <article className={`admin-status ${check.ok ? "is-ok" : "is-error"}`} key={check.label}>
              {check.ok ? <CircleCheck className="size-5" aria-hidden="true" /> : <CircleAlert className="size-5" aria-hidden="true" />}
              <div><strong>{check.label}</strong><small>{check.detail}</small></div>
              <span className="sr-only">{check.ok ? "OK" : "Fejl"}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
