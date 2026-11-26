"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, LogIn, LogOut, Hand } from "lucide-react"
import { checkIn, checkOut, claimShift } from "@/app/medarbejder/actions"

type Pos = { lat: number; lng: number; accuracy: number } | null

function getPosition(): Promise<Pos> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    )
  })
}

const btn = "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 text-base font-semibold disabled:opacity-60"

export function CheckInButton({ jobId, disabled }: { jobId: string; disabled?: boolean }) {
  const router = useRouter()
  const [message, setMessage] = useState("")
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col gap-2">
      <button type="button" disabled={pending || disabled} className={`${btn} bg-primary text-primary-foreground`} onClick={() => start(async () => {
        setMessage("Finder din position…")
        const pos = await getPosition()
        const result = await checkIn(jobId, pos)
        setMessage(result.message + (pos ? "" : " (uden GPS – giv adgang til placering næste gang)"))
        if (result.ok) router.refresh()
      })}><LogIn className="size-5" aria-hidden="true" /> {pending ? "Tjekker ind…" : "Tjek ind"}</button>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}

export function CheckOutForm({ entryId }: { entryId: string }) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const [done, setDone] = useState(true)
  const [km, setKm] = useState("")
  const [pause, setPause] = useState("")
  const [message, setMessage] = useState("")
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm">Note til kontoret (valgfri)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm" placeholder="Fx manglede sæbe i køkkenet" />
      </label>
      <div className="co-extra">
        <label>Pause (min)<input inputMode="numeric" value={pause} onChange={(e) => setPause(e.target.value.replace(/\D/g, ""))} placeholder="0" /></label>
        <label>Kørsel (km)<input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="0" /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} /> <CheckCircle2 className="size-4" aria-hidden="true" /> Opgaven er færdig</label>
      <button type="button" disabled={pending} className={`${btn} bg-foreground text-background`} onClick={() => start(async () => {
        setMessage("Finder din position…")
        const pos = await getPosition()
        const result = await checkOut(entryId, pos, note, done, { km: Number(km.replace(",", ".")) || 0, breakMin: Number(pause) || 0 })
        if (result.ok) navigator.vibrate?.(40)
        setMessage(result.message)
        if (result.ok) router.refresh()
      })}><LogOut className="size-5" aria-hidden="true" /> {pending ? "Tjekker ud…" : "Tjek ud"}</button>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}

export function ClaimButton({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [message, setMessage] = useState("")
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col gap-2">
      <button type="button" disabled={pending} className={`${btn} border border-primary text-primary`} onClick={() => start(async () => {
        const result = await claimShift(jobId)
        setMessage(result.message)
        if (result.ok) router.refresh()
      })}><Hand className="size-5" aria-hidden="true" /> {pending ? "Tager vagten…" : "Tag vagten"}</button>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}
