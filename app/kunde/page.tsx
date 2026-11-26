import Link from "next/link"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { kr, statusLabels } from "@/lib/backend/quotes"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "Kundeportal", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

export default async function CustomerPage() {
  const { user, org, ctx } = await requireRolePage(["customer", "admin"], "/kunde")
  const db = createAdminClient()
  const { data: customer } = await db.from("customers").select("id, address").eq("org_id", org.id).eq("profile_id", user.id).maybeSingle()
  // Quotes linked to the customer record, or sent to the customer's login email.
  const filters = [customer ? `customer_id.eq.${customer.id}` : null, user.email ? `recipient_email.eq.${user.email}` : null].filter(Boolean).join(",")
  const { data: quotes } = filters
    ? await db.from("quotes").select("id, quote_number, title, status, total, billing, public_token").eq("org_id", org.id).neq("status", "draft").or(filters).order("created_at", { ascending: false }).limit(20)
    : { data: [] }

  return (
    <main className="min-h-screen bg-secondary/30 px-4 pb-16 pt-10" style={{ ["--primary" as string]: org.color_primary }}>
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary">{org.name} · Kundeportal</p>
            <h1 className="font-serif text-4xl font-semibold tracking-tight">Dine aftaler og tilbud</h1>
            <p className="mt-2 text-muted-foreground">Hold overblikket samlet ét sted.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {ctx.memberships.length > 1 && <Link href="/vaelg-virksomhed?skift=1" className="text-sm underline">Skift virksomhed</Link>}
            <form action="/auth/sign-out" method="post"><button type="submit" className="rounded-md border border-border bg-background px-3 py-2 text-sm">Log ud</button></form>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Card><CardHeader><CardTitle className="text-base">Adresse</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">{customer?.address || "Din adresse bliver tilføjet af teamet."}</p></CardContent></Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Tilbud</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {quotes?.length ? quotes.map((q) => (
                <a className="flex items-center justify-between rounded-lg border p-3 text-sm" key={q.id} href={`/t/${q.public_token}`}>
                  <span>#{q.quote_number} · {q.title || "Tilbud"}</span>
                  <span className="text-muted-foreground">{statusLabels[q.status] ?? q.status}{q.total ? ` · ${kr(Number(q.total))}${q.billing === "one_time" ? "" : "/md."}` : ""}</span>
                </a>
              )) : <p className="text-muted-foreground">Ingen tilbud endnu.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
