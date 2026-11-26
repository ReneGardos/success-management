import { notFound } from "next/navigation"
import { CheckCircle2, CreditCard } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { displayStatus, invoiceNo, loadInvoiceByToken } from "@/lib/backend/invoices"
import { loadOrgById } from "@/lib/org"
import InvoiceDocument from "@/components/invoice-document"
import { PrintButton } from "@/components/quote-response"
import { confirmSession, paymentSettings } from "@/lib/backend/payments"
import { notifyAdmins } from "@/lib/backend/notify"
import { payInvoice } from "./actions"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const inv = await loadInvoiceByToken((await params).token)
  const org = inv ? await loadOrgById(inv.org_id) : null
  return { title: { absolute: inv && org ? `Faktura ${invoiceNo(org, inv)} | ${org.name}` : "Faktura" }, robots: { index: false, follow: false } }
}

/** Public invoice page for the customer: view, print and save as PDF. */
export default async function PublicInvoice({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ betaling?: string }> }) {
  const { token } = await params
  const sp = await searchParams
  let inv = await loadInvoiceByToken(token)
  if (!inv || inv.status === "draft" || inv.status === "void") notFound()
  const org = await loadOrgById(inv.org_id)
  if (!org) notFound()
  if (!inv.viewed_at) {
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (!user) await createAdminClient().from("invoices").update({ viewed_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", inv.id)
  }
  // Back from Stripe: confirm with Stripe before showing "paid".
  if (sp.betaling?.startsWith("cs_") && displayStatus(inv) !== "paid" && (await confirmSession(org.id, inv.id, sp.betaling))) {
    await notifyAdmins(org, { kind: "invoice", title: `💳 Faktura ${invoiceNo(org, inv)} betalt online`, body: `${Number(inv.total).toLocaleString("da-DK")} kr.`, href: `/admin/fakturaer/${inv.id}` })
    inv = (await loadInvoiceByToken(token)) ?? inv
  }
  const status = displayStatus(inv)
  const canPay = !inv.credit_of && (status === "sent" || status === "overdue") && Boolean(await paymentSettings(org.id))
  return (
    <main className="quote-page" style={{ background: org.color_background, ["--quote-primary" as string]: org.color_primary, ["--quote-accent" as string]: org.color_accent }}>
      <div className="quote-toolbar">
        {canPay && <form action={payInvoice.bind(null, token)}><button type="submit" className="pay-btn"><CreditCard className="size-5" /> Betal {Number(inv.total).toLocaleString("da-DK", { minimumFractionDigits: 2 })} kr. online</button></form>}
        <PrintButton />
      </div>
      {sp.betaling === "fejl" && <p className="field-err" style={{ maxWidth: 820, margin: "0 auto 14px" }}>Betalingen kunne ikke startes. Prøv igen eller betal via bankoverførsel.</p>}
      {sp.betaling === "annulleret" && <p className="admin-notice" style={{ maxWidth: 820, margin: "0 auto 14px" }}>Betalingen blev afbrudt. Du kan prøve igen når som helst.</p>}
      {status === "paid" && <p className="quote-accepted" style={{ maxWidth: 820, margin: "0 auto 14px" }}><CheckCircle2 className="size-5" aria-hidden="true" /> Betalt – tak!</p>}
      <InvoiceDocument invoice={inv} org={org} />
    </main>
  )
}
