import { button, senderFor, sendAdminEmail } from "@/lib/backend/mail"
import { kr } from "@/lib/backend/quotes"
import { invoiceNo, loadInvoice, paymentLines } from "@/lib/backend/invoices"
import { appUrl, type Org } from "@/lib/org"

/** Sends an invoice or a payment reminder with the company's branding and payment details. */
export async function mailInvoice(org: Org, invoiceId: string, user: { id: string; email: string | null }, kind: "invoice" | "reminder", message: string, bannerId?: string) {
  const inv = await loadInvoice(org.id, invoiceId)
  if (!inv) throw new Error("Fakturaen findes ikke.")
  if (!inv.recipient_email) throw new Error("Udfyld kundens email før du sender.")
  const link = `${appUrl()}/f/${inv.public_token}`
  const no = invoiceNo(org, inv)
  const isCredit = Boolean(inv.credit_of)
  const due = inv.due_date ? new Date(`${inv.due_date}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null
  const pay = paymentLines(org, inv)
  const summary = `${isCredit ? "Kreditnota" : "Faktura"} nr. ${no} · ${kr(inv.total)} inkl. moms${due && !isCredit ? ` · forfald ${due}` : ""}`
  await sendAdminEmail({
    org,
    to: inv.recipient_email,
    subject: kind === "reminder" ? `Påmindelse: faktura nr. ${no} fra ${org.name}` : `${isCredit ? "Kreditnota" : "Faktura"} nr. ${no} fra ${org.name}`,
    text: message,
    extraHtml: `<p style="margin:22px 0 0;padding:14px 16px;background:${org.color_background};border-left:3px solid ${org.color_accent};font-size:14px;">${summary}${pay.length && !isCredit ? `<br/>${pay.join("<br/>")}` : ""}</p>${button(org, link, isCredit ? "Se kreditnota" : kind === "reminder" ? "Se og betal faktura" : "Se og download faktura")}`,
    extraText: `${summary}\n${pay.join("\n")}\n\nSe fakturaen: ${link}`,
    sentBy: user.id,
    sender: await senderFor(org, user.id, user.email),
    bannerId,
  })
}
