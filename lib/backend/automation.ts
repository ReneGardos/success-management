import { createAdminClient } from "@/lib/supabase/admin"
import { button, mailConfigured, officeEmailFor, renderSystemHtml, sendAdminEmail, senderFor } from "@/lib/backend/mail"
import { kr, splitTotals, type Quote, type QuoteLine } from "@/lib/backend/quotes"
import { addDaysIso, invoiceNo, invoiceTotals, loadInvoice } from "@/lib/backend/invoices"
import { mailInvoice } from "@/lib/backend/invoice-mail"
import { notifyAdmins, notifyCustomer, notifyUsers } from "@/lib/backend/notify"
import { appUrl, orgSender, type Org } from "@/lib/org"
import { addDays, copenhagenToIso, todayLocal } from "@/lib/time"
import { Resend } from "resend"

export type AutomationSettings = {
  auto_invoice: boolean; invoice_day: number; invoice_send: boolean
  auto_reminders: boolean; reminder_after_days: number; reminder_repeat_days: number; reminder_max: number
  quote_followup: boolean; followup_after_days: number
  weekly_digest: boolean; digest_weekday: number
  employee_morning: boolean; customer_visit_reminder: boolean; report_reminder: boolean
}
export const defaultAutomation: AutomationSettings = { auto_invoice: false, invoice_day: 1, invoice_send: false, auto_reminders: false, reminder_after_days: 3, reminder_repeat_days: 10, reminder_max: 2, quote_followup: false, followup_after_days: 4, weekly_digest: true, digest_weekday: 1, employee_morning: true, customer_visit_reminder: true, report_reminder: true }

export async function loadAutomation(orgId: string): Promise<AutomationSettings> {
  const { data } = await createAdminClient().from("org_automation").select("*").eq("org_id", orgId).maybeSingle()
  return { ...defaultAutomation, ...(data ?? {}) } as AutomationSettings
}

type Log = { kind: string; summary: string; ref_id?: string | null }
const monthName = (period: string) => new Date(`${period}-15T12:00:00Z`).toLocaleDateString("da-DK", { month: "long", year: "numeric", timeZone: "UTC" })
const shortWhen = (iso: string) => new Date(iso).toLocaleTimeString("da-DK", { timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit" })

/** Person used as sender/creator for automatic mails and invoices (owner first). */
async function actor(orgId: string) {
  const db = createAdminClient()
  const { data } = await db.from("memberships").select("user_id, role").eq("org_id", orgId).in("role", ["owner", "admin"]).order("role", { ascending: false })
  const id = String((data ?? []).find((m) => m.role === "owner")?.user_id ?? data?.[0]?.user_id ?? "")
  if (!id) return null
  const { data: u } = await db.auth.admin.getUserById(id)
  return { id, email: u.user?.email ?? null }
}

/** 1) Fixed monthly agreements → invoice on the chosen day. */
async function recurringInvoices(org: Org, s: AutomationSettings, logs: Log[], today: string) {
  if (!s.auto_invoice || Number(today.slice(8)) < s.invoice_day) return
  const db = createAdminClient()
  const period = today.slice(0, 7)
  const me = await actor(org.id)
  if (!me) return
  const { data: quotes } = await db.from("quotes").select("*").eq("org_id", org.id).eq("status", "accepted").eq("auto_invoice", true).neq("billing", "one_time")
  for (const row of quotes ?? []) {
    if (row.accepted_at && String(row.accepted_at).slice(0, 7) === period) continue // first invoice next month
    const { data: done } = await db.from("recurring_invoice_runs").select("quote_id").eq("quote_id", row.id).eq("period", period).maybeSingle()
    if (done) continue
    const { data: lines } = await db.from("quote_line_items").select("description, quantity, unit, unit_price, position, recurring").eq("org_id", org.id).eq("quote_id", row.id).order("position")
    const q = { ...(row as unknown as Quote), lines: (lines ?? []).map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price) })) as QuoteLine[] }
    const monthly = splitTotals(q.lines, Number(q.vat_rate ?? 25), q.billing).monthlyLines
    if (!monthly.length) continue
    // Claim the period first so two runs never double-invoice.
    const { error: claim } = await db.from("recurring_invoice_runs").insert({ org_id: org.id, quote_id: q.id, period })
    if (claim) continue
    const vat = Number(q.vat_rate ?? 25)
    const { subtotal, vat: vatAmount, total } = invoiceTotals(monthly, vat)
    const { data: inv } = await db.from("invoices").insert({
      org_id: org.id, status: "draft", issue_date: today, delivery_date: today, due_date: addDaysIso(today, org.payment_terms_days ?? 8), vat_rate: vat, subtotal, vat_amount: vatAmount, total, created_by: me.id,
      quote_id: q.id, customer_id: q.customer_id, title: `${q.title || "Rengøring"} – ${monthName(period)}`, reference: `Fast aftale (tilbud nr. ${q.quote_number})`,
      recipient_company: q.recipient_company, recipient_name: q.recipient_name, recipient_email: q.recipient_email, recipient_address: q.recipient_address, recipient_cvr: q.recipient_cvr,
    }).select("id").single()
    if (!inv) continue
    await db.from("invoice_lines").insert(monthly.map((l, i) => ({ org_id: org.id, invoice_id: inv.id, description: l.description, quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, position: i })))
    await db.from("recurring_invoice_runs").update({ invoice_id: inv.id }).eq("quote_id", q.id).eq("period", period)
    const who = q.recipient_company || q.recipient_name || "kunde"
    if (s.invoice_send && q.recipient_email) {
      try {
        await db.rpc("assign_invoice_number", { p_invoice: inv.id })
        const full = await loadInvoice(org.id, inv.id)
        const first = (q.recipient_name ?? "").split(" ")[0]
        await mailInvoice(org, inv.id, me, "invoice", `Hej${first ? ` ${first}` : ""}\n\nHermed faktura for ${monthName(period)} for jeres faste aftale. Tak for samarbejdet.`)
        await db.from("invoices").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", inv.id)
        await notifyCustomer(org, q.customer_id, { kind: "invoice", title: `Faktura ${full ? invoiceNo(org, full) : ""}`, body: `${monthName(period)} · ${kr(total)}`, href: "/kunde/fakturaer" })
        logs.push({ kind: "invoice", summary: `Faktura sendt til ${who} (${monthName(period)}, ${kr(total)})`, ref_id: inv.id })
      } catch (e) {
        logs.push({ kind: "invoice", summary: `Kladde oprettet til ${who} – kunne ikke sendes: ${e instanceof Error ? e.message : "fejl"}`, ref_id: inv.id })
      }
    } else logs.push({ kind: "invoice", summary: `Fakturakladde oprettet til ${who} (${monthName(period)}, ${kr(total)})`, ref_id: inv.id })
  }
}

/** 2) Overdue invoices → polite reminders. */
async function reminders(org: Org, s: AutomationSettings, logs: Log[], today: string) {
  if (!s.auto_reminders) return
  const db = createAdminClient()
  const me = await actor(org.id)
  if (!me) return
  const { data: list } = await db.from("invoices").select("id, recipient_name, recipient_company, recipient_email, due_date, reminder_sent_at, reminder_count, credit_of, total").eq("org_id", org.id).eq("status", "sent").is("credit_of", null).lte("due_date", addDays(today, -s.reminder_after_days)).lt("reminder_count", s.reminder_max).limit(100)
  for (const inv of list ?? []) {
    if (!inv.recipient_email) continue
    if (inv.reminder_sent_at && String(inv.reminder_sent_at).slice(0, 10) > addDays(today, -s.reminder_repeat_days)) continue
    const full = await loadInvoice(org.id, inv.id)
    if (!full) continue
    const first = (inv.recipient_name ?? "").split(" ")[0]
    const n = Number(inv.reminder_count ?? 0) + 1
    const msg = n === 1
      ? `Hej${first ? ` ${first}` : ""}\n\nVi kan ikke se, at faktura nr. ${invoiceNo(org, full)} er betalt endnu. Hvis den allerede er betalt, kan du se bort fra denne mail.`
      : `Hej${first ? ` ${first}` : ""}\n\nDette er ${n}. påmindelse om faktura nr. ${invoiceNo(org, full)}, som stadig står ubetalt. Kontakt os gerne, hvis der er spørgsmål til fakturaen.`
    try {
      await mailInvoice(org, inv.id, me, "reminder", msg)
      await db.from("invoices").update({ reminder_sent_at: new Date().toISOString(), reminder_count: n }).eq("id", inv.id)
      logs.push({ kind: "reminder", summary: `${n}. påmindelse sendt til ${inv.recipient_company || inv.recipient_name || inv.recipient_email} (${kr(Number(inv.total))})`, ref_id: inv.id })
    } catch {}
  }
}

/** 3) Quotes without answer → friendly follow-up to the customer. */
async function quoteFollowups(org: Org, s: AutomationSettings, logs: Log[], today: string) {
  if (!s.quote_followup) return
  const db = createAdminClient()
  const me = await actor(org.id)
  if (!me) return
  const before = new Date(Date.now() - s.followup_after_days * 86400000).toISOString()
  const { data: list } = await db.from("quotes").select("id, quote_number, title, recipient_name, recipient_company, recipient_email, public_token, valid_until, contact_request_id").eq("org_id", org.id).eq("status", "sent").is("followup_sent_at", null).lte("sent_at", before).limit(50)
  for (const q of list ?? []) {
    if (!q.recipient_email || (q.valid_until && q.valid_until < today)) continue
    const first = (q.recipient_name ?? "").split(" ")[0]
    try {
      await sendAdminEmail({
        org, to: q.recipient_email, subject: `Har du set vores tilbud nr. ${q.quote_number}?`,
        text: `Hej${first ? ` ${first}` : ""}\n\nJeg ville lige høre, om du har haft mulighed for at kigge på vores tilbud${q.title ? ` på ${q.title.toLowerCase()}` : ""}. Har du spørgsmål eller ønsker til ændringer, så svar bare på denne mail.${q.valid_until ? `\n\nTilbuddet gælder til ${new Date(`${q.valid_until}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "long" })}.` : ""}`,
        extraHtml: button(org, `${appUrl()}/t/${q.public_token}`, "Se tilbuddet"), extraText: `Se tilbuddet: ${appUrl()}/t/${q.public_token}`,
        contactRequestId: q.contact_request_id, sentBy: me.id, sender: await senderFor(org, me.id, me.email),
      })
      await db.from("quotes").update({ followup_sent_at: new Date().toISOString() }).eq("id", q.id)
      logs.push({ kind: "followup", summary: `Opfølgning sendt på tilbud #${q.quote_number} til ${q.recipient_company || q.recipient_name || q.recipient_email}`, ref_id: q.id })
    } catch {}
  }
}

/** 4) Push: today's shifts to employees, tomorrow's visits to customers, missing reports. */
async function dailyNudges(org: Org, s: AutomationSettings, logs: Log[], today: string) {
  const db = createAdminClient()
  if (s.employee_morning) {
    const { data: jobs } = await db.from("jobs").select("id, scheduled_start, location:locations(name), title").eq("org_id", org.id).neq("status", "cancelled").gte("scheduled_start", copenhagenToIso(today, "00:00")!).lt("scheduled_start", copenhagenToIso(addDays(today, 1), "00:00")!).order("scheduled_start")
    const ids = (jobs ?? []).map((j) => j.id)
    const { data: asg } = ids.length ? await db.from("job_assignments").select("job_id, employee_id").eq("org_id", org.id).in("job_id", ids) : { data: [] }
    const per = new Map<string, typeof jobs>()
    for (const a of asg ?? []) per.set(a.employee_id, [...(per.get(a.employee_id) ?? []), (jobs ?? []).find((j) => j.id === a.job_id)!])
    for (const [emp, list] of per) {
      const f = list![0]!
      await notifyUsers(org, [emp], { kind: "shift", title: `I dag: ${list!.length} vagt${list!.length === 1 ? "" : "er"}`, body: `Første kl. ${shortWhen(f.scheduled_start!)} · ${(f.location as unknown as { name: string } | null)?.name ?? f.title ?? ""}`, href: "/medarbejder" })
    }
    if (per.size) logs.push({ kind: "nudge", summary: `Morgenbesked sendt til ${per.size} medarbejder${per.size === 1 ? "" : "e"}` })
  }
  if (s.customer_visit_reminder) {
    const tomorrow = addDays(today, 1)
    const { data: jobs } = await db.from("jobs").select("id, scheduled_start, location:locations(name, customer_id)").eq("org_id", org.id).neq("status", "cancelled").gte("scheduled_start", copenhagenToIso(tomorrow, "00:00")!).lt("scheduled_start", copenhagenToIso(addDays(tomorrow, 1), "00:00")!)
    const seen = new Set<string>()
    for (const j of jobs ?? []) {
      const loc = j.location as unknown as { name: string; customer_id: string | null } | null
      if (!loc?.customer_id || seen.has(loc.customer_id)) continue
      seen.add(loc.customer_id)
      await notifyCustomer(org, loc.customer_id, { kind: "shift", title: "Vi kommer i morgen", body: `Kl. ${shortWhen(j.scheduled_start!)} · ${loc.name}. Skal besøget flyttes, så sig til.`, href: "/kunde/besoeg" })
    }
    if (seen.size) logs.push({ kind: "nudge", summary: `Påmindelse om besøg i morgen sendt til ${seen.size} kunde${seen.size === 1 ? "" : "r"}` })
  }
  if (s.report_reminder) {
    const y = addDays(today, -1)
    const { data: jobs } = await db.from("jobs").select("id, title, location:locations(name)").eq("org_id", org.id).in("status", ["in_progress", "completed"]).gte("scheduled_start", copenhagenToIso(y, "00:00")!).lt("scheduled_start", copenhagenToIso(today, "00:00")!)
    const ids = (jobs ?? []).map((j) => j.id)
    const [{ data: asg }, { data: reps }] = ids.length ? await Promise.all([db.from("job_assignments").select("job_id, employee_id").eq("org_id", org.id).in("job_id", ids), db.from("cleaning_reports").select("job_id, employee_id, status").eq("org_id", org.id).in("job_id", ids)]) : [{ data: [] }, { data: [] }]
    let n = 0
    for (const a of asg ?? []) {
      if ((reps ?? []).some((r) => r.job_id === a.job_id && r.employee_id === a.employee_id && r.status === "submitted")) continue
      const j = (jobs ?? []).find((x) => x.id === a.job_id)
      await notifyUsers(org, [a.employee_id], { kind: "report", title: "Rapport mangler fra i går", body: (j?.location as unknown as { name: string } | null)?.name ?? j?.title ?? "", href: `/medarbejder/rapport/${a.job_id}` })
      n++
    }
    if (n) logs.push({ kind: "nudge", summary: `${n} medarbejder${n === 1 ? "" : "e"} mindet om manglende rapport` })
  }
}

/** 5) Monday digest for the office: last 7 days in numbers. */
export async function weeklyDigest(org: Org, logs: Log[], today: string) {
  const db = createAdminClient()
  const from = copenhagenToIso(addDays(today, -7), "00:00")!
  const to = copenhagenToIso(today, "00:00")!
  const [{ data: entries }, { count: visits }, { data: issued }, { data: paid }, { data: open }, { data: rated }, { count: leads }, { count: qSent }, { count: qAcc }] = await Promise.all([
    db.from("time_entries").select("check_in_at, check_out_at").eq("org_id", org.id).gte("check_in_at", from).lt("check_in_at", to).not("check_out_at", "is", null),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "completed").gte("scheduled_start", from).lt("scheduled_start", to),
    db.from("invoices").select("total").eq("org_id", org.id).neq("status", "draft").is("credit_of", null).gte("issue_date", from.slice(0, 10)).lt("issue_date", today),
    db.from("invoices").select("paid_amount, total").eq("org_id", org.id).eq("status", "paid").gte("paid_at", from).lt("paid_at", to),
    db.from("invoices").select("total, due_date").eq("org_id", org.id).eq("status", "sent"),
    db.from("cleaning_reports").select("customer_rating").eq("org_id", org.id).not("customer_rating", "is", null).gte("rated_at", from),
    db.from("leads").select("id", { count: "exact", head: true }).eq("org_id", org.id).gte("created_at", from),
    db.from("quotes").select("id", { count: "exact", head: true }).eq("org_id", org.id).gte("sent_at", from),
    db.from("quotes").select("id", { count: "exact", head: true }).eq("org_id", org.id).gte("accepted_at", from),
  ])
  const hours = (entries ?? []).reduce((t, e) => t + (new Date(e.check_out_at!).getTime() - new Date(e.check_in_at).getTime()) / 3600000, 0)
  const sum = (l: { total: number | string }[] | null) => (l ?? []).reduce((t, x) => t + Number(x.total), 0)
  const overdue = (open ?? []).filter((i) => i.due_date && i.due_date < today)
  const avg = rated?.length ? rated.reduce((t, r) => t + Number(r.customer_rating), 0) / rated.length : 0
  const rows: [string, string][] = [
    ["Udførte besøg", String(visits ?? 0)], ["Arbejdstimer", `${Math.round(hours * 10) / 10} t`], ["Faktureret", kr(sum(issued))], ["Indbetalt", kr((paid ?? []).reduce((t, x) => t + Number(x.paid_amount ?? x.total), 0))],
    ["Udestående", `${kr(sum(open))}${overdue.length ? ` (${overdue.length} forfaldne)` : ""}`], ["Kundetilfredshed", avg ? `${avg.toFixed(1)} ★ (${rated!.length})` : "–"], ["Nye henvendelser", String(leads ?? 0)], ["Tilbud sendt / accepteret", `${qSent ?? 0} / ${qAcc ?? 0}`],
  ]
  const text = `Ugens tal for ${org.name} (${addDays(today, -7)} – ${addDays(today, -1)}):\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nSe overblikket: ${appUrl()}/admin`
  if (mailConfigured()) {
    const table = `<table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555">${k}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${v}</td></tr>`).join("")}</table>${button(org, `${appUrl()}/admin`, "Åbn overblik")}`
    await new Resend(process.env.RESEND_API_KEY).emails.send({ from: orgSender(org, "noreply"), to: [officeEmailFor(org)], subject: `Ugens tal · ${org.name}`, html: renderSystemHtml(org, `Her er ugens tal for ${org.name}.`, table), text }).catch(() => {})
  }
  await notifyAdmins(org, { kind: "report", title: "Ugens tal er klar", body: `${visits ?? 0} besøg · ${Math.round(hours)} t · ${kr(sum(issued))} faktureret`, href: "/admin" })
  logs.push({ kind: "digest", summary: "Ugentlig status sendt til kontoret" })
}

/** Runs all automations for one company. Safe to run more than once a day. */
export async function runAutomation(org: Org, opts: { forceDigest?: boolean } = {}) {
  const s = await loadAutomation(org.id)
  const today = todayLocal()
  const logs: Log[] = []
  const step = async (f: () => Promise<void>) => { try { await f() } catch (e) { logs.push({ kind: "error", summary: e instanceof Error ? e.message : "Ukendt fejl" }) } }
  await step(() => recurringInvoices(org, s, logs, today))
  await step(() => reminders(org, s, logs, today))
  await step(() => quoteFollowups(org, s, logs, today))
  const db = createAdminClient()
  const { data: last } = await db.from("automation_runs").select("created_at").eq("org_id", org.id).eq("kind", "nudge").gte("created_at", copenhagenToIso(today, "00:00")!).limit(1)
  if (!last?.length) await step(() => dailyNudges(org, s, logs, today))
  const isoDay = ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + 1
  const { data: dig } = await db.from("automation_runs").select("id").eq("org_id", org.id).eq("kind", "digest").gte("created_at", copenhagenToIso(today, "00:00")!).limit(1)
  if (opts.forceDigest || (s.weekly_digest && isoDay === s.digest_weekday && !dig?.length)) await step(() => weeklyDigest(org, logs, today))
  if (logs.length) await db.from("automation_runs").insert(logs.map((l) => ({ org_id: org.id, kind: l.kind, summary: l.summary.slice(0, 500), ref_id: l.ref_id ?? null })))

  return logs
}
