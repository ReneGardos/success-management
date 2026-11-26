import { MapPin, Plus } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { loadLocations } from "@/lib/backend/shifts"
import { mapsLink } from "@/lib/geo"
import UseMyPosition from "@/components/use-my-position"
import { saveLocation, toggleLocation } from "./actions"

export const dynamic = "force-dynamic"

function LocationFields({ location }: { location?: Awaited<ReturnType<typeof loadLocations>>["locations"][number] }) {
  return (
    <div className="admin-form-grid">
      {location && <input type="hidden" name="id" value={location.id} />}
      <label>Navn *<input name="name" required defaultValue={location?.name} placeholder="Fx Nordic Tech – kontor" /></label>
      <label>Adresse *<input name="address" required defaultValue={location?.address} placeholder="Vejnavn 1, 8600 Silkeborg" /></label>
      <label>Kontaktperson<input name="contact_name" defaultValue={location?.contact_name ?? ""} /></label>
      <label>Kontakttelefon<input name="contact_phone" type="tel" defaultValue={location?.contact_phone ?? ""} /></label>
      <label className="span-2">Adgang og instruktioner (vises for medarbejderen)<textarea name="access_notes" rows={3} defaultValue={location?.access_notes ?? ""} placeholder="Nøglekode, alarm, hvor rengøringsrummet er…" /></label>
      <label>Tjek-ind radius (meter)<input name="radius_m" type="number" min={50} max={2000} defaultValue={location?.radius_m ?? 200} /></label>
      <div className="admin-form-actions span-2"><button type="submit" className="admin-primary">Gem sted</button></div>
    </div>
  )
}

export default async function LocationsPage({ searchParams }: { searchParams: Promise<{ gemt?: string; fejl?: string; vis?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/steder")
  const { gemt, fejl, vis } = await searchParams
  const { locations, error } = await loadLocations(org.id, vis !== "alle")

  return (
    <main className="admin-shell">
      <div className="admin-workspace">
        <p className="admin-eyebrow">{org.name} / Steder</p>
        <div className="admin-workspace-heading"><div><h1>Steder</h1><p>Kunder og adresser, hvor der gøres rent. Positionen bruges, når medarbejderne tjekker ind.</p></div></div>

        {gemt === "1" && <p className="admin-notice is-ok" role="status">Stedet er gemt, og positionen er fundet på kortet.</p>}
        {gemt === "uden-position" && <p className="admin-notice" role="status">Stedet er gemt, men adressen blev ikke fundet på kortet. Tryk “Brug min position”, næste gang du står på stedet.</p>}
        {fejl && <p className="admin-notice is-error" role="alert">{fejl}</p>}
        {error && <p className="admin-notice is-error" role="alert">{error}</p>}

        <details className="admin-form" open={!locations.length}>
          <summary><Plus className="size-4" aria-hidden="true" /> Tilføj sted</summary>
          <form action={saveLocation}><LocationFields /></form>
        </details>

        <nav className="admin-tabs" aria-label="Filter">
          <a href="?vis=aktive" aria-current={vis !== "alle" ? "page" : undefined}>Aktive</a>
          <a href="?vis=alle" aria-current={vis === "alle" ? "page" : undefined}>Alle</a>
        </nav>

        <div className="admin-mail-list">
          {locations.map((l) => (
            <details key={l.id} className="admin-location">
              <summary>
                <div>
                  <strong>{l.name}{!l.active ? " (inaktiv)" : ""}</strong>
                  <small><MapPin className="size-3 inline" aria-hidden="true" /> {l.address}</small>
                </div>
                <span className={`admin-badge ${l.lat !== null ? "" : "status-new"}`}>{l.lat !== null ? `Position · ${l.radius_m} m` : "Mangler position"}</span>
              </summary>
              <div className="admin-location-body">
                <p className="admin-inline-form"><a href={`/admin/steder/${l.id}`} className="admin-primary">Tjekliste og produkter</a> <a href={mapsLink(l.address)} target="_blank" rel="noreferrer">Vis på kort</a> <UseMyPosition id={l.id} /></p>
                <form action={saveLocation}><LocationFields location={l} /></form>
                <form action={toggleLocation} className="admin-job-delete">
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="active" value={String(!l.active)} />
                  <button type="submit">{l.active ? "Gør inaktiv" : "Gør aktiv igen"}</button>
                </form>
              </div>
            </details>
          ))}
          {!locations.length && !error && <div className="admin-empty-state admin-empty-state-compact"><strong>0</strong><span>steder</span><p>Tilføj jeres første kunde/adresse ovenfor.</p></div>}
        </div>
      </div>
    </main>
  )
}
