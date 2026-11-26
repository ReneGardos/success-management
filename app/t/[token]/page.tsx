import { notFound } from "next/navigation"
import { CheckCircle2 } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isExpired, loadQuoteByToken } from "@/lib/backend/quotes"
import { loadOrgById } from "@/lib/org"
import QuoteDocument from "@/components/quote-document"
import { PrintButton, QuoteResponse } from "@/components/quote-response"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const quote = await loadQuoteByToken((await params).token)
  const org = quote ? await loadOrgById(quote.org_id) : null
  return { title: { absolute: `Tilbud${org ? ` | ${org.name}` : ""}` }, robots: { index: false, follow: false } }
}

export default async function PublicQuote({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const quote = await loadQuoteByToken(token)
  if (!quote || quote.status === "draft") notFound()
  const org = await loadOrgById(quote.org_id)
  if (!org) notFound()
  const call = org.phone ? ` på ${org.phone}` : ""

  // Record the first time the customer (not a logged-in admin) opens it.
  if (!quote.viewed_at) {
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (!user) await createAdminClient().from("quotes").update({ viewed_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", quote.id)
  }
  const expired = isExpired(quote)

  return (
    <main className="quote-page" style={{ background: org.color_background, ["--quote-primary" as string]: org.color_primary, ["--quote-accent" as string]: org.color_accent }}>
      <div className="quote-toolbar"><PrintButton /></div>
      <QuoteDocument quote={quote} org={org} />
      <div className="quote-page-actions">
        {quote.status === "accepted" ? (
          <p className="quote-accepted"><CheckCircle2 className="size-5" aria-hidden="true" /> Accepteret {quote.accepted_at ? new Date(quote.accepted_at).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen" }) : ""}{quote.accepted_name ? ` af ${quote.accepted_name}` : ""}. Tak for tilliden!</p>
        ) : quote.status === "declined" ? (
          <p className="quote-accepted is-declined">Tilbuddet er afvist. Kontakt os gerne{call}, hvis I vil have et justeret tilbud.</p>
        ) : expired ? (
          <p className="quote-accepted is-declined">Tilbuddet er udløbet. Kontakt os{call} for et opdateret tilbud.</p>
        ) : (
          <QuoteResponse token={token} defaultName={quote.recipient_name ?? ""} />
        )}
      </div>
    </main>
  )
}
