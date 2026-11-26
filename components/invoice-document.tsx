import { kr } from "@/lib/backend/quotes"
import { invoiceNo, invoiceTotals, paymentLines, type Invoice } from "@/lib/backend/invoices"
import type { Org } from "@/lib/org"

const fmtDate = (value: string | null) => (value ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Copenhagen" }) : "")

/** The invoice as the customer sees it (also used for print/PDF). Contains the details Danish invoices require. */
export default function InvoiceDocument({ invoice, org }: { invoice: Invoice; org: Org }) {
  const { subtotal, vat, total } = invoiceTotals(invoice.lines, invoice.vat_rate)
  const company = org.legal_name || org.name
  const logo = org.email_logo_url || org.logo_url
  const isCredit = Boolean(invoice.credit_of)
  const pay = paymentLines(org, invoice)
  return (
    <article className="quote-doc invoice-doc" style={{ ["--quote-primary" as string]: org.color_primary, ["--quote-accent" as string]: org.color_accent }}>
      <header className="quote-doc-head">
        {logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logo} alt={company} width={220} style={{ maxHeight: 72, width: "auto" }} />
          : <strong className="quote-doc-wordmark" style={{ color: org.color_primary }}>{org.name}</strong>}
        <div className="quote-doc-company">
          <strong>{company}</strong>
          {org.address && <span>{org.address}</span>}
          {[org.phone, org.office_email].filter(Boolean).length > 0 && <span>{[org.phone, org.office_email].filter(Boolean).join(" · ")}</span>}
          {org.cvr && <span>CVR {org.cvr}</span>}
        </div>
      </header>

      <section className="quote-doc-meta">
        <div>
          <small>Faktura til</small>
          {invoice.recipient_company && <strong>{invoice.recipient_company}</strong>}
          {invoice.recipient_name && <span>Att.: {invoice.recipient_name}</span>}
          {invoice.recipient_address && <span className="whitespace-pre-line">{invoice.recipient_address}</span>}
          {invoice.recipient_cvr && <span>CVR {invoice.recipient_cvr}</span>}
          {invoice.recipient_ean && <span>EAN {invoice.recipient_ean}</span>}
        </div>
        <dl>
          <div><dt>{isCredit ? "Kreditnota nr." : "Fakturanr."}</dt><dd>{invoiceNo(org, invoice)}</dd></div>
          <div><dt>Fakturadato</dt><dd>{fmtDate(invoice.issue_date)}</dd></div>
          {invoice.delivery_date && <div><dt>Leveringsdato</dt><dd>{fmtDate(invoice.delivery_date)}</dd></div>}
          {invoice.due_date && !isCredit && <div><dt>Forfald</dt><dd>{fmtDate(invoice.due_date)}</dd></div>}
          {invoice.reference && <div><dt>Reference</dt><dd>{invoice.reference}</dd></div>}
        </dl>
      </section>

      <h1 className="quote-doc-title">{invoice.title || (isCredit ? "Kreditnota" : "Faktura")}</h1>

      <table className="quote-doc-table">
        <thead><tr><th>Beskrivelse</th><th className="num">Antal</th><th className="num">Pris</th><th className="num">Beløb</th></tr></thead>
        <tbody>
          {invoice.lines.map((l, i) => (
            <tr key={l.id ?? i}>
              <td className="whitespace-pre-line">{l.description}</td>
              <td className="num">{l.quantity.toLocaleString("da-DK")} {l.unit}</td>
              <td className="num">{kr(l.unit_price)}</td>
              <td className="num">{kr(l.quantity * l.unit_price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={3}>Subtotal ekskl. moms</td><td className="num">{kr(subtotal)}</td></tr>
          <tr><td colSpan={3}>Moms {invoice.vat_rate}% af {kr(subtotal)}</td><td className="num">{kr(vat)}</td></tr>
          <tr className="quote-doc-total"><td colSpan={3}>{isCredit ? "Krediteret i alt" : "At betale"} inkl. moms</td><td className="num">{kr(total)}</td></tr>
        </tfoot>
      </table>

      {!isCredit && pay.length > 0 && (
        <section className="quote-doc-terms">
          <h2>Betaling</h2>
          <ul>{invoice.due_date && <li>Betales senest {fmtDate(invoice.due_date)}</li>}{pay.map((p) => <li key={p}>{p}</li>)}</ul>
        </section>
      )}
      {invoice.notes && <p className="quote-doc-intro" style={{ marginTop: 20 }}>{invoice.notes}</p>}

      <footer className="quote-doc-foot">
        <p>{org.invoice_footer || "Tak for samarbejdet."}</p>
        <p><strong>{company}</strong>{org.cvr ? ` · CVR ${org.cvr}` : ""}{org.address ? ` · ${org.address}` : ""}</p>
      </footer>
    </article>
  )
}
