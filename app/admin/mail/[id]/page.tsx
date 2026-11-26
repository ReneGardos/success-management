import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Mail, Phone, Send } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendMail, setRequestStatus } from "../actions"
import { createQuote } from "../../tilbud/actions"
import BannerSelect from "@/components/banner-select"
import { loadBanners, loadMailSettings } from "@/lib/backend/mail-settings"

export const dynamic = "force-dynamic"

type Message = { id: string; direction: "inbound" | "outbound"; from_email: string; to_email: string; subject: string | null; body_text: string | null; created_at: string }

const fmt = (iso: string) => new Date(iso).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", dateStyle: "medium", timeStyle: "short" })

export default async function MailThread({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sendt?: string; fejl?: string }> }) {
  const { id } = await params
  const { org } = await requireRolePage(["admin"], `/admin/mail/${id}`)
  const { sendt, fejl } = await searchParams
  const db = createAdminClient()
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const { data: request } = await db.from("contact_requests").select("*").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!request) notFound()
  const [banners, { settings }] = await Promise.all([loadBanners(org.id), loadMailSettings(org)])

  const { data: messages } = await db.from("email_messages").select("id, direction, from_email, to_email, subject, body_text, created_at").eq("org_id", org.id).eq("contact_request_id", id).order("created_at", { ascending: true })
  const thread = (messages ?? []) as Message[]
  // Opening the thread marks customer replies as read.
  await db.from("email_messages").update({ read_at: new Date().toISOString() }).eq("org_id", org.id).eq("contact_request_id", id).eq("direction", "inbound").is("read_at", null)

  const lastSubject = [...thread].reverse().find((m) => m.subject)?.subject
  const subject = lastSubject ? (lastSubject.startsWith("Re:") ? lastSubject : `Re: ${lastSubject}`) : `Vedr. din henvendelse til ${org.name}`
  const returnTo = `/admin/mail/${id}`
  const firstName = String(request.name ?? "").split(" ")[0]

  return (
    <main className="admin-shell">
      <div className="admin-workspace">
        <Link href="/admin/mail" className="admin-back"><ArrowLeft className="size-4" /> Tilbage til indbakken</Link>
        <p className="admin-eyebrow">{org.name} / Mail</p>
        <div className="admin-workspace-heading">
          <div>
            <h1>{request.name}</h1>
            <p><a href={`mailto:${request.email}`}>{request.email}</a>{request.phone ? <> · <a href={`tel:${String(request.phone).replace(/\s+/g, "")}`}>{request.phone}</a></> : null}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {request.phone && <a className="admin-view-site" href={`tel:${String(request.phone).replace(/\s+/g, "")}`}><Phone className="size-4" /> Ring op</a>}
            <form action={createQuote}><input type="hidden" name="contactRequestId" value={id} /><button type="submit" className="admin-view-site">Lav tilbud</button></form>
            <form action={setRequestStatus}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value={request.status === "closed" ? "new" : "closed"} />
              <button type="submit" className="admin-view-site">{request.status === "closed" ? "Genåbn" : "Markér som afsluttet"}</button>
            </form>
          </div>
        </div>

        {sendt && <p className="admin-notice is-ok" role="status">Svaret er sendt til {request.email}.</p>}
        {fejl && <p className="admin-notice is-error" role="alert">{fejl}</p>}

        <ol className="admin-thread">
          <li className="admin-thread-item is-inbound">
            <header><strong>{request.name}</strong><span>via {request.source === "website" ? "kontaktformularen" : request.source}</span><time dateTime={request.created_at}>{fmt(request.created_at)}</time></header>
            <p>{request.message}</p>
          </li>
          {thread.map((m) => (
            <li key={m.id} className={`admin-thread-item is-${m.direction}`}>
              <header><strong>{m.direction === "outbound" ? org.name : m.from_email}</strong><span>{m.subject}</span><time dateTime={m.created_at}>{fmt(m.created_at)}</time></header>
              <p>{m.body_text ?? "(ingen tekst)"}</p>
            </li>
          ))}
        </ol>

        <form action={sendMail} className="admin-form">
          <h2>Svar {firstName}</h2>
          <input type="hidden" name="to" value={request.email} />
          <input type="hidden" name="contactRequestId" value={id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label>Emne<input name="subject" defaultValue={subject} required /></label>
          <label>Besked<textarea name="text" rows={9} required defaultValue={`Hej ${firstName}\n\nTak for din henvendelse.\n\n`} /></label>
          <BannerSelect banners={banners} defaultId={settings.default_banner_id ?? "none"} />
          <p className="admin-form-hint"><Mail className="size-4" aria-hidden="true" /> Din signatur, firmaoplysninger og det valgte banner tilføjes automatisk.</p>
          <div className="admin-form-actions"><button type="submit" className="admin-primary"><Send className="size-4" /> Send svar</button></div>
        </form>
      </div>
    </main>
  )
}
