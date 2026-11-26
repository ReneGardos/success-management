import Link from "next/link"
import { redirect } from "next/navigation"
import { Building2, ChevronRight, ShieldCheck } from "lucide-react"
import { getOrgContext } from "@/lib/org"

export const dynamic = "force-dynamic"
export const metadata = { title: "Vælg virksomhed", robots: { index: false, follow: false } }

const roleLabel = { owner: "Ejer", admin: "Administrator", employee: "Medarbejder", customer: "Kunde" } as const

export default async function ChooseOrganization({ searchParams }: { searchParams: Promise<{ org?: string; next?: string; fejl?: string; skift?: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/auth/login?next=/vaelg-virksomhed")
  const { org, next, fejl, skift } = await searchParams
  // Invitation links point here with ?org=…; switch straight away.
  if (org) redirect(`/org/skift?org=${encodeURIComponent(org)}${next ? `&next=${encodeURIComponent(next)}` : ""}`)
  if (ctx.memberships.length === 1 && !ctx.isSuperadmin && !fejl && !skift) redirect(`/org/skift?org=${ctx.memberships[0].orgId}`)

  return (
    <main className="sm-choose">
      <div className="sm-choose-card">
        <p className="sm-eyebrow">Success Management</p>
        <h1>Vælg virksomhed</h1>
        <p>Du er logget ind som {ctx.user.email}.</p>
        {fejl && <p className="admin-notice is-error" role="alert">Du har ikke adgang til den virksomhed.</p>}
        <ul className="sm-org-list">
          {ctx.memberships.map((m) => (
            <li key={m.orgId}>
              <a href={`/org/skift?org=${m.orgId}`}>
                <span className="sm-org-dot" style={{ background: m.colorPrimary }} aria-hidden="true"><Building2 className="size-4" /></span>
                <span><strong>{m.name}</strong><small>{roleLabel[m.role]}</small></span>
                <ChevronRight className="size-4" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
        {!ctx.memberships.length && <p>Du er ikke tilknyttet nogen virksomhed endnu. Kontakt den, der har inviteret dig.</p>}
        {ctx.isSuperadmin && <p><Link href="/superadmin" className="sm-link"><ShieldCheck className="size-4 inline" aria-hidden="true" /> Superadmin – alle virksomheder</Link></p>}
        <form action="/auth/sign-out" method="post"><button type="submit" className="sm-link">Log ud</button></form>
      </div>
    </main>
  )
}
