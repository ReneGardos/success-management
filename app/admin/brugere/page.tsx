import Link from "next/link"
import { ArrowLeft, UserPlus } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { listPeople } from "@/lib/backend/staff"
import { inviteUser, removeMember, setRole } from "./actions"

export const dynamic = "force-dynamic"

const roleLabels: Record<string, string> = { owner: "Ejer", admin: "Administrator", employee: "Medarbejder", customer: "Kunde" }
const filters = [["alle", "Alle"], ["employee", "Medarbejdere"], ["customer", "Kunder"], ["admin", "Administratorer"], ["owner", "Ejere"]]

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ vis?: string; fejl?: string; gemt?: string; inviteret?: string; fjernet?: string }> }) {
  const { user, org, orgRole } = await requireRolePage(["admin"], "/admin/brugere")
  const { vis = "alle", fejl, gemt, inviteret, fjernet } = await searchParams
  const { people, error } = await listPeople(org.id)
  const shown = vis === "alle" ? people : people.filter((p) => p.role === vis)

  return (
    <main className="admin-shell">
      <div className="admin-workspace">
        <Link href="/admin" className="admin-back"><ArrowLeft className="size-4" /> Tilbage til overblik</Link>
        <p className="admin-eyebrow">{org.name} / Brugere</p>
        <div className="admin-workspace-heading">
          <div><h1>Brugere</h1><p>Invitér medarbejdere og kunder til {org.name}. Har personen allerede et login (fx i en anden virksomhed), bruges det samme login.</p></div>
        </div>

        {gemt && <p className="admin-notice is-ok" role="status">Rollen er gemt.</p>}
        {fjernet && <p className="admin-notice is-ok" role="status">Personen er fjernet fra {org.name}.</p>}
        {inviteret && <p className="admin-notice is-ok" role="status">Invitation sendt til {inviteret}. Personen vælger selv en adgangskode via linket i mailen.</p>}
        {fejl && <p className="admin-notice is-error" role="alert">{fejl}</p>}
        {error && <p className="admin-notice is-error" role="alert">Kunne ikke hente brugere: {error}</p>}

        <details className="admin-form">
          <summary><UserPlus className="size-4" aria-hidden="true" /> Invitér en ny bruger</summary>
          <form action={inviteUser} className="admin-form-grid">
            <label>Navn *<input name="name" required /></label>
            <label>Email *<input name="email" type="email" required /></label>
            <label>Telefon<input name="phone" type="tel" /></label>
            <label>Stilling (vises i mail-signatur)<input name="job_title" /></label>
            <label>Rolle<select name="role" defaultValue="employee"><option value="employee">Medarbejder</option><option value="customer">Kunde</option><option value="admin">Administrator</option></select></label>
            <div className="admin-form-actions span-2"><button type="submit" className="admin-primary">Send invitation</button></div>
          </form>
        </details>

        <nav className="admin-tabs" aria-label="Filter">
          {filters.map(([value, label]) => <Link key={value} href={`?vis=${value}`} aria-current={vis === value ? "page" : undefined}>{label} ({value === "alle" ? people.length : people.filter((p) => p.role === value).length})</Link>)}
        </nav>

        <div className="admin-mail-list">
          {shown.map((p) => (
            <article key={p.id} className="admin-mail-row">
              <div>
                <strong>{p.name}{p.id === user.id ? " (dig)" : ""}</strong>
                <small>{p.email}{p.phone ? ` · ${p.phone}` : ""}</small>
                <small>{p.lastSignIn ? `Sidst logget ind ${new Date(p.lastSignIn).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen" })}` : p.confirmed ? "Har ikke logget ind endnu" : "Invitation ikke accepteret endnu"}</small>
              </div>
              <form action={setRole} className="admin-inline-form">
                <input type="hidden" name="id" value={p.id} />
                <input name="job_title" defaultValue={p.jobTitle ?? ""} placeholder="Stilling" aria-label={`Stilling for ${p.name}`} />
                <select name="role" defaultValue={p.role} aria-label={`Rolle for ${p.name}`}>
                  {Object.entries(roleLabels).filter(([v]) => v !== "owner" || orgRole === "owner" || p.role === "owner").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button type="submit">Gem</button>
              </form>
              {p.id !== user.id && (
                <form action={removeMember} className="admin-inline-form">
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" aria-label={`Fjern ${p.name} fra ${org.name}`}>Fjern</button>
                </form>
              )}
            </article>
          ))}
          {!shown.length && <div className="admin-empty-state admin-empty-state-compact"><strong>0</strong><span>brugere</span><p>Ingen i denne gruppe endnu.</p></div>}
        </div>
      </div>
    </main>
  )
}
