"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Eraser, Loader2, PenLine } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

/** Finger/stylus signature on the employee's device, saved as PNG on the report. */
export default function SignaturePad({ requestTarget, register, existingUrl, existingName }: {
  requestTarget: () => Promise<{ path: string; token: string }>
  register: (path: string, name: string) => Promise<{ ok: boolean; message?: string }>
  existingUrl?: string | null
  existingName?: string | null
}) {
  const router = useRouter()
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [editing, setEditing] = useState(!existingUrl)

  useEffect(() => {
    const c = canvas.current
    if (!c || !editing) return
    const ratio = Math.max(1, window.devicePixelRatio || 1)
    const w = c.clientWidth
    c.width = w * ratio
    c.height = 180 * ratio
    const ctx = c.getContext("2d")!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.4
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#101828"
  }, [editing])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; last.current = point(e) }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return
    const ctx = e.currentTarget.getContext("2d")!
    const p = point(e)
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last.current = p
    setEmpty(false)
  }
  const up = () => { drawing.current = false; last.current = null }
  const clear = () => { const c = canvas.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setEmpty(true) }

  async function save() {
    if (empty) return setMsg("Underskriv i feltet først.")
    setBusy(true)
    setMsg("")
    try {
      const blob = await new Promise<Blob>((res, rej) => canvas.current!.toBlob((b) => (b ? res(b) : rej(new Error("Kunne ikke gemme"))), "image/png"))
      const t = await requestTarget()
      const { error } = await createClient().storage.from("org-photos").uploadToSignedUrl(t.path, t.token, blob, { contentType: "image/png" })
      if (error) throw new Error(error.message)
      const r = await register(t.path, name)
      if (!r.ok) throw new Error(r.message ?? "Ikke gemt")
      setEditing(false)
      router.refresh()
    } catch (e) { setMsg(e instanceof Error ? e.message : "Fejl") } finally { setBusy(false) }
  }

  if (!editing && existingUrl) {
    return (
      <div className="sig-done">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={existingUrl} alt="Underskrift" />
        <p><PenLine className="size-4" /> Kvitteret{existingName ? ` af ${existingName}` : ""}</p>
        <button type="button" className="field-btn" onClick={() => setEditing(true)}>Ny underskrift</button>
      </div>
    )
  }
  return (
    <div className="sig">
      <canvas ref={canvas} className="sig-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} aria-label="Underskriftsfelt" />
      <div className="sig-line"><span>Underskrift</span><button type="button" onClick={clear} aria-label="Ryd"><Eraser className="size-4" /> Ryd</button></div>
      <input className="field-note" value={name} onChange={(e) => setName(e.target.value)} placeholder="Navn (med blokbogstaver)" maxLength={120} />
      <button type="button" className="field-btn field-btn-primary" onClick={save} disabled={busy}>{busy ? <Loader2 className="size-5 animate-spin" /> : <PenLine className="size-5" />} Gem underskrift</button>
      {msg && <p className="ip-err">{msg}</p>}
    </div>
  )
}
