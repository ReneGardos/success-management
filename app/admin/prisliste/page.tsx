import { Plus } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { kr } from "@/lib/backend/quotes"
import { deleteService, saveService, toggleService } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Prisliste" }

const units = ["m²", "stk", "time", "etage", "fag", "besøg", "rum", "lbm"]
type Service = { id: string; name: string; category: string | null; unit: string; unit_price: number; recurring: boolean; qty_from_area: boolean; description: string | null; position: number; published: boolean }

function Fields({ s }: { s?: Service }) {
  return (
    <div className="admin-form-grid">
      {s && <input type="hidden" name="id" value={s.id} />}
      <label>Navn *<input name="name" required defaultValue={s?.name} placeholder="Fx Kontorrengøring" /></label>
      <label>Gruppe<input name="category" defaultValue={s?.category ?? ""} placeholder="Fx Fast rengøring" /></label>
      <label>Type<select name="recurring" defaultValue={s ? String(s.recurring) : "true"}><option value="true">Fast – pr. besøg</option><option value="false">Engangsopgave</option></select></label>
      <label>Enhed<select name="unit" defaultValue={s?.unit ?? "stk"}>{units.map((u) => <option key={u}>{u}</option>)}</select></label>
      <label>Pris pr. enhed (kr. ekskl. moms)<input name="unit_price" inputMode="decimal" required defaultValue={s ? String(s.unit_price).replace(".", ",") : ""} /></label>
      <label>Rækkefølge<input name="position" type="number" defaultValue={s?.position ?? 100} /></label>
      <label className="admin-check-row span-2"><input type="checkbox" name="qty_from_area" defaultChecked={s?.qty_from_area} /> Antal = kundens areal (m²) automatisk</label>
      <label className="span-2">Beskrivelse (vises i tilbuddet)<input name="description" defaultValue={s?.description ?? ""} /></label>
      <div className="admin-form-actions span-2"><button type="submit" className="admin-primary">Gem ydelse</button></div>
    </div>
  )
}

export default async function PriceListPage({ searchParams }: { searchParams: Promise<{ gemt?: string; fejl?: string; slettet?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/prisliste")
  const sp = await searchParams
  const { data } = await createAdminClient().from("services").select("id, name, category, unit, unit_price, recurring, qty_from_area, description, position, published").eq("org_id", org.id).order("position").order("name")
  const services = (data ?? []).map((s) => ({ ...s, unit_price: Number(s.unit_price) })) as Service[]
  const groups = [...new Set(services.map((s) => s.category || "Andet"))]

  return (
    <main className="admin-shell crm">
      <header className="crm-head"><div><p className="crm-kicker">{org.name}</p><h1>Prisliste</h1><p className="crm-head-sub">Ydelserne bruges i “Tilbud på stedet”, hvor prisen regnes ud automatisk. Faste ydelser prissættes pr. besøg og ganges med antal besøg om måneden.</p></div></header>
      {sp.gemt && <p className="admin-notice is-ok" role="status">Gemt.</p>}
      {sp.slettet && <p className="admin-notice is-ok" role="status">Ydelsen er slettet.</p>}
      {sp.fejl && <p className="admin-notice is-error" role="alert">{sp.fejl}</p>}
      {services.length > 0 && <p className="admin-notice">Tjek priserne. Listen er sat op med eksempelpriser, som skal tilpasses jeres egne.</p>}

      <details className="admin-form" open={!services.length}>
        <summary><Plus className="size-4" aria-hidden="true" /> Tilføj ydelse</summary>
        <form action={saveService}><Fields /></form>
      </details>

      <div className="crm-pairs">
        {groups.map((g) => (
          <article key={g} className="crm-card crm-card-flush">
            <header className="crm-card-head crm-pad"><div><h2>{g}</h2></div></header>
            <table className="crm-table">
              <thead><tr><th>Ydelse</th><th>Enhed</th><th className="num">Pris</th><th></th></tr></thead>
              <tbody>
                {services.filter((s) => (s.category || "Andet") === g).map((s) => (
                  <tr key={s.id} style={s.published ? undefined : { opacity: 0.5 }}>
                    <td>
                      <details>
                        <summary style={{ cursor: "pointer", fontWeight: 600 }}>{s.name}</summary>
                        <form action={saveService} style={{ marginTop: 10 }}><Fields s={s} /></form>
                        <div className="crm-inline" style={{ marginTop: 8 }}>
                          <form action={toggleService}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="published" value={String(!s.published)} /><button className="crm-btn" type="submit">{s.published ? "Skjul" : "Vis"}</button></form>
                          <form action={deleteService}><input type="hidden" name="id" value={s.id} /><button className="crm-btn" type="submit">Slet</button></form>
                        </div>
                      </details>
                      <small className="crm-cell-sub">{s.recurring ? "Fast pr. besøg" : "Engang"}{s.qty_from_area ? " · antal = m²" : ""}</small>
                    </td>
                    <td>{s.unit}</td>
                    <td className="num crm-mono">{kr(s.unit_price)}</td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))}
      </div>
    </main>
  )
}
