import Link from "next/link"
import { Building2, Plus } from "lucide-react"
import { requireSuperadminPage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { createOrganization, registerMailDomain, updateOrganizationPlatform } from "./actions"
import "../admin/admin-theme.css"

export const dynamic = "force-dynamic"
export const metadata = { title: "Superadmin", robots: { index: false, follow: false } }

type OrgRow = { id: string; slug: string; name: string; cvr: string | null; website: string | null; plan: string; subscription_status: string; active: boolean; mail_domain: string | null; mail_from_local: string; mail_domain_verified: boolean; inbound_alias: string | null; created_at: string }

export default async function SuperadminPage({ searchParams }: { searchParams: Promise<{ gemt?: string; fejl?: string }> }) {
  const ctx = await requireSuperadminPage()
  const sp = await searchParams
  const db = createAdminClient()
  const [{ data: orgs }, { data: members }] = await Promise.all([
    db.from("organizations").select("id, slug, name, cvr, website, plan, subscription_status, active, mail_domain, mail_from_local, mail_domain_verified, inbound_alias, created_at").order("name"),
    db.from("memberships").select("org_id, role"),
  ])
  const counts = new Map<string, number>()
  for (const m of members ?? []) counts.set(String(m.org_id), (counts.get(String(m.org_id)) ?? 0) + 1)
  const inbound = process.env.RESEND_INBOUND_DOMAIN

  return (
    <div className="admin-frame">
      <main className="admin-shell" style={{ marginLeft: 0 }}>
        <div className="admin-workspace">
          <p className="admin-eyebrow">Success Management / Superadmin</p>
          <div className="admin-workspace-heading">
            <div><h1>Virksomheder</h1><p>Logget ind som {ctx.user.email}. Hver virksomhed har sine egne data, brugere, branding og mails.</p></div>
            <Link href="/vaelg-virksomhed?skift=1" className="admin-view-site">Mine virksomheder</Link>
          </div>
          {sp.gemt === "verificeret" && <p className="admin-notice is-ok" role="status">Maildomænet er verificeret – mails sendes nu fra eget domæne.</p>}
          {sp.gemt === "afventer-dns" && <p className="admin-notice" role="status">Domænet er oprettet i Resend. Tilføj DNS-posterne fra Resend hos domæneudbyderen, og tryk “Tjek domæne” igen.</p>}
          {sp.gemt === "1" && <p className="admin-notice is-ok" role="status">Gemt.</p>}
          {sp.fejl && <p className="admin-notice is-error" role="alert">{sp.fejl}</p>}

          <div className="admin-mail-list">
            {((orgs ?? []) as OrgRow[]).map((o) => (
              <details key={o.id} className="admin-location">
                <summary>
                  <div><strong><Building2 className="size-4 inline" aria-hidden="true" /> {o.name}{o.active ? "" : " (deaktiveret)"}</strong><small>{o.slug} · {counts.get(o.id) ?? 0} personer · plan {o.plan} · {o.subscription_status}{o.mail_domain ? ` · @${o.mail_domain}${o.mail_domain_verified ? " ✓" : " (ikke verificeret)"}` : ""}</small></div>
                  <a href={`/org/skift?org=${o.id}&next=/admin`} className="admin-view-site">Åbn</a>
                </summary>
                <div className="admin-location-body">
                  <form action={updateOrganizationPlatform} className="admin-form-grid">
                    <input type="hidden" name="id" value={o.id} />
                    <label>Plan<select name="plan" defaultValue={o.plan}>{["internal", "trial", "starter", "pro", "enterprise"].map((p) => <option key={p}>{p}</option>)}</select></label>
                    <label>Abonnement<select name="subscription_status" defaultValue={o.subscription_status}>{["active", "trialing", "past_due", "canceled", "paused"].map((p) => <option key={p}>{p}</option>)}</select></label>
                    <label>Maildomæne (afsender)<input name="mail_domain" defaultValue={o.mail_domain ?? ""} placeholder="firma.dk" /></label>
                    <label>Afsenderadresse før @<input name="mail_from_local" defaultValue={o.mail_from_local} /></label>
                    <label>Alias for svar{inbound ? ` (@${inbound})` : ""}<input name="inbound_alias" defaultValue={o.inbound_alias ?? o.slug} /></label>
                    <label className="admin-check-row"><input type="checkbox" name="active" defaultChecked={o.active} /> Aktiv</label>
                    <div className="admin-form-actions span-2"><button type="submit" className="admin-primary">Gem</button></div>
                  </form>
                  {o.mail_domain && <form action={registerMailDomain} className="admin-inline-form"><input type="hidden" name="id" value={o.id} /><button type="submit">{o.mail_domain_verified ? "Tjek domæne igen" : "Opret / tjek domæne i Resend"}</button></form>}
                </div>
              </details>
            ))}
          </div>

          <details className="admin-form">
            <summary><Plus className="size-4" aria-hidden="true" /> Opret virksomhed</summary>
            <form action={createOrganization} className="admin-form-grid">
              <label>Navn *<input name="name" required /></label>
              <label>Kort navn (bruges i adresser) *<input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,40}" placeholder="fx firma-navn" /></label>
              <label>CVR<input name="cvr" /></label>
              <label>Hjemmeside<input name="website" placeholder="firma.dk" /></label>
              <label>Kontor-email<input name="office_email" type="email" /></label>
              <div className="admin-form-actions span-2"><button type="submit" className="admin-primary">Opret og åbn indstillinger</button></div>
            </form>
          </details>
        </div>
      </main>
    </div>
  )
}
