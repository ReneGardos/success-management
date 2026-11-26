import Link from "next/link"
import { Plus } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { kr } from "@/lib/backend/quotes"
import LeadBoard, { type BoardLead } from "./board"
import { createLead } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Pipeline" }

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ ny?: string; fejl?: string; slettet?: string; q?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/leads")
  const sp = await searchParams
  let query = createAdminClient().from("leads").select("id, name, company, email, phone, value, status, next_action_at, created_at, source").eq("org_id", org.id).order("created_at", { ascending: false }).limit(1000)
  const q = (sp.q ?? "").replace(/[%,()*"\\]/g, "").trim().slice(0, 80)
  if (q) query = query.or(`name.ilike.%${q}%,company.ilike.%${q}%,email.ilike.%${q}%`)
  const { data, error } = await query
  const leads = (data ?? []).map((l) => ({ ...l, value: l.value === null ? null : Number(l.value) })) as BoardLead[]
  const stages = [
    { id: "new", label: "Ny", color: "#94A3B8" },
    { id: "contacted", label: "Kontaktet", color: org.color_muted },
    { id: "qualified", label: "Kvalificeret", color: org.color_accent },
    { id: "quoted", label: "Tilbud sendt", color: "#6366F1" },
    { id: "won", label: "Vundet", color: org.color_primary },
    { id: "lost", label: "Tabt", color: "#E0A39C" },
  ]
  const open = leads.filter((l) => !["won", "lost"].includes(l.status))
  const openValue = open.reduce((s, l) => s + Number(l.value ?? 0), 0)
  const won = leads.filter((l) => l.status === "won").length
  const lost = leads.filter((l) => l.status === "lost").length
  const conv = won + lost ? Math.round((won / (won + lost)) * 100) : 0

  return (
    <main className="admin-shell crm crm-wide">
      <header className="crm-head">
        <div><p className="crm-kicker">{org.name}</p><h1>Salgspipeline</h1><p className="crm-head-sub">{open.length} åbne leads · {kr(openValue).replace(",00 kr.", " kr.")} i pipeline · {conv}% vundet</p></div>
        <div className="crm-head-actions">
          <form action="/admin/leads" className="crm-inline"><input name="q" defaultValue={sp.q ?? ""} placeholder="Filtrér…" aria-label="Filtrér leads" /></form>
          <Link href="?ny=1" className="crm-btn crm-btn-primary"><Plus className="size-4" /> Nyt lead</Link>
        </div>
      </header>
      {sp.fejl && <p className="admin-notice is-error" role="alert">{sp.fejl}</p>}
      {sp.slettet && <p className="admin-notice is-ok" role="status">Leadet er slettet.</p>}
      {error && <p className="admin-notice is-error" role="alert">{error.message}</p>}

      {sp.ny && (
        <form action={createLead} className="admin-form">
          <div className="admin-form-title"><h2>Nyt lead</h2><Link href="/admin/leads" aria-label="Luk">×</Link></div>
          <div className="admin-form-grid">
            <label>Navn *<input name="name" required /></label>
            <label>Firma<input name="company" /></label>
            <label>Email *<input name="email" type="email" required /></label>
            <label>Telefon<input name="phone" type="tel" /></label>
            <label>Forventet værdi pr. md. (kr.)<input name="value" inputMode="decimal" /></label>
            <label>Næste opfølgning<input name="next_action_at" type="date" /></label>
            <label>Kilde<select name="source" defaultValue="manuel"><option value="manuel">Manuel</option><option value="telefon">Telefon</option><option value="anbefaling">Anbefaling</option><option value="messe">Messe/netværk</option><option value="website">Hjemmeside</option></select></label>
            <label className="span-2">Note<textarea name="message" rows={2} /></label>
            <div className="admin-form-actions span-2"><button type="submit" className="admin-primary">Opret lead</button></div>
          </div>
        </form>
      )}

      <LeadBoard leads={leads} stages={stages} accent={org.color_accent} />
      <p className="crm-note">Træk kortene mellem kolonnerne – eller brug vælgeren på kortet på mobilen. Henvendelser fra hjemmesiden lander automatisk i “Ny”.</p>
    </main>
  )
}
