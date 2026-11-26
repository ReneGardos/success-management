import { createAdminClient } from "@/lib/supabase/admin"

export type QuoteLine = { id?: string; description: string; quantity: number; unit: string; unit_price: number; position: number }
export type Quote = {
  id: string
  org_id: string
  quote_number: number | null
  title: string | null
  status: "draft" | "sent" | "accepted" | "declined" | "expired"
  recipient_name: string | null
  recipient_company: string | null
  recipient_email: string | null
  recipient_phone: string | null
  recipient_address: string | null
  recipient_cvr: string | null
  intro: string | null
  terms: string | null
  notes: string | null
  billing: "monthly" | "one_time"
  vat_rate: number
  valid_until: string | null
  total: number | null
  public_token: string
  contact_request_id: string | null
  sent_at: string | null
  viewed_at: string | null
  accepted_at: string | null
  accepted_name: string | null
  declined_at: string | null
  created_at: string
  lines: QuoteLine[]
}

export const defaultTerms = [
  "Tilbuddet er gældende i 30 dage fra tilbudsdatoen.",
  "Alle priser er angivet ekskl. moms, medmindre andet er nævnt.",
  "Rengøringsmidler og udstyr er inkluderet. Forbrugsvarer (toiletpapir, håndsæbe m.m.) faktureres efter forbrug, medmindre andet er aftalt.",
  "Faste aftaler faktureres månedligt forud med betaling netto 8 dage. Enkeltopgaver faktureres ved afslutning.",
  "Faste aftaler kan opsiges med 1 måneds varsel til udgangen af en måned.",
  "Opstart efter nærmere aftale. Ændringer i omfang eller frekvens kan medføre prisregulering.",
].join("\n")

export const defaultIntro = "Tak for jeres henvendelse og for muligheden for at give et tilbud. Herunder finder I vores forslag til en rengøringsløsning, der er tilpasset jeres lokaler og hverdag."

export const statusLabels: Record<string, string> = { draft: "Kladde", sent: "Sendt", accepted: "Accepteret", declined: "Afvist", expired: "Udløbet" }
export const billingLabel = (b: string) => (b === "one_time" ? "Engangsbeløb" : "Pr. måned")

export function totals(lines: QuoteLine[], vatRate: number) {
  const subtotal = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0)
  const vat = Math.round(subtotal * (vatRate / 100) * 100) / 100
  return { subtotal, vat, total: subtotal + vat }
}

export const kr = (value: number) => `${value.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`

async function withLines(row: Record<string, unknown> | null): Promise<Quote | null> {
  if (!row) return null
  const { data: lines } = await createAdminClient().from("quote_line_items").select("id, description, quantity, unit, unit_price, position").eq("org_id", row.org_id as string).eq("quote_id", row.id as string).order("position")
  return { ...(row as unknown as Quote), vat_rate: Number(row.vat_rate ?? 25), lines: (lines ?? []).map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price) })) as QuoteLine[] }
}

export async function loadQuote(orgId: string, id: string) {
  const { data } = await createAdminClient().from("quotes").select("*").eq("org_id", orgId).eq("id", id).maybeSingle()
  return withLines(data)
}

/** Public link lookup: the token identifies both the quote and its organization. */
export async function loadQuoteByToken(token: string) {
  if (!/^[a-f0-9]{20,64}$/.test(token)) return null
  const { data } = await createAdminClient().from("quotes").select("*").eq("public_token", token).maybeSingle()
  return withLines(data)
}

export function isExpired(q: Quote) {
  return q.status !== "accepted" && Boolean(q.valid_until) && q.valid_until! < new Date().toISOString().slice(0, 10)
}
