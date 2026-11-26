import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, BellRing, CheckCircle2, ExternalLink, Plus, Receipt, Save, Send, Trash2, Undo2 } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { kr } from "@/lib/backend/quotes"
import { displayStatus, invoiceNo, invoiceStatusLabels, invoiceTotals, loadInvoice } from "@/lib/backend/invoices"
import { loadBanners, loadMailSettings } from "@/lib/backend/mail-settings"
import InvoiceDocument from "@/components/invoice-document"
import BannerSelect from "@/components/banner-select"
import { creditInvoice, deleteDraft, markPaid, markUnpaid, saveInvoice, sendInvoice, sendReminder } from "../actions"

export const dynamic = "force-dynamic"

const units = ["stk", "time", "md.", "gang", "m²", "uge", "km"]
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", dateStyle: "short", timeStyle: "short" }) : "")

type SP = { gemt?: string; sendt?: string; fejl?: string; linjer?: string; betalt?: string; rykket?: string }

export default async function InvoiceEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params
  const { org } = await requireRolePage(["admin"], `/admin/fakturaer/${id}`)
  const sp = await searchParams
  const inv = await loadInvoice(org.id, id)
  if (!inv) notFound()
  const [banners, { settings }] = await Promise.all([loadBanners(org.id), loadMailSettings(org)])
  const { subtotal, vat, total } = invoiceTotals(inv.lines, inv.vat_rate)
  const draft = inv.status === "draft"
  const shown = displayStatus(inv)
  const extra = draft ? Math.min(20, Number(sp.linjer ?? "0") || 0) + (inv.lines.length ? 1 : 3) : 0
  const rows = [...inv.lines, ...Array.from({ length: extra }, (_, i) => ({ description: "", quantity: 1, unit: "stk", unit_price: 0, position: inv.lines.length + i }))]
  const missingBank = !org.bank_account && !org.iban && !org.mobilepay

  return (
    <main className="admin-shell crm">
      <Link href="/admin/fakturaer" className="crm-back"><ArrowLeft className="size-4" /> Alle fakturaer</Link>
      <header className="crm-head">
        <div>
          <p className="crm-kicker">{inv.credit_of ? "Kreditnota" : "Faktura"}</p>
          <h1>{invoiceNo(org, inv)} <span className={`crm-pill inv-${shown}`}>{invoiceStatusLabels[shown]}</span></h1>
          <p className="crm-head-sub">
            {inv.sent_at ? `Sendt ${fmt(inv.sent_at)}` : "Ikke sendt"}
            {inv.viewed_at && ` · set af kunden ${fmt(inv.viewed_at)}`}
            {inv.reminder_sent_at && ` · rykket ${fmt(inv.reminder_sent_at)}`}
            {inv.paid_at && ` · betalt ${new Date(inv.paid_at).toLocaleDateString("da-DK")}`}
            {inv.quote_id && <> · <Link href={`/admin/tilbud/${inv.quote_id}`}>fra tilbud</Link></>}
            {inv.credit_of && <> · <Link href={`/admin/fakturaer/${inv.credit_of}`}>original faktura</Link></>}
          </p>
        </div>
        <div className="crm-head-actions">
          {!draft && <a href={`/f/${inv.public_token}`} target="_blank" rel="noreferrer" className="crm-btn"><ExternalLink className="size-4" /> Se som kunde / PDF</a>}
          {inv.status === "sent" && <form action={sendReminder}><input type="hidden" name="id" value={inv.id} /><button className="crm-btn" type="submit"><BellRing className="size-4" /> Send påmindelse</button></form>}
          {(inv.status === "sent" || inv.status === "paid") && !inv.credit_of && <form action={creditInvoice}><input type="hidden" name="id" value={inv.id} /><button className="crm-btn" type="submit"><Undo2 className="size-4" /> Kreditnota</button></form>}
        </div>
      </header>

      {sp.gemt && <p className="admin-notice is-ok" role="status">Fakturaen er gemt.</p>}
      {sp.sendt && <p className="admin-notice is-ok" role="status">Sendt til {inv.recipient_email}.</p>}
      {sp.betalt && <p className="admin-notice is-ok" role="status">Markeret som betalt.</p>}
      {sp.rykket && <p className="admin-notice is-ok" role="status">Påmindelse sendt.</p>}
      {sp.fejl && <p className="admin-notice is-error" role="alert">{sp.fejl}</p>}
      {missingBank && draft && <p className="admin-notice">Tilføj bankoplysninger under <Link href="/admin/indstillinger#faktura">Indstillinger → Fakturering</Link>, så kunden kan se, hvor der skal betales.</p>}

      {inv.status === "sent" && !inv.credit_of && (
        <form action={markPaid} className="crm-card crm-paybar">
          <input type="hidden" name="id" value={inv.id} />
          <CheckCircle2 className="size-5" />
          <strong>Registrér betaling</strong>
          <label>Dato<input type="date" name="paid_on" defaultValue={new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" })} /></label>
          <label>Beløb<input name="amount" inputMode="decimal" defaultValue={String(inv.total).replace(".", ",")} /></label>
          <button type="submit" className="crm-btn crm-btn-primary">Markér som betalt</button>
        </form>
      )}
      {inv.status === "paid" && <form action={markUnpaid} className="crm-inline"><input type="hidden" name="id" value={inv.id} /><button type="submit" className="crm-btn">Fortryd betaling</button></form>}

      <div className="admin-quote-layout">
        {draft ? (
          <form action={saveInvoice} className="admin-form admin-quote-form">
            <input type="hidden" name="id" value={inv.id} />
            <input type="hidden" name="extra_lines" value={sp.linjer ?? "0"} />
            <h2>Kunde</h2>
            <div className="admin-form-grid">
              <label>Firma<input name="recipient_company" defaultValue={inv.recipient_company ?? ""} /></label>
              <label>CVR<input name="recipient_cvr" defaultValue={inv.recipient_cvr ?? ""} /></label>
              <label>Kontaktperson<input name="recipient_name" defaultValue={inv.recipient_name ?? ""} /></label>
              <label>Email *<input name="recipient_email" type="email" defaultValue={inv.recipient_email ?? ""} /></label>
              <label>Adresse<textarea name="recipient_address" rows={2} defaultValue={inv.recipient_address ?? ""} /></label>
              <label>EAN (offentlige kunder)<input name="recipient_ean" defaultValue={inv.recipient_ean ?? ""} /></label>
            </div>
            <h2>Faktura</h2>
            <div className="admin-form-grid">
              <label className="span-2">Overskrift<input name="title" defaultValue={inv.title ?? ""} placeholder="Fx Rengøring november 2026" /></label>
              <label>Fakturadato<input name="issue_date" type="date" defaultValue={inv.issue_date} /></label>
              <label>Leveringsdato<input name="delivery_date" type="date" defaultValue={inv.delivery_date ?? ""} /></label>
              <label>Forfaldsdato<input name="due_date" type="date" defaultValue={inv.due_date ?? ""} /></label>
              <label>Moms %<input name="vat_rate" type="number" min={0} max={100} step="0.01" defaultValue={inv.vat_rate} /></label>
              <label className="span-2">Reference (kundens ordre-/PO-nr.)<input name="reference" defaultValue={inv.reference ?? ""} /></label>
            </div>
            <h2 id="linjer">Linjer</h2>
            <div className="admin-quote-lines">
              <div className="admin-quote-line admin-quote-line-head" aria-hidden="true"><span>Beskrivelse</span><span>Antal</span><span>Enhed</span><span>Pris ekskl. moms</span></div>
              {rows.map((l, i) => (
                <div className="admin-quote-line" key={i}>
                  <textarea name="line_description" rows={2} defaultValue={l.description} aria-label={`Linje ${i + 1}`} placeholder={i === 0 ? "Fx Ugentlig rengøring, november" : "Ny linje"} />
                  <input name="line_quantity" type="number" step="0.01" defaultValue={l.quantity} aria-label="Antal" />
                  <select name="line_unit" defaultValue={units.includes(l.unit) ? l.unit : "stk"} aria-label="Enhed">{units.map((u) => <option key={u}>{u}</option>)}</select>
                  <input name="line_price" type="number" step="0.01" defaultValue={l.unit_price || ""} aria-label="Pris" placeholder="0,00" />
                </div>
              ))}
              <button type="submit" name="intent" value="add_line" className="admin-add-line"><Plus className="size-4" /> Flere linjer</button>
            </div>
            <dl className="admin-quote-totals">
              <div><dt>Subtotal</dt><dd>{kr(subtotal)}</dd></div>
              <div><dt>Moms</dt><dd>{kr(vat)}</dd></div>
              <div><dt>Total</dt><dd>{kr(total)}</dd></div>
            </dl>
            <label>Bemærkning på fakturaen<textarea name="notes" rows={2} defaultValue={inv.notes ?? ""} /></label>
            <div className="admin-form-actions"><button type="submit" className="admin-primary"><Save className="size-4" /> Gem kladde</button></div>

            <h2>Send til kunden</h2>
            <label>Besked i mailen (valgfri)<textarea name="message" rows={3} /></label>
            <BannerSelect banners={banners} defaultId={settings.default_banner_id ?? "none"} />
            <div className="admin-form-actions"><button type="submit" formAction={sendInvoice} className="admin-primary"><Send className="size-4" /> Gem, giv nummer og send</button></div>
            <p className="admin-form-hint">Fakturaen får sit fortløbende nummer, når den sendes. Derefter kan den ikke ændres – brug en kreditnota.</p>
          </form>
        ) : (
          <section className="admin-form">
            <h2><Receipt className="size-4 inline" /> Sendt faktura</h2>
            <p className="admin-form-hint">Sendte fakturaer er låst, så bogføringen holder. Ret fejl med en kreditnota og en ny faktura.</p>
            <form action={sendInvoice} className="grid gap-3">
              <input type="hidden" name="id" value={inv.id} />
              <label>Besked (valgfri)<textarea name="message" rows={3} /></label>
              <div className="admin-form-actions"><button type="submit" className="admin-primary"><Send className="size-4" /> Send igen</button></div>
            </form>
          </section>
        )}
        <aside className="admin-quote-preview" aria-label="Forhåndsvisning">
          <p className="admin-eyebrow">Forhåndsvisning</p>
          <InvoiceDocument invoice={inv} org={org} />
        </aside>
      </div>

      {draft && !inv.invoice_number && (
        <form action={deleteDraft} className="admin-inline-form admin-delete-row"><input type="hidden" name="id" value={inv.id} /><button type="submit"><Trash2 className="size-4 inline" /> Slet kladde</button></form>
      )}
    </main>
  )
}
