import Link from "next/link"
import { AlertTriangle, FilePlus2, FileSignature, GraduationCap } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { listStaff } from "@/lib/backend/staff"
import { docStatus } from "@/lib/backend/documents"
import { addDays, todayLocal } from "@/lib/time"
import DocUpload from "@/components/doc-upload"
import { adminDocTarget, createContract, registerAdminDoc } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Dokumenter" }

const pill = (s: string) => (s === "signed" ? "inv-paid" : s === "sent" ? "quote-sent" : s === "declined" ? "abs-declined" : "inv-draft")

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ fejl?: string; vis?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/dokumenter")
  const sp = await searchParams
  const db = createAdminClient()
  const today = todayLocal()
  const [{ data: docs }, { data: customers }, { data: quotes }, { staff }] = await Promise.all([
    db.from("org_documents").select("id, kind, title, status, customer_id, employee_id, expires_on, signed_at, signed_name, created_at, file_name, uploaded_by_employee, needs_signature").eq("org_id", org.id).neq("status", "archived").order("created_at", { ascending: false }).limit(500),
    db.from("customers").select("id, name, company").eq("org_id", org.id).order("name").limit(1000),
    db.from("quotes").select("id, quote_number, title, customer_id").eq("org_id", org.id).eq("status", "accepted").order("accepted_at", { ascending: false }).limit(200),
    listStaff(org.id),
  ])
  const cName = new Map((customers ?? []).map((c) => [c.id, c.company || c.name]))
  const eName = new Map(staff.map((s) => [s.id, s.name]))
  const contracts = (docs ?? []).filter((d) => d.customer_id)
  const employeeDocs = (docs ?? []).filter((d) => d.employee_id)
  const other = (docs ?? []).filter((d) => !d.customer_id && !d.employee_id)
  const expiring = (docs ?? []).filter((d) => d.expires_on && d.expires_on <= addDays(today, 30))
  const waiting = (docs ?? []).filter((d) => d.status === "sent")
  const table = (list: typeof contracts, who: (d: (typeof contracts)[number]) => string) => list.length ? (
    <table className="crm-table"><thead><tr><th>Dokument</th><th>Hvem</th><th>Status</th><th>Udløber</th></tr></thead><tbody>
      {list.map((d) => <tr key={d.id}><td><Link href={`/admin/dokumenter/${d.id}`}>{d.title}</Link>{d.file_name && <div className="crm-muted">{d.file_name}{d.uploaded_by_employee ? " · uploadet af medarbejder" : ""}</div>}</td><td>{who(d)}</td><td><span className={`crm-pill ${pill(d.status)}`}>{d.needs_signature || d.status !== "signed" ? docStatus[d.status] : "Delt"}</span>{d.signed_at && <div className="crm-muted">{d.signed_name} · {new Date(d.signed_at).toLocaleDateString("da-DK")}</div>}</td><td>{d.expires_on ? <span className={d.expires_on < today ? "is-warn" : d.expires_on <= addDays(today, 30) ? "is-warn" : ""}>{new Date(`${d.expires_on}T12:00:00Z`).toLocaleDateString("da-DK")}</span> : "–"}</td></tr>)}
    </tbody></table>
  ) : <p className="crm-empty">Ingen endnu.</p>
  return (
    <main className="admin-shell crm">
      <header className="crm-head"><div><p className="crm-kicker">{org.name}</p><h1>Dokumenter</h1><p className="crm-head-sub">Kontrakter med digital underskrift, medarbejderdokumenter med udløbsdato og fælles politikker.</p></div><Link href="/admin/kurser" className="crm-btn"><GraduationCap className="size-4" /> Kurser</Link></header>
      {sp.fejl && <p className="admin-notice is-error">{sp.fejl}</p>}
      <section className="crm-kpis">
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Kontrakter</span></div><div className="crm-kpi-row"><strong>{contracts.length}</strong></div><div className="crm-kpi-foot"><small>{contracts.filter((d) => d.status === "signed").length} underskrevet</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Afventer underskrift</span></div><div className="crm-kpi-row"><strong className={waiting.length ? "is-warn" : ""}>{waiting.length}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Medarbejderdokumenter</span></div><div className="crm-kpi-row"><strong>{employeeDocs.length}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Udløber inden 30 dage</span></div><div className="crm-kpi-row"><strong className={expiring.length ? "is-warn" : ""}>{expiring.length}</strong></div></div>
      </section>
      {expiring.length > 0 && <p className="admin-notice is-error"><AlertTriangle className="size-4 inline" /> Udløber snart: {expiring.slice(0, 5).map((d) => `${d.title} (${d.employee_id ? eName.get(d.employee_id) : cName.get(d.customer_id ?? "") ?? ""})`).join(", ")}</p>}
      <div className="crm-pairs">
        <form action={createContract} className="crm-card doc-new">
          <header className="crm-card-head"><div><h2><FileSignature className="size-4 inline" /> Ny serviceaftale</h2><p>Udfyldes automatisk fra kunden og et accepteret tilbud. Du kan rette teksten, før den sendes.</p></div></header>
          <label>Kunde<select name="customer_id" required defaultValue="" className="crm-select"><option value="" disabled>Vælg kunde…</option>{(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}</select></label>
          <label>Tilbud (valgfrit)<select name="quote_id" defaultValue="" className="crm-select"><option value="">Intet tilbud</option>{(quotes ?? []).map((q) => <option key={q.id} value={q.id}>#{q.quote_number} · {q.title}{q.customer_id ? ` · ${cName.get(q.customer_id) ?? ""}` : ""}</option>)}</select></label>
          <button className="crm-btn crm-btn-primary" type="submit"><FilePlus2 className="size-4" /> Opret aftale</button>
        </form>
        <article className="crm-card doc-new">
          <header className="crm-card-head"><div><h2>Upload dokument</h2><p>Ansættelseskontrakt, kørekort, straffeattest, certifikat, kundekontrakt (PDF, billede eller Word).</p></div></header>
          <DocUpload requestTarget={adminDocTarget} register={registerAdminDoc} label="Vælg fil og upload" fields={<>
            <label>Titel<input name="title" placeholder="Fx Ansættelseskontrakt" /></label>
            <label>Til<select name="who" defaultValue="" className="crm-select"><option value="">Alle (politik)</option><optgroup label="Medarbejdere">{staff.map((s) => <option key={s.id} value={`e:${s.id}`}>{s.name}</option>)}</optgroup><optgroup label="Kunder">{(customers ?? []).map((c) => <option key={c.id} value={`c:${c.id}`}>{c.company || c.name}</option>)}</optgroup></select></label>
            <div className="doc-row"><label>Udløber<input type="date" name="expires_on" /></label><label className="au-check"><input type="checkbox" name="needs_signature" /> Skal underskrives</label></div>
          </>} />
        </article>
      </div>
      <article className="crm-card crm-card-flush"><header className="crm-card-head crm-pad"><div><h2>Kundekontrakter</h2></div></header>{table(contracts, (d) => cName.get(d.customer_id!) ?? "–")}</article>
      <article className="crm-card crm-card-flush"><header className="crm-card-head crm-pad"><div><h2>Medarbejderdokumenter</h2></div></header>{table(employeeDocs, (d) => eName.get(d.employee_id!) ?? "–")}</article>
      {other.length > 0 && <article className="crm-card crm-card-flush"><header className="crm-card-head crm-pad"><div><h2>Politikker og fælles dokumenter</h2></div></header>{table(other, () => "Alle medarbejdere")}</article>}
    </main>
  )
}
