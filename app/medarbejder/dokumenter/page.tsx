import { FileSignature, FileText } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { employeePortal } from "@/lib/portal"
import { docStatus, docUrl } from "@/lib/backend/documents"
import DocUpload from "@/components/doc-upload"
import { myDocTarget, registerMyDoc } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Dokumenter" }

export default async function EmployeeDocs() {
  const p = await employeePortal("/medarbejder/dokumenter")
  const { data: docs } = await createAdminClient().from("org_documents").select("id, title, status, needs_signature, file_path, file_name, expires_on, public_token, signed_at, employee_id, kind").eq("org_id", p.org.id).neq("status", "draft").neq("status", "archived").or(`employee_id.eq.${p.userId},and(kind.eq.policy,employee_id.is.null,customer_id.is.null)`).order("created_at", { ascending: false })
  const urls = await Promise.all((docs ?? []).map((d) => docUrl(d.file_path)))
  const toSign = (docs ?? []).filter((d) => d.status === "sent" && d.needs_signature)
  const today = new Date().toISOString().slice(0, 10)
  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Dokumenter</h1><p>Din kontrakt, politikker og dine egne papirer.</p></header>
      {toSign.length > 0 && <section className="pt-card pt-warn"><h2><FileSignature className="size-4 inline" /> Skal underskrives</h2><ul className="pt-mini">{toSign.map((d) => <li key={d.id}><span><strong>{d.title}</strong></span><a href={`/d/${d.public_token}`} className="pt-link">Læs og underskriv</a></li>)}</ul></section>}
      <section className="pt-card">
        <h2>Alle dokumenter</h2>
        <ul className="pt-mini">
          {(docs ?? []).map((d, i) => (
            <li key={d.id}>
              <span><strong><FileText className="size-4 inline" /> {d.title}</strong><small>{d.employee_id ? docStatus[d.status] : "Fælles politik"}{d.expires_on ? ` · udløber ${new Date(`${d.expires_on}T12:00:00Z`).toLocaleDateString("da-DK")}` : ""}{d.expires_on && d.expires_on < today ? " (udløbet)" : ""}</small></span>
              {urls[i] ? <a href={urls[i]!} target="_blank" rel="noreferrer" className="pt-link">Åbn</a> : <a href={`/d/${d.public_token}`} className="pt-link">Læs</a>}
            </li>
          ))}
          {!docs?.length && <li className="pt-empty">Ingen dokumenter endnu.</li>}
        </ul>
      </section>
      {!p.preview && (
        <section className="pt-card">
          <h2>Upload dit eget</h2>
          <p className="pt-muted">Fx kørekort, førstehjælpsbevis eller straffeattest. Kun kontoret kan se det.</p>
          <DocUpload requestTarget={myDocTarget} register={registerMyDoc} label="Vælg fil" fields={<div className="pt-two"><label>Titel<input name="title" placeholder="Fx Kørekort" /></label><label>Udløber (valgfrit)<input type="date" name="expires_on" /></label></div>} />
        </section>
      )}
    </main>
  )
}
