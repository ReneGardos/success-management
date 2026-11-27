import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Copy, ExternalLink, Send } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { docStatus, docUrl } from "@/lib/backend/documents"
import { signedUrls } from "@/lib/backend/reports"
import { appUrl } from "@/lib/org"
import { Markdown } from "@/lib/md"
import { archiveDocument, saveDocument, sendDocument } from "../actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Dokument" }

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gemt?: string; sendt?: string; fejl?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/dokumenter")
  const { id } = await params
  const sp = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const db = createAdminClient()
  const { data: d } = await db.from("org_documents").select("*").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!d) notFound()
  const [fileUrl, sig, who] = await Promise.all([
    docUrl(d.file_path),
    d.signature_path ? signedUrls([d.signature_path]).then((m) => m.get(d.signature_path!) ?? null) : Promise.resolve(null),
    d.customer_id ? db.from("customers").select("name, company, email").eq("id", d.customer_id).maybeSingle().then((r) => r.data ? `${r.data.company || r.data.name}${r.data.email ? ` · ${r.data.email}` : ""}` : "") : d.employee_id ? db.from("profiles").select("full_name").eq("id", d.employee_id).maybeSingle().then((r) => r.data?.full_name ?? "") : Promise.resolve("Alle medarbejdere"),
  ])
  const link = `${appUrl()}/d/${d.public_token}`
  const editable = d.status === "draft" || d.status === "sent"
  return (
    <main className="admin-shell crm">
      <Link href="/admin/dokumenter" className="crm-back"><ArrowLeft className="size-4" /> Dokumenter</Link>
      <header className="crm-head">
        <div><p className="crm-kicker">{who}</p><h1>{d.title}</h1><p className="crm-head-sub">{docStatus[d.status]}{d.sent_at ? ` · sendt ${new Date(d.sent_at).toLocaleDateString("da-DK")}` : ""}{d.viewed_at ? ` · åbnet ${new Date(d.viewed_at).toLocaleDateString("da-DK")}` : ""}</p></div>
        <div className="crm-inline">
          <a href={link} target="_blank" rel="noreferrer" className="crm-btn"><ExternalLink className="size-4" /> Se som modtager</a>
          {editable && <form action={sendDocument}><input type="hidden" name="id" value={d.id} /><button type="submit" className="crm-btn crm-btn-primary"><Send className="size-4" /> {d.status === "sent" ? "Send igen" : d.needs_signature ? "Send til underskrift" : "Del"}</button></form>}
        </div>
      </header>
      {sp.gemt && <p className="admin-notice is-ok">Gemt.</p>}
      {sp.sendt && <p className="admin-notice is-ok">Sendt. Modtageren har fået et link og en notifikation.</p>}
      {sp.fejl && <p className="admin-notice is-error">{sp.fejl}</p>}
      {d.status === "signed" && d.signed_at && (
        <article className="crm-card doc-signed">
          <p><strong>Underskrevet</strong> af {d.signed_name} · {new Date(d.signed_at).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" })}{d.signed_ip ? ` · IP ${d.signed_ip}` : ""}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {sig && <img src={sig} alt="Underskrift" />}
        </article>
      )}
      <div className="crm-pairs">
        {editable && !d.file_path ? (
          <form action={saveDocument} className="crm-card doc-edit">
            <input type="hidden" name="id" value={d.id} />
            <label>Titel<input name="title" defaultValue={d.title} /></label>
            <label>Tekst (## for overskrift, - for punkter, **fed**)<textarea name="body" rows={24} defaultValue={d.body ?? ""} /></label>
            <div className="doc-row"><label className="au-check"><input type="checkbox" name="needs_signature" defaultChecked={d.needs_signature} /> Skal underskrives</label><label>Udløber<input type="date" name="expires_on" defaultValue={d.expires_on ?? ""} /></label></div>
            <button type="submit" className="crm-btn crm-btn-primary">Gem</button>
          </form>
        ) : null}
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Forhåndsvisning</h2></div><span className="crm-muted"><Copy className="size-3 inline" /> {link.replace(/^https?:\/\//, "")}</span></header>
          {d.file_path ? (fileUrl ? <p><a href={fileUrl} target="_blank" rel="noreferrer" className="crm-btn"><ExternalLink className="size-4" /> Åbn {d.file_name ?? "fil"}</a></p> : null) : <div className="doc-preview"><Markdown text={d.body} /></div>}
        </article>
      </div>
      <form action={archiveDocument} className="crm-inline"><input type="hidden" name="id" value={d.id} /><button className="crm-btn" type="submit">Arkivér</button>{d.status === "draft" && <button className="crm-btn" name="delete" value="1" type="submit">Slet kladde</button>}</form>
    </main>
  )
}
