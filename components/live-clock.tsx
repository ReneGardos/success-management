"use client"

import { useEffect, useState } from "react"

/** Ticking elapsed time since `since` (H:MM:SS) or countdown to `until` ("om 2 t 5 min"). */
export function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return <span className="lc-elapsed" suppressHydrationWarning>{h}:{String(m).padStart(2, "0")}<small>:{String(sec).padStart(2, "0")}</small></span>
}

export function Countdown({ until, prefix = "om" }: { until: string; prefix?: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])
  const mins = Math.round((new Date(until).getTime() - now) / 60000)
  if (mins <= 0) return <span suppressHydrationWarning>nu</span>
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60
  const txt = d ? `${d} d ${h} t` : h ? `${h} t ${m} min` : `${m} min`
  return <span suppressHydrationWarning>{prefix} {txt}</span>
}
