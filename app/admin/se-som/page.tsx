import Link from "next/link"
import { Contact, Eye, HardHat } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { listStaff } from "@/lib/backend/staff"

export const dynamic = "force-dynamic"
export const metadata = { title: "Se som" }

export default async function ViewAsPage() {
  const { org } = await requireRolePage(["admin"], "/admin/se-som")
  const [{ staff }, { data: customers }] = await Promise.all([
    listStaff(org.id),
    createAdminClient().from("customers").select("id, name, company, email").eq("org_id", org.id).neq("status", "former").order("name").limit(500),
  ])
  return (
    <main className="admin-shell crm">
      <header className="crm-head"><div><p className="crm-kicker">{org.name}</p><h1>Se som</h1><p className="crm-head-sub">Se medarbejder-appen eller kundeportalen præcis som personen ser den. Visningen er skrivebeskyttet – du ændrer ikke noget på deres vegne.</p></div></header>
      <div className="crm-pairs">
        <article className="crm-card">
          <header className="crm-card-head"><div><h2><HardHat className="size-4 inline" /> Medarbejder-app</h2><p>{staff.length} medarbejdere</p></div></header>
          <ul className="crm-list">
            {staff.map((s) => <li key={s.id}><span><strong>{s.name}</strong><small className="crm-cell-sub">{s.email}</small></span><a className="crm-btn" href={`/org/se-som?type=employee&id=${s.id}`}><Eye className="size-4" /> Se som</a></li>)}
          </ul>
          {!staff.length && <p className="crm-empty">Ingen medarbejdere endnu. <Link href="/admin/brugere">Invitér</Link></p>}
        </article>
        <article className="crm-card">
          <header className="crm-card-head"><div><h2><Contact className="size-4 inline" /> Kundeportal</h2><p>{customers?.length ?? 0} kunder</p></div></header>
          <ul className="crm-list">
            {(customers ?? []).map((c) => <li key={c.id}><span><strong>{c.company || c.name}</strong><small className="crm-cell-sub">{c.email}</small></span><a className="crm-btn" href={`/org/se-som?type=customer&id=${c.id}`}><Eye className="size-4" /> Se som</a></li>)}
          </ul>
          {!customers?.length && <p className="crm-empty">Ingen kunder endnu. <Link href="/admin/kunder?ny=1">Opret kunde</Link></p>}
        </article>
      </div>
    </main>
  )
}
