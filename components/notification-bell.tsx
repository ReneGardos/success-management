"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, BellRing, CalendarDays, Check, ClipboardList, Download, FileText, MessageCircle, PackageOpen, Receipt, X } from "lucide-react"

type Item = { id: string; kind: string; title: string; body: string | null; href: string | null; read_at: string | null; created_at: string }
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const icons: Record<string, typeof Bell> = { chat: MessageCircle, shift: CalendarDays, absence: CalendarDays, report: ClipboardList, supply: PackageOpen, invoice: Receipt, quote: FileText, order: FileText, feedback: MessageCircle }

function ago(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "lige nu"
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} t`
  return new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" })
}

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Bell with dropdown, unread badge, push opt-in and "install as app". Registers the service worker. */
export default function NotificationBell({ pushKey, tone = "light" }: { pushKey: string; tone?: "light" | "dark" }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [unread, setUnread] = useState(0)
  const [push, setPush] = useState<"unsupported" | "off" | "on" | "denied">("unsupported")
  const [install, setInstall] = useState<InstallEvent | null>(null)
  const [ios, setIos] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" })
      if (!r.ok) return
      const d = (await r.json()) as { unread: number; items: Item[] }
      setUnread((prev) => {
        if (d.unread > prev && prev >= 0) router.refresh()
        return d.unread
      })
      setItems(d.items)
    } catch {}
  }, [router])

  useEffect(() => {
    load()
    const t = setInterval(() => { if (document.visibilityState === "visible") load() }, 30000)
    const onVis = () => document.visibilityState === "visible" && load()
    document.addEventListener("visibilitychange", onVis)
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis) }
  }, [load])

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone)
    const onPrompt = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent) }
    window.addEventListener("beforeinstallprompt", onPrompt)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(async (reg) => {
        if (!("PushManager" in window) || !pushKey) return
        if (Notification.permission === "denied") return setPush("denied")
        const sub = await reg.pushManager.getSubscription()
        setPush(sub ? "on" : "off")
        if (sub) fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) }).catch(() => {})
      }).catch(() => {})
      const onMsg = () => load()
      navigator.serviceWorker.addEventListener("message", onMsg)
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [pushKey, load])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc) }
  }, [open])

  async function enablePush() {
    try {
      const perm = await Notification.requestPermission()
      if (perm !== "granted") return setPush(perm === "denied" ? "denied" : "off")
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(pushKey) })
      await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) })
      setPush("on")
    } catch { setPush("off") }
  }
  async function disablePush() {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) { await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe() }
    setPush("off")
  }
  async function markAll() {
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
    setUnread(0)
    setItems((list) => list.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })))
  }
  function openItem(i: Item) {
    if (!i.read_at) { fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: i.id }) }); setUnread((u) => Math.max(0, u - 1)) }
    setOpen(false)
    if (i.href) router.push(i.href)
  }

  return (
    <div className={`nb nb-${tone}`} ref={box}>
      <button type="button" className="nb-btn" aria-label={`Notifikationer${unread ? ` (${unread} ulæste)` : ""}`} aria-expanded={open} onClick={() => { setOpen((o) => !o); if (!open) load() }}>
        {unread ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        {unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
      </button>
      {open && (
        <div className="nb-pop" role="dialog" aria-label="Notifikationer">
          <header><strong>Notifikationer</strong>{unread > 0 && <button type="button" onClick={markAll}><Check className="size-4" /> Marker alle læst</button>}<button type="button" className="nb-x" onClick={() => setOpen(false)} aria-label="Luk"><X className="size-4" /></button></header>
          {push === "off" && <div className="nb-cta"><span>Få besked på telefonen, også når appen er lukket.</span><button type="button" onClick={enablePush}>Slå til</button></div>}
          {push === "denied" && <div className="nb-cta is-muted"><span>Notifikationer er blokeret i browseren. Tillad dem i indstillingerne for siden.</span></div>}
          {install && <div className="nb-cta"><span>Installér som app på din enhed.</span><button type="button" onClick={async () => { await install.prompt(); setInstall(null) }}><Download className="size-4" /> Installér</button></div>}
          {ios && push !== "on" && <div className="nb-cta is-muted"><span>iPhone/iPad: tryk Del → «Føj til hjemmeskærm» for at få appen og notifikationer.</span></div>}
          <ul>
            {items.map((i) => { const Icon = icons[i.kind] ?? Bell; return (
              <li key={i.id} className={i.read_at ? "" : "is-new"}>
                <button type="button" onClick={() => openItem(i)}>
                  <span className="nb-ic"><Icon className="size-4" /></span>
                  <span className="nb-tx"><strong>{i.title}</strong>{i.body && <small>{i.body}</small>}</span>
                  <time>{ago(i.created_at)}</time>
                </button>
              </li>
            ) })}
            {!items.length && <li className="nb-empty">Ingen notifikationer endnu.</li>}
          </ul>
          {push === "on" && <footer><span>Push er slået til på denne enhed</span><button type="button" onClick={disablePush}>Slå fra</button></footer>}
        </div>
      )}
    </div>
  )
}
