import { Globe, Plus } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { appUrl } from "@/lib/org"
import { addSite, deleteSite, revokeApiKey } from "./actions"
import KeyCreator from "./key-creator"

export const dynamic = "force-dynamic"

type SiteRow = { id: string; name: string; domain: string; public_id: string; platform: string; created_at: string }
type KeyRow = { id: string; name: string; key_prefix: string; site_id: string | null; last_used_at: string | null; revoked_at: string | null; created_at: string }

const platformLabel: Record<string, string> = { custom: "Egen kode", nextjs: "Next.js", wix: "Wix", wordpress: "WordPress", other: "Andet" }
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", dateStyle: "short", timeStyle: "short" }) : "aldrig")

export default async function SitesPage({ searchParams }: { searchParams: Promise<{ gemt?: string; fejl?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/hjemmesider")
  const sp = await searchParams
  const db = createAdminClient()
  const [{ data: sites }, { data: keys }] = await Promise.all([
    db.from("sites").select("id, name, domain, public_id, platform, created_at").eq("org_id", org.id).order("name"),
    db.from("org_api_keys").select("id, name, key_prefix, site_id, last_used_at, revoked_at, created_at").eq("org_id", org.id).order("created_at", { ascending: false }),
  ])
  const siteRows = (sites ?? []) as SiteRow[]
  const keyRows = (keys ?? []) as KeyRow[]
  const base = appUrl()

  return (
    <main className="admin-shell">
      <div className="admin-workspace">
        <p className="admin-eyebrow">{org.name} / Hjemmesider og API</p>
        <div className="admin-workspace-heading"><div><h1>Hjemmesider og API</h1><p>Hjemmesider sender kontaktformularer, tilbudsønsker og besøgsstatistik ind i {org.name}s indbakke. Data kommer aldrig ind hos andre virksomheder.</p></div></div>
        {sp.gemt && <p className="admin-notice is-ok" role="status">Hjemmesiden er tilføjet.</p>}
        {sp.fejl && <p className="admin-notice is-error" role="alert">{sp.fejl}</p>}

        <section className="admin-mail-list" aria-label="Hjemmesider">
          {siteRows.map((s) => (
            <details key={s.id} className="admin-location">
              <summary>
                <div><strong><Globe className="size-4 inline" aria-hidden="true" /> {s.name}</strong><small>{s.domain} · {platformLabel[s.platform] ?? s.platform} · Site-ID {s.public_id}</small></div>
              </summary>
              <div className="admin-location-body">
                <p className="admin-form-hint"><strong>Besøgsstatistik</strong> – indsæt i sidens &lt;head&gt; (i Wix: Indstillinger → Brugerdefineret kode):</p>
                <pre className="adm-code">{`<script defer src="${base}/sm-track.js" data-site="${s.public_id}"></script>`}</pre>
                <p className="admin-form-hint"><strong>Kontaktformular fra serveren</strong> (anbefalet – Next.js-route eller Wix Velo backend):</p>
                <pre className="adm-code">{`POST ${base}/api/v1/contact
Authorization: Bearer <API-nøgle>
Content-Type: application/json

{ "name": "…", "email": "…", "phone": "…", "company": "…",
  "service": "…", "message": "…", "source": "kontaktformular", "page": "/kontakt" }`}</pre>
                <p className="admin-form-hint"><strong>Fra browseren</strong> uden nøgle: send <code>{`"site": "${s.public_id}"`}</code> i stedet for Authorization. Det virker kun fra {s.domain}.</p>
                <form action={deleteSite} className="admin-job-delete"><input type="hidden" name="id" value={s.id} /><button type="submit">Fjern hjemmeside</button></form>
              </div>
            </details>
          ))}
          {!siteRows.length && <div className="admin-empty-state admin-empty-state-compact"><strong>0</strong><span>hjemmesider</span><p>Tilføj jeres hjemmeside herunder.</p></div>}
        </section>

        <details className="admin-form" open={!siteRows.length}>
          <summary><Plus className="size-4" aria-hidden="true" /> Tilføj hjemmeside</summary>
          <form action={addSite} className="admin-form-grid">
            <label>Domæne *<input name="domain" required placeholder="firma.dk" /></label>
            <label>Navn<input name="name" placeholder="Fx Hovedsiden" /></label>
            <label>Platform<select name="platform" defaultValue="custom">{Object.entries(platformLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <div className="admin-form-actions span-2"><button type="submit" className="admin-primary">Tilføj</button></div>
          </form>
        </details>

        <section className="admin-form">
          <h2>API-nøgler</h2>
          <KeyCreator sites={siteRows.map((s) => ({ id: s.id, name: s.name }))} />
          <div className="admin-mail-list">
            {keyRows.map((k) => (
              <article key={k.id} className="admin-mail-row">
                <div><strong>{k.name}{k.revoked_at ? " (spærret)" : ""}</strong><small><code>{k.key_prefix}…</code> · {siteRows.find((s) => s.id === k.site_id)?.name ?? "alle"} · sidst brugt {fmt(k.last_used_at)}</small></div>
                {!k.revoked_at && <form action={revokeApiKey} className="admin-inline-form"><input type="hidden" name="id" value={k.id} /><button type="submit">Spær</button></form>}
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
