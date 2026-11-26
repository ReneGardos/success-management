import { employeePortal } from "@/lib/portal"
import PasswordForm from "@/components/password-form"
import ThemePicker from "@/components/theme-picker"
import { cookies } from "next/headers"
import { saveProfile } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Profil" }

export default async function EmployeeProfile({ searchParams }: { searchParams: Promise<{ gemt?: string; fejl?: string }> }) {
  const p = await employeePortal("/medarbejder/profil")
  const sp = await searchParams
  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Profil</h1><p>{p.preview ? "Visning" : p.user.email}</p></header>
      {sp.gemt && <p className="field-ok" role="status">Gemt.</p>}
      {sp.fejl && <p className="field-err" role="alert">{sp.fejl}</p>}
      <div className="pt-pairs">
        <form action={saveProfile} className="pt-card field-form">
          <h2>Mine oplysninger</h2>
          <input type="hidden" name="back" value="/medarbejder/profil" />
          <label className="field-label">Navn<input name="full_name" defaultValue={p.name} required /></label>
          <label className="field-label">Telefon<input name="phone" type="tel" defaultValue={p.phone ?? ""} /></label>
          <button type="submit" className="field-btn field-btn-primary">Gem</button>
        </form>
        <section className="pt-card"><h2>Adgangskode</h2><PasswordForm disabled={Boolean(p.preview)} /></section>
      </div>
      <section className="pt-card"><h2>Udseende</h2><ThemePicker current={(await cookies()).get("sm_theme")?.value ?? "auto"} /></section>
      <section className="pt-card">
        <h2>Kontor</h2>
        <ul className="pt-mini">
          <li><span>{p.org.legal_name || p.org.name}</span><span>{p.org.address}</span></li>
          {p.org.phone && <li><span>Telefon</span><a href={`tel:${p.org.phone.replace(/\s+/g, "")}`}>{p.org.phone}</a></li>}
          {p.org.office_email && <li><span>Email</span><a href={`mailto:${p.org.office_email}`}>{p.org.office_email}</a></li>}
        </ul>
      </section>
    </main>
  )
}
