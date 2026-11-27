"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronsRight, Loader2 } from "lucide-react"
import { checkIn } from "@/app/medarbejder/actions"

function position(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => resolve(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 })
  })
}

/** "Slide to check in" – hard to trigger by accident in a pocket, quick on purpose. Keyboard: Enter/Space. */
export default function SlideCheckIn({ jobId, label = "Skub for at tjekke ind" }: { jobId: string; label?: string }) {
  const router = useRouter()
  const track = useRef<HTMLDivElement>(null)
  const [x, setX] = useState(0)
  const [drag, setDrag] = useState<number | null>(null)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState("")
  const max = () => (track.current ? track.current.clientWidth - 56 : 200)

  function fire() {
    setX(max())
    start(async () => {
      setMsg("Finder din position…")
      const pos = await position()
      const r = await checkIn(jobId, pos)
      setMsg(r.message + (r.ok && !pos ? " (uden GPS)" : ""))
      if (r.ok) { navigator.vibrate?.(40); router.refresh() } else setX(0)
    })
  }
  return (
    <div className="slide-wrap">
      <div ref={track} className={`slide${pending ? " is-busy" : ""}`} style={{ ["--x" as string]: `${x}px` }}>
        <span className="slide-label">{pending ? "Tjekker ind…" : label}</span>
        <button
          type="button"
          className="slide-knob"
          aria-label="Tjek ind"
          disabled={pending}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire() } }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(e.clientX - x) }}
          onPointerMove={(e) => { if (drag !== null) setX(Math.max(0, Math.min(max(), e.clientX - drag))) }}
          onPointerUp={() => { if (drag === null) return; setDrag(null); if (x > max() * 0.85) fire(); else setX(0) }}
          onPointerCancel={() => { setDrag(null); setX(0) }}
        >
          {pending ? <Loader2 className="size-6 animate-spin" /> : <ChevronsRight className="size-6" />}
        </button>
      </div>
      {msg && <p className="slide-msg" role="status">{msg}</p>}
    </div>
  )
}
