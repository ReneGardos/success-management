"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, Loader2, SendHorizontal } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { shrink } from "@/components/photo-upload"
import type { ChatMessage } from "@/lib/backend/chat"

type Props = {
  messages: ChatMessage[]
  side: "office" | "member"
  send?: (formData: FormData) => Promise<{ ok: boolean; message?: string }>
  uploadTarget?: () => Promise<{ path: string; token: string }>
  registerPhoto?: (path: string, kind: string, caption: string) => Promise<{ ok: boolean; message?: string }>
  emptyText?: string
  placeholder?: string
  jobs?: { id: string; label: string }[]
}

const dayLabel = (iso: string) => {
  const d = new Date(iso)
  const key = (x: Date) => x.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" })
  const today = new Date()
  const y = new Date(Date.now() - 86400000)
  if (key(d) === key(today)) return "I dag"
  if (key(d) === key(y)) return "I går"
  return d.toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "long", day: "numeric", month: "long" })
}
const time = (iso: string) => new Date(iso).toLocaleTimeString("da-DK", { timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit" })

/** Chat bubbles + composer with photo. Refreshes every few seconds while visible. */
export default function ChatView({ messages, side, send, uploadTarget, registerPhoto, emptyText = "Ingen beskeder endnu. Skriv den første.", placeholder = "Skriv en besked…", jobs }: Props) {
  const router = useRouter()
  const list = useRef<HTMLDivElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [draft, setDraft] = useState<{ body: string; at: string } | null>(null)

  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh() }, 8000)
    return () => clearInterval(t)
  }, [router])
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }) }, [messages.length, draft])
  useEffect(() => { setDraft(null) }, [messages.length])

  function submit(fd: FormData) {
    if (!send) return
    const body = String(fd.get("body") ?? "").trim()
    if (!body) return
    setError("")
    setDraft({ body, at: new Date().toISOString() })
    form.current?.reset()
    start(async () => {
      const r = await send(fd)
      if (!r.ok) { setError(r.message ?? "Fejl"); setDraft(null) }
      router.refresh()
    })
  }

  async function onPhoto(files: FileList | null) {
    if (!files?.length || !uploadTarget || !registerPhoto) return
    setBusy(true)
    setError("")
    try {
      const supabase = createClient()
      for (const f of Array.from(files).slice(0, 6)) {
        const blob = await shrink(f)
        const t = await uploadTarget()
        const { error: up } = await supabase.storage.from("org-photos").uploadToSignedUrl(t.path, t.token, blob, { contentType: "image/jpeg" })
        if (up) throw new Error(up.message)
        const r = await registerPhoto(t.path, "chat", "")
        if (!r.ok) throw new Error(r.message ?? "Billedet blev ikke sendt")
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fejlede")
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ""
    }
  }

  let lastDay = ""
  return (
    <div className="ch">
      <div className="ch-list" ref={list} aria-live="polite">
        {!messages.length && !draft && <p className="ch-empty">{emptyText}</p>}
        {messages.map((m, i) => {
          const mine = (side === "office") === m.from_office
          const day = dayLabel(m.created_at)
          const showDay = day !== lastDay
          lastDay = day
          const prev = messages[i - 1]
          const grouped = prev && prev.from_office === m.from_office && prev.author_name === m.author_name && !showDay && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000
          return (
            <div key={m.id} className="ch-item">
              {showDay && <p className="ch-day"><span>{day}</span></p>}
              <div className={`ch-msg${mine ? " is-mine" : ""}${grouped ? " is-grouped" : ""}`}>
                {!grouped && !mine && <span className="ch-author">{m.author_name}</span>}
                {m.job?.title && <span className="ch-ref">Om: {m.job.title}{m.job.scheduled_start ? ` · ${new Date(m.job.scheduled_start).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}` : ""}</span>}
                {m.photos.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="ch-photo">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt="Billede" loading="lazy" /></a>)}
                {m.body && <p>{m.body}</p>}
                <time>{time(m.created_at)}</time>
              </div>
            </div>
          )
        })}
        {draft && <div className="ch-item"><div className="ch-msg is-mine is-sending"><p>{draft.body}</p><time>Sender…</time></div></div>}
      </div>
      {send ? (
        <form ref={form} action={submit} className="ch-compose">
          {error && <p className="ch-err" role="alert">{error}</p>}
          {jobs && jobs.length > 0 && <select name="job_id" defaultValue="" aria-label="Om vagt"><option value="">Generelt</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</select>}
          <div className="ch-row">
            {uploadTarget && <button type="button" className="ch-icon" onClick={() => file.current?.click()} disabled={busy} aria-label="Send billede">{busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}</button>}
            <textarea name="body" rows={1} placeholder={placeholder} maxLength={4000} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); form.current?.requestSubmit() } }} onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 140)}px` }} />
            <button type="submit" className="ch-send" disabled={pending} aria-label="Send"><SendHorizontal className="size-5" /></button>
          </div>
          <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => onPhoto(e.target.files)} />
        </form>
      ) : <p className="ch-empty">Visning – du kan ikke skrive her.</p>}
    </div>
  )
}
