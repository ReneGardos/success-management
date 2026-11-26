"use server"

import { notifyAdmins, notifyCustomer } from "@/lib/backend/notify"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
import { isExpired, kr, loadQuoteByToken, totals } from "@/lib/backend/quotes"
import { mailConfigured, officeEmailFor } from "@/lib/backend/mail"
import { appUrl, loadOrgById, orgSender } from "@/lib/org"

/** Customer accepts or declines a quote from the public link. */
export async function respondToQuote(token: string, answer: "accept" | "decline", name: string) {
  const quote = await loadQuoteByToken(token)
  if (!quote) return { ok: false, message: "Tilbuddet findes ikke." }
  const org = await loadOrgById(quote.org_id)
  if (!org) return { ok: false, message: "Tilbuddet findes ikke." }
  if (quote.status === "draft") return { ok: false, message: "Tilbuddet findes ikke." }
  const call = org.phone ? ` eller ring på ${org.phone}` : ""
  if (quote.status === "accepted") return { ok: true, message: "Tilbuddet er allerede accepteret. Tak!" }
  if (answer === "accept" && isExpired(quote)) return { ok: false, message: "Tilbuddet er udløbet. Kontakt os for et opdateret tilbud." }
  const cleanName = name.trim().slice(0, 120)
  if (answer === "accept" && cleanName.length < 2) return { ok: false, message: "Skriv dit navn for at acceptere." }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? ""
  const now = new Date().toISOString()
  const update = answer === "accept"
    ? { status: "accepted", accepted_at: now, accepted_name: cleanName, notes: [quote.notes, `Accepteret online ${now} af ${cleanName}${ip ? ` (IP ${ip})` : ""}`].filter(Boolean).join("\n") }
    : { status: "declined", declined_at: now }
  const { error } = await createAdminClient().from("quotes").update(update).eq("org_id", org.id).eq("id", quote.id)
  if (error) return { ok: false, message: `Noget gik galt. Prøv igen${call}.` }
  await notifyAdmins(org, { kind: "quote", title: answer === "accept" ? `✅ Tilbud #${quote.quote_number} accepteret` : `Tilbud #${quote.quote_number} afvist`, body: quote.recipient_company || quote.recipient_name || "", href: `/admin/tilbud/${quote.id}` })

  if (mailConfigured()) {
    const { subtotal } = totals(quote.lines, quote.vat_rate)
    const who = quote.recipient_company || quote.recipient_name || "Kunden"
    await new Resend(process.env.RESEND_API_KEY).emails
      .send({
        from: orgSender(org, "noreply"),
        to: [officeEmailFor(org)],
        subject: answer === "accept" ? `✅ ${who} har accepteret tilbud #${quote.quote_number}` : `${who} har afvist tilbud #${quote.quote_number}`,
        text: `${who} har ${answer === "accept" ? `accepteret tilbud #${quote.quote_number} (${kr(subtotal)} ekskl. moms) – underskrevet af ${cleanName}` : `afvist tilbud #${quote.quote_number}`}.\n\nSe tilbuddet: ${appUrl()}/admin/tilbud/${quote.id}`,
      })
      .catch(() => {})
  }
  revalidatePath(`/t/${token}`)
  return { ok: true, message: answer === "accept" ? "Tak! Tilbuddet er accepteret. Vi kontakter jer om det videre forløb." : "Tak for svaret. Skriv eller ring gerne, hvis vi kan justere tilbuddet." }
}
