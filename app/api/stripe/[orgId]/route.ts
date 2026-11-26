import { NextResponse } from "next/server"
import { markPaidOnline, paymentSettings, verifyStripeSignature } from "@/lib/backend/payments"
import { loadOrgById } from "@/lib/org"
import { notifyAdmins } from "@/lib/backend/notify"

export const dynamic = "force-dynamic"

/** Stripe webhook per company: checkout.session.completed → invoice paid. */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return NextResponse.json({ ok: false }, { status: 404 })
  const s = await paymentSettings(orgId)
  const payload = await request.text()
  if (!s?.stripe_webhook_secret || !verifyStripeSignature(payload, request.headers.get("stripe-signature"), s.stripe_webhook_secret)) return NextResponse.json({ ok: false }, { status: 400 })
  const event = JSON.parse(payload) as { type: string; data: { object: { payment_status?: string; amount_total?: number; metadata?: Record<string, string> } } }
  const obj = event.data.object
  if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && obj.payment_status === "paid" && obj.metadata?.invoice_id && obj.metadata.org_id === orgId) {
    const paid = await markPaidOnline(orgId, obj.metadata.invoice_id, Number(obj.amount_total ?? 0) / 100)
    const org = paid ? await loadOrgById(orgId) : null
    if (org) await notifyAdmins(org, { kind: "invoice", title: `💳 Faktura ${paid!.invoice_number ?? ""} betalt online`, body: `${(Number(obj.amount_total ?? 0) / 100).toLocaleString("da-DK")} kr.`, href: `/admin/fakturaer/${obj.metadata.invoice_id}` })
  }
  return NextResponse.json({ received: true })
}
