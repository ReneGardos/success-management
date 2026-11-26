import { createAdminClient } from "@/lib/supabase/admin"
import type { Org } from "@/lib/org"

export type InvoiceLine = { id?: string; description: string; quantity: number; unit: string; unit_price: number; position: number }
export type InvoiceStatus = "draft" | "sent" | "paid" | "credited" | "void"
export type Invoice = {
  id: string
  org_id: string
  invoice_number: number | null
  customer_id: string | null
  quote_id: string | null
  credit_of: string | null
  status: InvoiceStatus
  title: string | null
  recipient_name: string | null
  recipient_company: string | null
  recipient_email: string | null
  recipient_address: string | null
  recipient_cvr: string | null
  recipient_ean: string | null
  reference: string | null
  issue_date: string
  delivery_date: string | null
  due_date: string | null
  vat_rate: number
  subtotal: number
  vat_amount: number
  total: number
  notes: string | null
  public_token: string
  sent_at: string | null
  viewed_at: string | null
  paid_at: string | null
  paid_amount: number | null
  reminder_sent_at: string | null
  created_at: string
  lines: InvoiceLine[]
}

export const invoiceStatusLabels: Record<string, string> = { draft: "Kladde", sent: "Sendt", paid: "Betalt", credited: "Krediteret", void: "Annulleret", overdue: "Forfalden" }

const todayIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" })

/** Display status: a sent invoice past its due date shows as overdue. */
export function displayStatus(inv: Pick<Invoice, "status" | "due_date">) {
  return inv.status === "sent" && inv.due_date && inv.due_date < todayIso() ? "overdue" : inv.status
}

export const invoiceNo = (org: Pick<Org, "invoice_prefix">, inv: Pick<Invoice, "invoice_number" | "credit_of">) =>
  inv.invoice_number ? `${org.invoice_prefix ?? ""}${inv.invoice_number}` : "Kladde"

export function invoiceTotals(lines: InvoiceLine[], vatRate: number) {
  const subtotal = Math.round(lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0) * 100) / 100
  const vat = Math.round(subtotal * (vatRate / 100) * 100) / 100
  return { subtotal, vat, total: Math.round((subtotal + vat) * 100) / 100 }
}

export const addDaysIso = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

async function withLines(row: Record<string, unknown> | null): Promise<Invoice | null> {
  if (!row) return null
  const { data: lines } = await createAdminClient().from("invoice_lines").select("id, description, quantity, unit, unit_price, position").eq("org_id", row.org_id as string).eq("invoice_id", row.id as string).order("position")
  return {
    ...(row as unknown as Invoice),
    vat_rate: Number(row.vat_rate ?? 25),
    subtotal: Number(row.subtotal ?? 0),
    vat_amount: Number(row.vat_amount ?? 0),
    total: Number(row.total ?? 0),
    lines: (lines ?? []).map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price) })) as InvoiceLine[],
  }
}

export async function loadInvoice(orgId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await createAdminClient().from("invoices").select("*").eq("org_id", orgId).eq("id", id).maybeSingle()
  return withLines(data)
}

export async function loadInvoiceByToken(token: string) {
  if (!/^[a-f0-9]{20,64}$/.test(token)) return null
  const { data } = await createAdminClient().from("invoices").select("*").eq("public_token", token).maybeSingle()
  return withLines(data)
}

/** Payment reference: "Faktura 1023" plus FI/bank details as configured. */
export function paymentLines(org: Org, inv: Pick<Invoice, "invoice_number">) {
  const lines: string[] = []
  if (org.bank_reg && org.bank_account) lines.push(`Reg. ${org.bank_reg} · Konto ${org.bank_account}`)
  if (org.iban) lines.push(`IBAN ${org.iban}`)
  if (org.mobilepay) lines.push(`MobilePay ${org.mobilepay}`)
  if (inv.invoice_number) lines.push(`Angiv fakturanr. ${org.invoice_prefix ?? ""}${inv.invoice_number} ved betaling`)
  return lines
}
