import { createAdminClient } from "@/lib/supabase/admin"
import { customerPortal } from "@/lib/portal"
import { krRound } from "@/lib/pricing"
import { orderExtra } from "../actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Bestil" }

export default async function CustomerOrder({ searchParams }: { searchParams: Promise<{ sendt?: string; fejl?: string }> }) {
  const p = await customerPortal("/kunde/bestil")
  const sp = await searchParams
  const { data: services } = await createAdminClient().from("services").select("id, name, description, unit, unit_price, category").eq("org_id", p.org.id).eq("published", true).order("category").order("name").limit(60)
  const groups = new Map<string, NonNullable<typeof services>>()
  for (const s of services ?? []) { const k = s.category || "Opgaver"; groups.set(k, [...(groups.get(k) ?? []), s]) }
  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Bestil ekstra opgave</h1><p>Vinduespudsning, hovedrengøring eller noget helt tredje? Vælg, skriv en dato, så vender vi tilbage med pris og tid.</p></header>
      {sp.sendt && <p className="field-ok" role="status">Tak! {p.org.name} har fået jeres bestilling og vender tilbage hurtigst muligt.</p>}
      {sp.fejl && <p className="field-err" role="alert">{sp.fejl}</p>}
      <form action={orderExtra} className="pt-card rv-form">
        <fieldset disabled={Boolean(p.preview)}>
          {[...groups].map(([cat, list]) => (
            <div key={cat} className="pt-section">
              <h2>{cat}</h2>
              <div className="pt-checks">
                {list.map((s) => (
                  <label key={s.id}><input type="checkbox" name="service_id" value={s.id} /><span><strong>{s.name}</strong>{s.description && <small>{s.description}</small>}</span>{Number(s.unit_price) > 0 && <em>fra {krRound(Number(s.unit_price))}/{s.unit}</em>}</label>
                ))}
              </div>
            </div>
          ))}
          <div className="pt-two">
            {p.locations.length > 0 && <label>Sted<select name="location_id" defaultValue={p.locations[0].id}>{p.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
            <label>Ønsket dato<input type="date" name="wish_date" min={new Date().toISOString().slice(0, 10)} /></label>
          </div>
          <label>Besked<textarea name="note" rows={4} placeholder="Fx antal vinduer, adgang, nøgle eller andet vi skal vide" /></label>
          <button type="submit" className="field-btn field-btn-primary">Send bestilling</button>
        </fieldset>
      </form>
    </main>
  )
}
