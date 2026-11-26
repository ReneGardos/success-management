"use server"

import { redirect } from "next/navigation"
import { displayStatus, invoiceNo, loadInvoiceByToken } from "@/lib/backend/invoices"
import { createCheckout } from "@/lib/backend/payments"
import { loadOrgById } from "@/lib/org"
import { isRateLimited } from "@/lib/backend/rate-limit"

/** "Betal online" on the public invoice page → Stripe Checkout. */
export async function payInvoice(token: string) {
  const inv = await loadInvoiceByToken(token)
  if (!inv || inv.credit_of) redirect("/")
  const org = await loadOrgById(inv.org_id)
  const st = displayStatus(inv)
  if (!org || (st !== "sent" && st !== "overdue")) redirect(`/f/${token}`)
  if (isRateLimited(`pay|${token}`, 10, 10 * 60 * 1000)) redirect(`/f/${token}?betaling=fejl`)
  let url = ""
  try {
    url = await createCheckout(org, { id: inv.id, public_token: inv.public_token, total: Number(inv.total), recipient_email: inv.recipient_email, title: inv.title }, `Faktura ${invoiceNo(org, inv)}`)
  } catch {
    redirect(`/f/${token}?betaling=fejl`)
  }
  redirect(url)
}
