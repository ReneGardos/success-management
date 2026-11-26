import { createAdminClient } from "@/lib/supabase/admin"
import { customerPortal } from "@/lib/portal"
import PasswordForm from "@/components/password-form"
import { saveProfile } from "@/app/medarbejder/profil/actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Profil" }

export default async function CustomerProfile({ searchParams }: { searchParams: Promise<{ gemt?: string; fejl?: string }> }) {
  const p = await customerPortal("/kunde/profil")
  const sp = await searchParams
  const { data: me } = p.preview ? { data: null } : await createAdminClient().from("profiles").select("full_name, phone").eq("id", p.user.id).maybeSingle()
  const c = p.customers[0]
  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Profil</h1><p>{p.preview ? "Visning" : p.user.email}</p></header>
      {sp.gemt && <p className="field-ok" role="status">Gemt.</p>}
      {sp.fejl && <p className="field-err" role="alert">{sp.fejl}</p>}
      <div className="pt-pairs">
        <form action={saveProfile} className="pt-card field-form">
          <h2>Mine oplysninger</h2>
          <fieldset disabled={Boolean(p.preview)}>
            <input type="hidden" name="back" value="/kunde/profil" />
            <label className="field-label">Navn<input name="full_name" defaultValue={me?.full_name ?? c?.contact_name ?? ""} required /></label>
            <label className="field-label">Telefon<input name="phone" type="tel" defaultValue={me?.phone ?? ""} /></label>
            <button type="submit" className="field-btn field-btn-primary">Gem</button>
          </fieldset>
        </form>
        <section className="pt-card"><h2>Adgangskode</h2><PasswordForm disabled={Boolean(p.preview)} /></section>
      </div>
      <div className="pt-pairs">
        <section className="pt-card">
          <h2>Kundeoplysninger</h2>
          <ul className="pt-mini">
            {c ? <>
              <li><span>Firma</span><span>{c.company || c.name}</span></li>
              {c.address && <li><span>Adresse</span><span>{c.address}</span></li>}
              {c.email && <li><span>Faktura-email</span><span>{c.email}</span></li>}
              {p.locations.map((l) => <li key={l.id}><span>Sted</span><span>{l.name}{l.address ? `, ${l.address}` : ""}</span></li>)}
            </> : <li className="pt-empty">Ikke koblet til en kunde endnu.</li>}
          </ul>
          <p className="pt-muted">Skal noget rettes? Skriv til os under Feedback.</p>
        </section>
        <section className="pt-card">
          <h2>Kontakt {p.org.name}</h2>
          <ul className="pt-mini">
            <li><span>Adresse</span><span>{p.org.address}</span></li>
            {p.org.phone && <li><span>Telefon</span><a href={`tel:${p.org.phone.replace(/\s+/g, "")}`}>{p.org.phone}</a></li>}
            {p.org.office_email && <li><span>Email</span><a href={`mailto:${p.org.office_email}`}>{p.org.office_email}</a></li>}
          </ul>
        </section>
      </div>
    </main>
  )
}
