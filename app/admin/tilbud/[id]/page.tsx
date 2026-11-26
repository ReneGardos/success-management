import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Copy, ExternalLink, Plus, Save, Send, Trash2 } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { kr, loadQuote, statusLabels, totals } from "@/lib/backend/quotes"
import QuoteDocument from "@/components/quote-document"
import BannerSelect from "@/components/banner-select"
import { loadBanners, loadMailSettings } from "@/lib/backend/mail-settings"
import { deleteQuote, duplicateQuote, saveQuote, sendQuote, setQuoteStatus } from "../actions"

export const dynamic = "force-dynamic"

const units = ["md.", "stk", "time", "gang", "m²", "uge"]

export default async function QuoteEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gemt?: string; sendt?: string; fejl?: string; linjer?: string }> }) {
  const { id } = await params
  const { org } = await requireRolePage(["admin"], `/admin/tilbud/${id}`)
  const sp = await searchParams
  const quote = await loadQuote(org.id, id)
  if (!quote) notFound()
  const [banners, { settings }] = await Promise.all([loadBanners(org.id), loadMailSettings(org)])
  const { subtotal, vat, total } = totals(quote.lines, quote.vat_rate)
  const extra = Math.min(20, Number(sp.linjer ?? "0") || 0) + (quote.lines.length ? 1 : 3)
  const rows = [...quote.lines, ...Array.from({ length: extra }, (_, i) => ({ description: "", quantity: 1, unit: quote.billing === "one_time" ? "stk" : "md.", unit_price: 0, position: quote.lines.length + i }))]

  return (
    <main className="admin-shell">
      <div className="admin-workspace admin-workspace-wide">
        <Link href="/admin/tilbud" className="admin-back"><ArrowLeft className="size-4" /> Alle tilbud</Link>
        <p className="admin-eyebrow">{org.name} / Tilbud #{quote.quote_number}</p>
        <div className="admin-workspace-heading">
          <div>
            <h1>Tilbud #{quote.quote_number}</h1>
            <p><span className={`admin-badge quote-${quote.status}`}>{statusLabels[quote.status]}</span>
              {quote.sent_at && ` · sendt ${new Date(quote.sent_at).toLocaleDateString("da-DK")}`}
              {quote.viewed_at && ` · set af kunden ${new Date(quote.viewed_at).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", dateStyle: "short", timeStyle: "short" })}`}
              {quote.accepted_at && ` · accepteret ${new Date(quote.accepted_at).toLocaleDateString("da-DK")}${quote.accepted_name ? ` af ${quote.accepted_name}` : ""}`}</p>
          </div>
          <div className="admin-week-nav">
            <a href={`/t/${quote.public_token}`} target="_blank" rel="noreferrer" className="admin-view-site"><ExternalLink className="size-4" /> Se som kunde</a>
            <form action={duplicateQuote}><input type="hidden" name="id" value={quote.id} /><button className="admin-view-site" type="submit"><Copy className="size-4" /> Kopiér</button></form>
          </div>
        </div>

        {sp.gemt && <p className="admin-notice is-ok" role="status">Tilbuddet er gemt.</p>}
        {sp.sendt && <p className="admin-notice is-ok" role="status">Tilbuddet er sendt til {quote.recipient_email}. Du kan se her, når kunden har åbnet det.</p>}
        {sp.fejl && <p className="admin-notice is-error" role="alert">{sp.fejl}</p>}

        <div className="admin-quote-layout">
          <form action={saveQuote} className="admin-form admin-quote-form">
            <input type="hidden" name="id" value={quote.id} />
            <input type="hidden" name="extra_lines" value={sp.linjer ?? "0"} />
            <h2>Kunde</h2>
            <div className="admin-form-grid">
              <label>Firma<input name="recipient_company" defaultValue={quote.recipient_company ?? ""} /></label>
              <label>CVR<input name="recipient_cvr" defaultValue={quote.recipient_cvr ?? ""} /></label>
              <label>Kontaktperson<input name="recipient_name" defaultValue={quote.recipient_name ?? ""} /></label>
              <label>Email *<input name="recipient_email" type="email" defaultValue={quote.recipient_email ?? ""} /></label>
              <label>Telefon<input name="recipient_phone" type="tel" defaultValue={quote.recipient_phone ?? ""} /></label>
              <label>Adresse<textarea name="recipient_address" rows={2} defaultValue={quote.recipient_address ?? ""} /></label>
            </div>

            <h2>Tilbud</h2>
            <div className="admin-form-grid">
              <label className="span-2">Overskrift<input name="title" defaultValue={quote.title ?? ""} /></label>
              <label className="span-2">Indledning<textarea name="intro" rows={3} defaultValue={quote.intro ?? ""} /></label>
              <label>Pris er<select name="billing" defaultValue={quote.billing}><option value="monthly">Pr. måned (fast aftale)</option><option value="one_time">Engangsbeløb</option></select></label>
              <label>Gyldigt til<input name="valid_until" type="date" defaultValue={quote.valid_until ?? ""} /></label>
              <label>Moms %<input name="vat_rate" type="number" min={0} max={100} step="0.01" defaultValue={quote.vat_rate} /></label>
            </div>

            <h2 id="linjer">Linjer</h2>
            <div className="admin-quote-lines">
              <div className="admin-quote-line admin-quote-line-head" aria-hidden="true"><span>Beskrivelse</span><span>Antal</span><span>Enhed</span><span>Pris ekskl. moms</span></div>
              {rows.map((l, i) => (
                <div className="admin-quote-line" key={i}>
                  <textarea name="line_description" rows={2} defaultValue={l.description} aria-label={`Linje ${i + 1} beskrivelse`} placeholder={i === 0 ? "Fx Daglig rengøring af kontor (250 m²), mandag–fredag" : "Ny linje"} />
                  <input name="line_quantity" type="number" step="0.01" min={0} defaultValue={l.quantity} aria-label="Antal" />
                  <select name="line_unit" defaultValue={units.includes(l.unit) ? l.unit : "stk"} aria-label="Enhed">{units.map((u) => <option key={u}>{u}</option>)}</select>
                  <input name="line_price" type="number" step="0.01" min={0} defaultValue={l.unit_price || ""} aria-label="Pris" placeholder="0,00" />
                </div>
              ))}
              <button type="submit" name="intent" value="add_line" className="admin-add-line"><Plus className="size-4" /> Flere linjer</button>
            </div>
            <dl className="admin-quote-totals">
              <div><dt>Subtotal</dt><dd>{kr(subtotal)}</dd></div>
              <div><dt>Moms</dt><dd>{kr(vat)}</dd></div>
              <div><dt>Total{quote.billing === "one_time" ? "" : " pr. md."}</dt><dd>{kr(total)}</dd></div>
            </dl>
            <p className="admin-form-hint">Beløbene opdateres, når du gemmer. Tomme linjer ignoreres.</p>

            <h2>Betingelser</h2>
            <label>Én betingelse pr. linje<textarea name="terms" rows={7} defaultValue={quote.terms ?? ""} /></label>
            <label>Intern note (ses ikke af kunden)<textarea name="notes" rows={2} defaultValue={quote.notes ?? ""} /></label>

            <div className="admin-form-actions"><button type="submit" className="admin-primary"><Save className="size-4" /> Gem</button></div>

            <h2>Send til kunden</h2>
            <label>Besked i mailen (valgfri – ellers bruges en standardtekst)<textarea name="message" rows={4} placeholder={`Hej ${(quote.recipient_name ?? "").split(" ")[0]}\n\nTak for en god dialog. Hermed vores tilbud…`} /></label>
            <BannerSelect banners={banners} defaultId={settings.default_banner_id ?? "none"} />
            <div className="admin-form-actions">
              <button type="submit" formAction={sendQuote} className="admin-primary"><Send className="size-4" /> {quote.sent_at ? "Send igen" : "Gem og send tilbud"}</button>
            </div>
            <p className="admin-form-hint">Kunden får en mail med din signatur og en knap til at se, gemme som PDF og acceptere tilbuddet.</p>
          </form>

          <aside className="admin-quote-preview" aria-label="Forhåndsvisning">
            <p className="admin-eyebrow">Forhåndsvisning (gemt version)</p>
            <QuoteDocument quote={quote} org={org} />
          </aside>
        </div>

        <div className="admin-inline-form admin-delete-row">
          <form action={setQuoteStatus} className="admin-inline-form">
            <input type="hidden" name="id" value={quote.id} />
            <select name="status" defaultValue={quote.status} aria-label="Status">{Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <button type="submit">Skift status</button>
          </form>
          <form action={deleteQuote}><input type="hidden" name="id" value={quote.id} /><button type="submit"><Trash2 className="size-4 inline" aria-hidden="true" /> Slet tilbud</button></form>
        </div>
      </div>
    </main>
  )
}
