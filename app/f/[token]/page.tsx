import { notFound } from "next/navigation"
import { CheckCircle2 } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { displayStatus, invoiceNo, loadInvoiceByToken } from "@/lib/backend/invoices"
import { loadOrgById } from "@/lib/org"
import InvoiceDocument from "@/components/invoice-document"
import { PrintButton } from "@/components/quote-response"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const inv = await loadInvoiceByToken((await params).token)
  const org = inv ? await loadOrgById(inv.org_id) : null
  return { title: { absolute: inv && org ? `Faktura ${invoiceNo(org, inv)} | ${org.name}` : "Faktura" }, robots: { index: false, follow: false } }
}

/** Public invoice page for the customer: view, print and save as PDF. */
export default async function PublicInvoice({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const inv = await loadInvoiceByToken(token)
  if (!inv || inv.status === "draft" || inv.status === "void") notFound()
  const org = await loadOrgById(inv.org_id)
  if (!org) notFound()
  if (!inv.viewed_at) {
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (!user) await createAdminClient().from("invoices").update({ viewed_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", inv.id)
  }
  const status = displayStatus(inv)
  return (
    <main className="quote-page" style={{ background: org.color_background, ["--quote-primary" as string]: org.color_primary, ["--quote-accent" as string]: org.color_accent }}>
      <div className="quote-toolbar"><PrintButton /></div>
      {status === "paid" && <p className="quote-accepted" style={{ maxWidth: 820, margin: "0 auto 14px" }}><CheckCircle2 className="size-5" aria-hidden="true" /> Betalt – tak!</p>}
      <InvoiceDocument invoice={inv} org={org} />
    </main>
  )
}
