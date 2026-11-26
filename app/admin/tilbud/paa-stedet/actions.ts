"use server"

import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { defaultIntro, defaultTerms } from "@/lib/backend/quotes"
import { calculate, frequencies, type FrequencyId, type PriceItem, type Selection } from "@/lib/pricing"

export type OnsitePayload = {
  customerId: string | null
  locationId: string | null
  customer: { company: string; name: string; email: string; phone: string; address: string; cvr: string }
  area: number
  frequency: FrequencyId
  discount: number
  selections: Selection[]
  notes: string
  saveCustomer: boolean
}

const clean = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max)

/** Builds a quote from the on-site calculator. Prices are recalculated on the server from the price list. */
export async function createOnsiteQuote(payload: OnsitePayload): Promise<{ ok: boolean; id?: string; token?: string; message?: string }> {
  const { org, user } = await requireRoleAction(["admin"])
  const db = createAdminClient()
  const { data: rows } = await db.from("services").select("id, name, category, unit, unit_price, recurring, qty_from_area, description").eq("org_id", org.id).eq("published", true)
  const items = (rows ?? []).map((r) => ({ ...r, unit_price: Number(r.unit_price) })) as PriceItem[]
  const freq = frequencies.find((f) => f.id === payload.frequency) ?? frequencies[3]
  const selections = (payload.selections ?? []).slice(0, 100).map((s) => ({ id: clean(s.id, 64), qty: Math.max(0, Number(s.qty) || 0), price: s.price === undefined ? undefined : Math.max(0, Number(s.price) || 0), note: clean(s.note, 200) || undefined }))
  const calc = calculate(items, selections, freq.id, Number(payload.discount) || 0)
  if (!calc.lines.length) return { ok: false, message: "Vælg mindst én ydelse." }

  // Customer: existing (same org) or new
  let customerId: string | null = null
  let c = { company: clean(payload.customer?.company, 160), name: clean(payload.customer?.name, 120), email: clean(payload.customer?.email, 180), phone: clean(payload.customer?.phone, 40), address: clean(payload.customer?.address, 300), cvr: clean(payload.customer?.cvr, 20) }
  if (payload.customerId) {
    const { data } = await db.from("customers").select("id, name, company, contact_name, email, phone, address, cvr").eq("org_id", org.id).eq("id", clean(payload.customerId, 64)).maybeSingle()
    if (data) {
      customerId = data.id
      c = { company: c.company || data.company || "", name: c.name || data.contact_name || data.name || "", email: c.email || data.email || "", phone: c.phone || data.phone || "", address: c.address || data.address || "", cvr: c.cvr || data.cvr || "" }
    }
  } else if (payload.saveCustomer && (c.company || c.name)) {
    const { data } = await db.from("customers").insert({ org_id: org.id, name: c.company || c.name, company: c.company || null, contact_name: c.name || null, email: c.email || null, phone: c.phone || null, address: c.address || null, cvr: c.cvr || null, status: "active" }).select("id").single()
    customerId = data?.id ?? null
  }
  let locationId: string | null = null
  if (payload.locationId) {
    const { data } = await db.from("locations").select("id").eq("org_id", org.id).eq("id", clean(payload.locationId, 64)).maybeSingle()
    locationId = data?.id ?? null
  }

  const byId = new Map(items.map((i) => [i.id, i]))
  const lines: { description: string; quantity: number; unit: string; unit_price: number; recurring: boolean }[] = []
  for (const s of selections) {
    const item = byId.get(s.id)
    if (!item || !(s.qty > 0)) continue
    const price = s.price ?? item.unit_price
    const detail = `${item.name}${item.unit === "m²" || item.unit !== "besøg" ? ` (${s.qty.toLocaleString("da-DK")} ${item.unit})` : ""}${item.description ? `\n${item.description}` : ""}${s.note ? `\n${s.note}` : ""}`
    if (item.recurring) lines.push({ description: `${detail}\n${freq.label}`, quantity: freq.perMonth, unit: "besøg/md.", unit_price: Math.round(s.qty * price * 100) / 100, recurring: true })
    else lines.push({ description: detail, quantity: s.qty, unit: item.unit, unit_price: price, recurring: false })
  }
  const d = Math.min(50, Math.max(0, Number(payload.discount) || 0))
  if (d > 0 && calc.monthly > 0) lines.push({ description: `Rabat ${d}% på fast aftale`, quantity: 1, unit: "md.", unit_price: -Math.round(calc.monthly * d) / 100, recurring: true })
  if (d > 0 && calc.oneOff > 0) lines.push({ description: `Rabat ${d}% på engangsopgaver`, quantity: 1, unit: "stk", unit_price: -Math.round(calc.oneOff * d) / 100, recurring: false })

  const hasMonthly = lines.some((l) => l.recurring)
  const area = Math.max(0, Number(payload.area) || 0)
  const { data: quote, error } = await db
    .from("quotes")
    .insert({
      org_id: org.id,
      source: "onsite",
      status: "draft",
      title: hasMonthly ? "Tilbud på fast rengøring" : "Tilbud",
      intro: org.quote_default_intro || defaultIntro,
      terms: org.quote_default_terms || defaultTerms,
      billing: hasMonthly ? "monthly" : "one_time",
      vat_rate: 25,
      total: hasMonthly ? calc.monthlyAfter : calc.oneOffAfter,
      valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      recipient_company: c.company || null,
      recipient_name: c.name || null,
      recipient_email: c.email || null,
      recipient_phone: c.phone || null,
      recipient_address: c.address || null,
      recipient_cvr: c.cvr || null,
      customer_id: customerId,
      location_id: locationId,
      area_m2: area || null,
      frequency: hasMonthly ? freq.id : null,
      discount_pct: d,
      notes: clean(payload.notes, 4000) || null,
      created_by: user.id,
    })
    .select("id, public_token")
    .single()
  if (error || !quote) return { ok: false, message: error?.message ?? "Tilbuddet blev ikke oprettet." }
  const { error: lineError } = await db.from("quote_line_items").insert(lines.map((l, i) => ({ ...l, org_id: org.id, quote_id: quote.id, position: i })))
  if (lineError) return { ok: false, message: lineError.message }
  return { ok: true, id: quote.id, token: quote.public_token }
}

/** Marks the quote as sent so the customer can sign on the device right away. */
export async function openForSigning(id: string) {
  const { org } = await requireRoleAction(["admin"])
  await createAdminClient().from("quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", id).eq("status", "draft")
  return { ok: true }
}
