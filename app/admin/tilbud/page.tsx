import Link from "next/link"
import { ClipboardCheck, FilePlus2, ListChecks } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { kr, statusLabels } from "@/lib/backend/quotes"
import { createQuote } from "./actions"

export const dynamic = "force-dynamic"

type Row = { id: string; source?: string; quote_number: number | null; title: string | null; recipient_company: string | null; recipient_name: string | null; total: number | null; billing: string; status: string; created_at: string; sent_at: string | null; viewed_at: string | null; accepted_at: string | null; valid_until: string | null }

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ vis?: string; fejl?: string; slettet?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/tilbud")
  const { vis = "alle", fejl, slettet } = await searchParams
  let query = createAdminClient().from("quotes").select("id, source, quote_number, title, recipient_company, recipient_name, total, billing, status, created_at, sent_at, viewed_at, accepted_at, valid_until").eq("org_id", org.id).order("created_at", { ascending: false }).limit(300)
  if (vis !== "alle") query = query.eq("status", vis)
  const { data, error } = await query
  const rows = (data ?? []) as Row[]
  const accepted = rows.filter((r) => r.status === "accepted" && r.billing !== "one_time").reduce((s, r) => s + Number(r.total ?? 0), 0)
  const pending = rows.filter((r) => r.status === "sent").length

  return (
    <main className="admin-shell">
      <div className="admin-workspace">
        <p className="admin-eyebrow">{org.name} / Tilbud</p>
        <div className="admin-workspace-heading">
          <div><h1>Tilbud</h1><p>{pending} afventer svar{accepted ? ` · ${kr(accepted)} pr. måned i accepterede aftaler` : ""}</p></div>
          <div className="crm-head-actions">
            <Link href="/admin/prisliste" className="crm-btn"><ListChecks className="size-4" /> Prisliste</Link>
            <form action={createQuote}><button type="submit" className="crm-btn"><FilePlus2 className="size-4" /> Detaljeret tilbud</button></form>
            <Link href="/admin/tilbud/paa-stedet" className="crm-btn crm-btn-primary"><ClipboardCheck className="size-4" /> Tilbud på stedet</Link>
          </div>
        </div>
        {fejl && <p className="admin-notice is-error" role="alert">{fejl}</p>}
        {slettet && <p className="admin-notice is-ok" role="status">Tilbuddet er slettet.</p>}
        {error && <p className="admin-notice is-error" role="alert">{error.message}</p>}

        <nav className="admin-tabs" aria-label="Filter">
          {[["alle", "Alle"], ["draft", "Kladder"], ["sent", "Sendt"], ["accepted", "Accepteret"], ["declined", "Afvist"]].map(([v, l]) => <Link key={v} href={`?vis=${v}`} aria-current={vis === v ? "page" : undefined}>{l}</Link>)}
        </nav>

        <div className="admin-mail-list">
          {rows.map((r) => (
            <Link key={r.id} href={`/admin/tilbud/${r.id}`} className="admin-mail-row">
              <div>
                <strong>#{r.quote_number} · {r.recipient_company || r.recipient_name || "Uden kunde"}</strong>
                <small>{r.title}{r.source === "onsite" ? " · lavet på stedet" : ""}</small>
                <small>{r.accepted_at ? `Accepteret ${new Date(r.accepted_at).toLocaleDateString("da-DK")}` : r.viewed_at ? `Set af kunden ${new Date(r.viewed_at).toLocaleDateString("da-DK")}` : r.sent_at ? `Sendt ${new Date(r.sent_at).toLocaleDateString("da-DK")}` : `Oprettet ${new Date(r.created_at).toLocaleDateString("da-DK")}`}</small>
              </div>
              <div className="admin-mail-meta">
                <span className={`admin-badge quote-${r.status}`}>{statusLabels[r.status] ?? r.status}</span>
                <strong>{kr(Number(r.total ?? 0))}</strong>
                <small>{r.billing === "one_time" ? "engang" : "pr. md."} ekskl. moms</small>
              </div>
            </Link>
          ))}
          {!rows.length && !error && <div className="admin-empty-state admin-empty-state-compact"><strong>0</strong><span>tilbud</span><p>Opret jeres første tilbud – eller lav et direkte fra en henvendelse i Mail.</p></div>}
        </div>
      </div>
    </main>
  )
}
