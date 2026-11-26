import { PackageCheck } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { listStaff } from "@/lib/backend/staff"
import { productStatusLabels } from "@/lib/backend/reports"
import { saveProduct, setRequestStatus, setStock, toggleProduct } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Forsyning" }

const ago = (iso: string) => new Date(iso).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", dateStyle: "short", timeStyle: "short" })

export default async function SupplyPage() {
  const { org } = await requireRolePage(["admin"], "/admin/forsyning")
  const db = createAdminClient()
  const [{ data: requests }, { data: products }, { data: locations }, { data: stock }, { staff }] = await Promise.all([
    db.from("supply_requests").select("id, message, urgent, status, created_at, employee_id, product:products(name), location:locations(name)").eq("org_id", org.id).neq("status", "done").order("urgent", { ascending: false }).order("created_at", { ascending: false }).limit(200),
    db.from("products").select("id, name, unit, active, position").eq("org_id", org.id).order("position").order("name"),
    db.from("locations").select("id, name").eq("org_id", org.id).eq("active", true).order("name"),
    db.from("location_products").select("location_id, product_id, status, updated_at").eq("org_id", org.id),
    listStaff(org.id),
  ])
  const names = new Map(staff.map((s) => [s.id, s.name.split(" ")[0]]))
  const active = (products ?? []).filter((p) => p.active)
  const cell = new Map((stock ?? []).map((s) => [`${s.location_id}|${s.product_id}`, s.status as "ok" | "low" | "missing"]))
  const missing = (stock ?? []).filter((s) => s.status === "missing").length
  const low = (stock ?? []).filter((s) => s.status === "low").length

  return (
    <main className="admin-shell crm">
      <header className="crm-head"><div><p className="crm-kicker">{org.name}</p><h1>Forsyning</h1><p className="crm-head-sub">Medarbejdernes beskeder om mangler og status på produkter ude hos kunderne.</p></div></header>
      <section className="crm-kpis">
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Åbne beskeder</span></div><div className="crm-kpi-row"><strong className={(requests?.length ?? 0) ? "is-warn" : ""}>{requests?.length ?? 0}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Haster</span></div><div className="crm-kpi-row"><strong className={(requests ?? []).some((r) => r.urgent) ? "is-warn" : ""}>{(requests ?? []).filter((r) => r.urgent).length}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Mangler på steder</span></div><div className="crm-kpi-row"><strong>{missing}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Snart tomme</span></div><div className="crm-kpi-row"><strong>{low}</strong></div></div>
      </section>

      <article className="crm-card crm-card-flush">
        <header className="crm-card-head crm-pad"><div><h2>Beskeder fra medarbejdere</h2></div></header>
        {requests?.length ? (
          <table className="crm-table">
            <thead><tr><th>Hvad</th><th>Sted</th><th>Fra</th><th>Hvornår</th><th>Status</th></tr></thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td><strong>{(r.product as unknown as { name: string } | null)?.name ?? r.message}</strong>{r.product && !["Mangler", "Snart tom"].includes(r.message) ? <small className="crm-cell-sub">{r.message}</small> : r.product ? <small className="crm-cell-sub">{r.message}</small> : null}{r.urgent && <span className="crm-pill inv-overdue" style={{ marginLeft: 6 }}>Haster</span>}</td>
                  <td>{(r.location as unknown as { name: string } | null)?.name ?? "–"}</td>
                  <td>{names.get(String(r.employee_id)) ?? "–"}</td>
                  <td className="crm-mono">{ago(r.created_at)}</td>
                  <td>
                    <form action={setRequestStatus} className="crm-inline">
                      <input type="hidden" name="id" value={r.id} />
                      {r.status === "open" && <button className="crm-btn" name="status" value="ordered" type="submit">Bestilt</button>}
                      <button className="crm-btn crm-btn-primary" name="status" value="done" type="submit">Klaret</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="crm-empty"><PackageCheck className="size-4 inline" /> Ingen åbne mangler.</p>}
      </article>

      <article className="crm-card crm-card-flush">
        <header className="crm-card-head crm-pad"><div><h2>Produkter pr. sted</h2><p>Tryk for at ændre status</p></div></header>
        {active.length && (locations?.length ?? 0) ? (
          <div className="crm-matrix-wrap">
            <table className="crm-table crm-matrix">
              <thead><tr><th>Sted</th>{active.map((p) => <th key={p.id}>{p.name}</th>)}</tr></thead>
              <tbody>
                {locations!.map((l) => (
                  <tr key={l.id}>
                    <td><strong>{l.name}</strong></td>
                    {active.map((p) => {
                      const st = cell.get(`${l.id}|${p.id}`) ?? "ok"
                      const next = st === "ok" ? "low" : st === "low" ? "missing" : "ok"
                      return (
                        <td key={p.id}>
                          <form action={setStock}><input type="hidden" name="location_id" value={l.id} /><input type="hidden" name="product_id" value={p.id} /><input type="hidden" name="status" value={next} />
                            <button type="submit" className={`crm-stock is-${st}`} title={`${productStatusLabels[st]} – tryk for ${productStatusLabels[next]}`}>{st === "ok" ? "✓" : st === "low" ? "!" : "×"}</button>
                          </form>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="crm-empty">Opret steder og produkter for at se oversigten.</p>}
        <p className="crm-note crm-pad" style={{ paddingBottom: 14 }}>✓ nok · ! snart tom · × mangler. Medarbejderne opdaterer status i deres rapporter.</p>
      </article>

      <article className="crm-card">
        <header className="crm-card-head"><div><h2>Produktkatalog</h2></div></header>
        <div className="crm-pairs">
          {(products ?? []).map((p) => (
            <form key={p.id} action={saveProduct} className="crm-inline" style={{ opacity: p.active ? 1 : 0.5 }}>
              <input type="hidden" name="id" value={p.id} />
              <input name="name" defaultValue={p.name} aria-label="Navn" />
              <input name="unit" defaultValue={p.unit} aria-label="Enhed" style={{ width: 70 }} />
              <input name="position" type="number" defaultValue={p.position} aria-label="Rækkefølge" style={{ width: 70 }} />
              <button className="crm-btn" type="submit">Gem</button>
              <button className="crm-btn" type="submit" formAction={toggleProduct} name="active" value={String(!p.active)}>{p.active ? "Skjul" : "Vis"}</button>
            </form>
          ))}
          <form action={saveProduct} className="crm-inline">
            <input name="name" placeholder="Nyt produkt" aria-label="Nyt produkt" />
            <input name="unit" placeholder="stk" aria-label="Enhed" style={{ width: 70 }} />
            <button className="crm-btn crm-btn-primary" type="submit">Tilføj</button>
          </form>
        </div>
      </article>
    </main>
  )
}
