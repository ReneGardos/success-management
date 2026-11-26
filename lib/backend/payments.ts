import { createHmac, timingSafeEqual } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { appUrl, type Org } from "@/lib/org"

/** Stripe Checkout per company (card, MobilePay, Apple/Google Pay as enabled in that company's Stripe account). */
export async function paymentSettings(orgId: string) {
  const { data } = await createAdminClient().from("org_payment_settings").select("stripe_secret_key, stripe_webhook_secret, enabled").eq("org_id", orgId).maybeSingle()
  return data && data.enabled && data.stripe_secret_key ? data : null
}

async function stripe(secret: string, path: string, body?: URLSearchParams) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${secret}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body,
    signal: AbortSignal.timeout(15000),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new Error(((json.error as { message?: string } | undefined)?.message) ?? `Stripe ${res.status}`)
  return json
}

export async function createCheckout(org: Org, inv: { id: string; public_token: string; total: number; recipient_email: string | null; title: string | null }, label: string) {
  const s = await paymentSettings(org.id)
  if (!s) throw new Error("Online betaling er ikke slået til.")
  const amount = Math.round(Number(inv.total) * 100)
  if (!(amount > 0)) throw new Error("Fakturaen har intet beløb.")
  const back = `${appUrl()}/f/${inv.public_token}`
  const p = new URLSearchParams()
  p.set("mode", "payment")
  p.set("success_url", `${back}?betaling={CHECKOUT_SESSION_ID}`)
  p.set("cancel_url", `${back}?betaling=annulleret`)
  p.set("client_reference_id", inv.id)
  p.set("metadata[invoice_id]", inv.id)
  p.set("metadata[org_id]", org.id)
  p.set("payment_intent_data[metadata][invoice_id]", inv.id)
  p.set("line_items[0][quantity]", "1")
  p.set("line_items[0][price_data][currency]", "dkk")
  p.set("line_items[0][price_data][unit_amount]", String(amount))
  p.set("line_items[0][price_data][product_data][name]", `${label} · ${org.name}`)
  if (inv.recipient_email) p.set("customer_email", inv.recipient_email)
  p.set("locale", "da")
  const session = await stripe(s.stripe_secret_key!, "checkout/sessions", p)
  await createAdminClient().from("invoices").update({ stripe_session_id: String(session.id) }).eq("org_id", org.id).eq("id", inv.id)
  return String(session.url)
}

/** Marks the invoice paid when Stripe confirms the session. Returns true when paid. */
export async function confirmSession(orgId: string, invoiceId: string, sessionId: string) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return false
  const s = await paymentSettings(orgId)
  if (!s) return false
  const session = await stripe(s.stripe_secret_key!, `checkout/sessions/${sessionId}`).catch(() => null)
  if (!session || session.payment_status !== "paid" || (session.metadata as Record<string, string> | undefined)?.invoice_id !== invoiceId) return false
  await markPaidOnline(orgId, invoiceId, Number(session.amount_total) / 100)
  return true
}

export async function markPaidOnline(orgId: string, invoiceId: string, amount: number) {
  const db = createAdminClient()
  const { data } = await db.from("invoices").update({ status: "paid", paid_at: new Date().toISOString(), paid_amount: amount, paid_via: "stripe" }).eq("org_id", orgId).eq("id", invoiceId).neq("status", "paid").select("id, invoice_number").maybeSingle()
  return data
}

/** Stripe-Signature header check (t=…,v1=…), 5 minute tolerance. */
export function verifyStripeSignature(payload: string, header: string | null, secret: string) {
  if (!header) return false
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]))
  const t = Number(parts.t)
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest()
  return header.split(",").filter((kv) => kv.startsWith("v1=")).some((kv) => {
    const sig = Buffer.from(kv.slice(3), "hex")
    return sig.length === expected.length && timingSafeEqual(sig, expected)
  })
}
