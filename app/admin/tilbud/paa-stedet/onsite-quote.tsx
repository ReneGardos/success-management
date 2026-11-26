"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, FileSignature, Minus, PenLine, Plus, Send } from "lucide-react"
import { calculate, frequencies, krRound, type FrequencyId, type PriceItem, type Selection } from "@/lib/pricing"
import { createOnsiteQuote, openForSigning, type OnsitePayload } from "./actions"

type Customer = { id: string; label: string }
type Location = { id: string; name: string; address: string; customer_id: string | null }

const emptyCustomer = { company: "", name: "", email: "", phone: "", address: "", cvr: "" }

export default function OnsiteQuote({ items, customers, locations, vatRate = 25 }: { items: PriceItem[]; customers: Customer[]; locations: Location[]; vatRate?: number }) {
  const router = useRouter()
  const [customerId, setCustomerId] = useState("")
  const [locationId, setLocationId] = useState("")
  const [customer, setCustomer] = useState(emptyCustomer)
  const [saveCustomer, setSaveCustomer] = useState(true)
  const [area, setArea] = useState(0)
  const [frequency, setFrequency] = useState<FrequencyId>("1w")
  const [discount, setDiscount] = useState(0)
  const [notes, setNotes] = useState("")
  const [picked, setPicked] = useState<Record<string, Selection>>({})
  const [message, setMessage] = useState("")
  const [pending, start] = useTransition()

  const groups = useMemo(() => {
    const m = new Map<string, PriceItem[]>()
    for (const i of items) m.set(i.category || (i.recurring ? "Fast rengøring" : "Engangsopgaver"), [...(m.get(i.category || (i.recurring ? "Fast rengøring" : "Engangsopgaver")) ?? []), i])
    return [...m.entries()]
  }, [items])

  // Items whose quantity follows the area update when the area changes.
  const selections = Object.values(picked).map((s) => {
    const item = items.find((i) => i.id === s.id)
    return item?.qty_from_area && area > 0 && s.qty === -1 ? { ...s, qty: area } : s
  })
  const calc = calculate(items, selections.map((s) => ({ ...s, qty: s.qty === -1 ? 0 : s.qty })), frequency, discount)
  const vat = (n: number) => n * (1 + vatRate / 100)

  const toggle = (item: PriceItem) => setPicked((p) => {
    const next = { ...p }
    if (next[item.id]) delete next[item.id]
    else next[item.id] = { id: item.id, qty: item.qty_from_area ? (area > 0 ? area : -1) : 1 }
    return next
  })
  const setQty = (id: string, qty: number) => setPicked((p) => ({ ...p, [id]: { ...p[id], qty: Math.max(0, Math.round(qty * 100) / 100) } }))
  const setPrice = (id: string, price: string) => setPicked((p) => ({ ...p, [id]: { ...p[id], price: price === "" ? undefined : Math.max(0, Number(price.replace(",", ".")) || 0) } }))
  const onArea = (v: number) => {
    setArea(v)
    setPicked((p) => Object.fromEntries(Object.entries(p).map(([k, s]) => [k, items.find((i) => i.id === k)?.qty_from_area ? { ...s, qty: v } : s])))
  }
  const pickCustomer = (id: string) => {
    setCustomerId(id)
    const firstLoc = locations.find((l) => l.customer_id === id)
    if (firstLoc) setLocationId(firstLoc.id)
  }

  const submit = (mode: "edit" | "sign" | "send") => start(async () => {
    setMessage("")
    const payload: OnsitePayload = { customerId: customerId || null, locationId: locationId || null, customer, area, frequency, discount, selections: selections.filter((s) => s.qty > 0), notes, saveCustomer }
    if (!customerId && mode !== "edit" && !customer.email && mode === "send") return setMessage("Skriv kundens email for at sende.")
    const res = await createOnsiteQuote(payload)
    if (!res.ok || !res.id) return setMessage(res.message ?? "Noget gik galt.")
    if (mode === "sign") {
      await openForSigning(res.id)
      router.push(`/t/${res.token}?paa-stedet=1`)
    } else router.push(`/admin/tilbud/${res.id}${mode === "send" ? "?klar=1#send" : "?gemt=1"}`)
  })

  const field = (key: keyof typeof emptyCustomer, label: string, type = "text") => (
    <label>{label}<input type={type} value={customer[key]} onChange={(e) => setCustomer({ ...customer, [key]: e.target.value })} autoComplete="off" /></label>
  )
  const count = Object.keys(picked).length

  return (
    <div className="onsite">
      <section className="crm-card onsite-step">
        <h2><span>1</span> Kunde og sted</h2>
        <div className="onsite-grid">
          <label>Eksisterende kunde<select value={customerId} onChange={(e) => pickCustomer(e.target.value)}><option value="">Ny kunde</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          <label>Sted (valgfri)<select value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">Intet sted</option>{locations.filter((l) => !customerId || !l.customer_id || l.customer_id === customerId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          {!customerId && <>
            {field("company", "Firma")}
            {field("name", "Kontaktperson")}
            {field("email", "Email", "email")}
            {field("phone", "Telefon", "tel")}
            {field("address", "Adresse")}
            {field("cvr", "CVR")}
            <label className="onsite-check onsite-span"><input type="checkbox" checked={saveCustomer} onChange={(e) => setSaveCustomer(e.target.checked)} /> Gem som kunde</label>
          </>}
        </div>
      </section>

      <section className="crm-card onsite-step">
        <h2><span>2</span> Lokaler og hyppighed</h2>
        <div className="onsite-grid">
          <label>Areal (m²)
            <div className="onsite-stepper">
              <button type="button" onClick={() => onArea(Math.max(0, area - 10))} aria-label="Mindre"><Minus className="size-4" /></button>
              <input inputMode="numeric" value={area || ""} placeholder="0" onChange={(e) => onArea(Number(e.target.value.replace(/\D/g, "")) || 0)} />
              <button type="button" onClick={() => onArea(area + 10)} aria-label="Mere"><Plus className="size-4" /></button>
            </div>
          </label>
          <label>Rabat (%)<input inputMode="numeric" value={discount || ""} placeholder="0" onChange={(e) => setDiscount(Math.min(50, Number(e.target.value.replace(/\D/g, "")) || 0))} /></label>
        </div>
        <div className="onsite-freq" role="radiogroup" aria-label="Hyppighed">
          {frequencies.map((f) => <button type="button" key={f.id} role="radio" aria-checked={frequency === f.id} className={frequency === f.id ? "is-on" : ""} onClick={() => setFrequency(f.id)}>{f.label}</button>)}
        </div>
      </section>

      <section className="crm-card onsite-step">
        <h2><span>3</span> Hvad skal laves? <small>{count} valgt</small></h2>
        {groups.map(([group, list]) => (
          <div key={group} className="onsite-group">
            <h3>{group}</h3>
            <div className="onsite-tiles">
              {list.map((item) => {
                const sel = picked[item.id]
                const qty = sel ? (sel.qty === -1 ? 0 : sel.qty) : 0
                return (
                  <div key={item.id} className={`onsite-tile${sel ? " is-on" : ""}`}>
                    <button type="button" className="onsite-tile-main" onClick={() => toggle(item)} aria-pressed={Boolean(sel)}>
                      <span className="onsite-box">{sel && <Check className="size-4" />}</span>
                      <span><strong>{item.name}</strong><small>{krRound(item.unit_price)} / {item.unit}{item.recurring ? " pr. besøg" : ""}</small></span>
                    </button>
                    {sel && (
                      <div className="onsite-tile-edit">
                        <div className="onsite-stepper">
                          <button type="button" onClick={() => setQty(item.id, qty - (item.unit === "m²" ? 10 : 1))} aria-label="Færre"><Minus className="size-4" /></button>
                          <input inputMode="decimal" value={qty || ""} placeholder="0" onChange={(e) => setQty(item.id, Number(e.target.value.replace(",", ".")) || 0)} aria-label={`Antal ${item.unit}`} />
                          <button type="button" onClick={() => setQty(item.id, qty + (item.unit === "m²" ? 10 : 1))} aria-label="Flere"><Plus className="size-4" /></button>
                          <span className="onsite-unit">{item.unit}</span>
                        </div>
                        <label className="onsite-price">Pris<input inputMode="decimal" placeholder={String(item.unit_price).replace(".", ",")} value={sel.price === undefined ? "" : String(sel.price).replace(".", ",")} onChange={(e) => setPrice(item.id, e.target.value)} /></label>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {!items.length && <p className="crm-empty">Prislisten er tom. <a href="/admin/prisliste">Tilføj ydelser</a> først.</p>}
      </section>

      <section className="crm-card onsite-step">
        <h2><span>4</span> Noter fra besigtigelsen</h2>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Interne noter: nøgler, alarm, særlige ønsker…" />
      </section>

      <aside className="onsite-summary" aria-live="polite">
        <div className="onsite-sum-figs">
          <div><small>Pr. besøg</small><strong>{krRound(calc.perVisit)}</strong></div>
          <div><small>Pr. måned ekskl. moms</small><strong>{krRound(calc.monthlyAfter)}</strong><em>{krRound(vat(calc.monthlyAfter))} inkl. moms</em></div>
          {calc.oneOff > 0 && <div><small>Engangsopgaver</small><strong>{krRound(calc.oneOffAfter)}</strong><em>{krRound(vat(calc.oneOffAfter))} inkl. moms</em></div>}
        </div>
        {message && <p className="onsite-msg" role="alert">{message}</p>}
        <div className="onsite-sum-actions">
          <button type="button" className="crm-btn" disabled={pending || !count} onClick={() => submit("edit")}><PenLine className="size-4" /> Gem og ret til</button>
          <button type="button" className="crm-btn" disabled={pending || !count} onClick={() => submit("send")}><Send className="size-4" /> Send på mail</button>
          <button type="button" className="crm-btn crm-btn-primary" disabled={pending || !count} onClick={() => submit("sign")}><FileSignature className="size-4" /> {pending ? "Opretter…" : "Underskriv nu"}</button>
        </div>
      </aside>
    </div>
  )
}
