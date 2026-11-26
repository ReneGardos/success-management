// Shared (client + server) price calculation for the on-site quote.

export type PriceItem = { id: string; name: string; category: string | null; unit: string; unit_price: number; recurring: boolean; qty_from_area: boolean; description: string | null }

export const frequencies = [
  { id: "5w", label: "5 gange om ugen", perMonth: 21.67 },
  { id: "3w", label: "3 gange om ugen", perMonth: 13 },
  { id: "2w", label: "2 gange om ugen", perMonth: 8.67 },
  { id: "1w", label: "1 gang om ugen", perMonth: 4.33 },
  { id: "2wk", label: "Hver 14. dag", perMonth: 2.17 },
  { id: "1m", label: "1 gang om måneden", perMonth: 1 },
] as const

export type FrequencyId = (typeof frequencies)[number]["id"]

export type Selection = { id: string; qty: number; price?: number; note?: string }

export type Calc = {
  perVisit: number
  visitsPerMonth: number
  monthly: number
  oneOff: number
  discount: number
  monthlyAfter: number
  oneOffAfter: number
  lines: { name: string; qty: number; unit: string; unitPrice: number; recurring: boolean; amount: number; note?: string }[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Recurring items: qty × price per visit × visits per month. One-off items: qty × price. */
export function calculate(items: PriceItem[], selections: Selection[], frequency: FrequencyId, discountPct = 0): Calc {
  const freq = frequencies.find((f) => f.id === frequency) ?? frequencies[3]
  const byId = new Map(items.map((i) => [i.id, i]))
  const lines: Calc["lines"] = []
  let perVisit = 0
  let oneOff = 0
  for (const s of selections) {
    const item = byId.get(s.id)
    if (!item || !(s.qty > 0)) continue
    const unitPrice = s.price ?? item.unit_price
    if (item.recurring) {
      const visit = s.qty * unitPrice
      perVisit += visit
      lines.push({ name: item.name, qty: s.qty, unit: item.unit, unitPrice, recurring: true, amount: round2(visit * freq.perMonth), note: s.note })
    } else {
      const amount = s.qty * unitPrice
      oneOff += amount
      lines.push({ name: item.name, qty: s.qty, unit: item.unit, unitPrice, recurring: false, amount: round2(amount), note: s.note })
    }
  }
  const monthly = round2(perVisit * freq.perMonth)
  const d = Math.min(50, Math.max(0, discountPct)) / 100
  return {
    perVisit: round2(perVisit),
    visitsPerMonth: freq.perMonth,
    monthly,
    oneOff: round2(oneOff),
    discount: discountPct,
    monthlyAfter: round2(monthly * (1 - d)),
    oneOffAfter: round2(oneOff * (1 - d)),
    lines,
  }
}

export const krRound = (v: number) => `${Math.round(v).toLocaleString("da-DK")} kr.`
