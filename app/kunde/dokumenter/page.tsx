import Link from "next/link"
import { FileSignature, FileText, Receipt } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { customerPortal } from "@/lib/portal"
import { docStatus, docUrl } from "@/lib/backend/documents"

export const dynamic = "force-dynamic"
export const metadata = { title: "Dokumenter" }

export default async function CustomerDocs() {
  const p = await customerPortal("/kunde/dokumenter")
  const { data: docs } = await createAdminClient().from("org_documents").select("id, title, status, needs_signature, file_path, public_token, signed_at, signed_name").eq("org_id", p.org.id).in("customer_id", p.ids).neq("status", "draft").neq("status", "archived").order("created_at", { ascending: false })
  const urls = await Promise.all((docs ?? []).map((d) => docUrl(d.file_path)))
  const toSign = (docs ?? []).filter((d) => d.status === "sent" && d.needs_signature)
  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Dokumenter</h1><p>Aftaler og kontrakter med {p.org.name}.</p></header>
      {toSign.length > 0 && <section className="pt-card pt-warn"><h2><FileSignature className="size-4 inline" /> Venter på jeres underskrift</h2><ul className="pt-mini">{toSign.map((d) => <li key={d.id}><span><strong>{d.title}</strong></span><a href={`/d/${d.public_token}`} className="pt-link">Læs og underskriv</a></li>)}</ul></section>}
      <section className="pt-card">
        <h2>Aftaler</h2>
        <ul className="pt-mini">
          {(docs ?? []).map((d, i) => <li key={d.id}><span><strong><FileText className="size-4 inline" /> {d.title}</strong><small>{docStatus[d.status]}{d.signed_at ? ` · ${d.signed_name}, ${new Date(d.signed_at).toLocaleDateString("da-DK")}` : ""}</small></span><a href={urls[i] ?? `/d/${d.public_token}`} target={urls[i] ? "_blank" : undefined} rel="noreferrer" className="pt-link">Åbn</a></li>)}
          {!docs?.length && <li className="pt-empty">Ingen aftaler her endnu.</li>}
        </ul>
      </section>
      <div className="pt-cta"><Link href="/kunde/tilbud" className="field-btn"><FileText className="size-5" /> Tilbud</Link><Link href="/kunde/fakturaer" className="field-btn"><Receipt className="size-5" /> Fakturaer</Link></div>
    </main>
  )
}
