import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import type { PriceItem } from "@/lib/pricing"
import OnsiteQuote from "./onsite-quote"

export const dynamic = "force-dynamic"
export const metadata = { title: "Tilbud på stedet" }

export default async function OnsiteQuotePage() {
  const { org } = await requireRolePage(["admin"], "/admin/tilbud/paa-stedet")
  const db = createAdminClient()
  const [{ data: services }, { data: customers }, { data: locations }] = await Promise.all([
    db.from("services").select("id, name, category, unit, unit_price, recurring, qty_from_area, description").eq("org_id", org.id).eq("published", true).order("position").order("name"),
    db.from("customers").select("id, name, company").eq("org_id", org.id).neq("status", "former").order("name").limit(500),
    db.from("locations").select("id, name, address, customer_id").eq("org_id", org.id).eq("active", true).order("name").limit(500),
  ])
  const items = (services ?? []).map((s) => ({ ...s, unit_price: Number(s.unit_price) })) as PriceItem[]
  return (
    <main className="admin-shell crm">
      <Link href="/admin/tilbud" className="crm-back"><ArrowLeft className="size-4" /> Tilbud</Link>
      <header className="crm-head"><div><p className="crm-kicker">{org.name}</p><h1>Tilbud på stedet</h1><p className="crm-head-sub">Kryds af, hvad der skal laves. Prisen regnes ud med det samme ud fra <Link href="/admin/prisliste">prislisten</Link>. Kunden kan underskrive direkte på telefonen eller iPad'en.</p></div></header>
      <OnsiteQuote items={items} customers={(customers ?? []).map((c) => ({ id: c.id, label: c.company || c.name }))} locations={(locations ?? []) as never} />
    </main>
  )
}
