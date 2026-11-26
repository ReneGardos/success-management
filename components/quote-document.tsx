import { billingLabel, kr, splitTotals, totals, type Quote, type QuoteLine } from "@/lib/backend/quotes"
import type { Org } from "@/lib/org"

const fmtDate = (value: string | null) => (value ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Copenhagen" }) : "")

/** The quote as the customer sees it (also used for print/PDF). */
export default function QuoteDocument({ quote, org }: { quote: Quote; org: Org }) {
  const { subtotal, vat, total } = totals(quote.lines, quote.vat_rate)
  const company = org.legal_name || org.name
  const contact = [org.phone, org.office_email].filter(Boolean).join(" · ")
  const logo = org.email_logo_url || org.logo_url
  const period = quote.billing === "one_time" ? "" : " pr. måned"
  return (
    <article className="quote-doc" style={{ ["--quote-primary" as string]: org.color_primary, ["--quote-accent" as string]: org.color_accent }}>
      <header className="quote-doc-head">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={company} width={220} style={{ maxHeight: 72, width: "auto" }} />
        ) : <strong className="quote-doc-wordmark" style={{ color: org.color_primary }}>{org.name}</strong>}
        <div className="quote-doc-company">
          <strong>{company}</strong>
          {org.address && <span>{org.address}</span>}
          {contact && <span>{contact}</span>}
          {org.website && <span>{org.website.replace(/^https?:\/\//, "")}</span>}
          {org.cvr && <span>CVR {org.cvr}</span>}
        </div>
      </header>

      <section className="quote-doc-meta">
        <div>
          <small>Tilbud til</small>
          {quote.recipient_company && <strong>{quote.recipient_company}</strong>}
          {quote.recipient_name && <span>Att.: {quote.recipient_name}</span>}
          {quote.recipient_address && <span className="whitespace-pre-line">{quote.recipient_address}</span>}
          {quote.recipient_cvr && <span>CVR {quote.recipient_cvr}</span>}
        </div>
        <dl>
          <div><dt>Tilbud nr.</dt><dd>{quote.quote_number ?? "–"}</dd></div>
          <div><dt>Dato</dt><dd>{fmtDate(quote.sent_at ?? quote.created_at)}</dd></div>
          {quote.valid_until && <div><dt>Gyldigt til</dt><dd>{fmtDate(quote.valid_until)}</dd></div>}
        </dl>
      </section>

      <h1 className="quote-doc-title">{quote.title || "Tilbud"}</h1>
      {quote.intro && <p className="quote-doc-intro">{quote.intro}</p>}

      {(() => {
        const split = splitTotals(quote.lines, quote.vat_rate, quote.billing)
        const table = (lines: QuoteLine[], t: ReturnType<typeof totals>, label: string, suffix: string) => (
          <table className="quote-doc-table">
            <thead><tr><th>{label}</th><th className="num">Antal</th><th className="num">Pris</th><th className="num">Beløb</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id ?? i}>
                  <td className="whitespace-pre-line">{l.description}</td>
                  <td className="num">{l.quantity.toLocaleString("da-DK")} {l.unit}</td>
                  <td className="num">{kr(l.unit_price)}</td>
                  <td className="num">{kr(l.quantity * l.unit_price)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={3}>Subtotal ekskl. moms</td><td className="num">{kr(t.subtotal)}</td></tr>
              <tr><td colSpan={3}>Moms {quote.vat_rate}%</td><td className="num">{kr(t.vat)}</td></tr>
              <tr className="quote-doc-total"><td colSpan={3}>Total inkl. moms{suffix}</td><td className="num">{kr(t.total)}</td></tr>
            </tfoot>
          </table>
        )
        if (split.mixed) {
          return (
            <>
              {table(split.monthlyLines, split.monthly, "Fast aftale", " pr. måned")}
              <div style={{ height: 18 }} />
              {table(split.oneOffLines, split.oneOff, "Engangsopgaver", "")}
              <p className="quote-doc-billing">Fast aftale {kr(split.monthly.subtotal)} ekskl. moms pr. måned · engangsopgaver {kr(split.oneOff.subtotal)} ekskl. moms</p>
            </>
          )
        }
        return (
          <>
            {table(quote.lines, { subtotal, vat, total }, "Beskrivelse", period)}
            <p className="quote-doc-billing">{billingLabel(quote.billing)} · {kr(subtotal)} ekskl. moms{period}</p>
          </>
        )
      })()}

      {quote.terms && (
        <section className="quote-doc-terms">
          <h2>Betingelser</h2>
          <ul>{quote.terms.split("\n").filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}</ul>
        </section>
      )}

      <footer className="quote-doc-foot">
        <p>Vi ser frem til samarbejdet. Har I spørgsmål, er I altid velkomne til at kontakte os.</p>
        <p><strong>{company}</strong>{contact ? ` · ${contact}` : ""}</p>
      </footer>
    </article>
  )
}
