"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowRightLeft, Hand, Loader2, Undo2 } from "lucide-react"
import { offerShift, takeOverShift, withdrawOffer } from "@/app/medarbejder/actions"

type R = { ok: boolean; message: string }

export function OfferShift({ jobId, openId }: { jobId: string; openId?: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<R | null>(null)
  const run = (f: () => Promise<R>) => start(async () => { const r = await f(); setMsg(r); if (r.ok) { setOpen(false); router.refresh() } })
  if (openId) return (
    <div className="ho">
      <p className="ho-note"><ArrowRightLeft className="size-4" /> Sat til overtagelse – du er på vagten, indtil en kollega tager den.</p>
      <button type="button" className="field-btn" disabled={pending} onClick={() => run(() => withdrawOffer(openId))}>{pending ? <Loader2 className="size-5 animate-spin" /> : <Undo2 className="size-5" />} Behold vagten</button>
      {msg && <p className="slide-msg">{msg.message}</p>}
    </div>
  )
  return (
    <div className="ho">
      {open ? (
        <>
          <input className="field-note" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Hvorfor? (valgfrit – fx lægetid)" maxLength={300} />
          <div className="pt-actions">
            <button type="button" className="field-btn field-btn-primary" disabled={pending} onClick={() => run(() => offerShift(jobId, reason))}>{pending ? <Loader2 className="size-5 animate-spin" /> : <ArrowRightLeft className="size-5" />} Sæt til overtagelse</button>
            <button type="button" className="field-btn" onClick={() => setOpen(false)}>Fortryd</button>
          </div>
        </>
      ) : <button type="button" className="field-btn" onClick={() => setOpen(true)}><ArrowRightLeft className="size-5" /> Kan ikke? Afgiv vagt</button>}
      {msg && <p className="slide-msg">{msg.message}</p>}
    </div>
  )
}

export function TakeOver({ handoverId }: { handoverId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState("")
  return (
    <div className="ho">
      <button type="button" className="field-btn field-btn-primary" disabled={pending} onClick={() => start(async () => { const r = await takeOverShift(handoverId); setMsg(r.message); if (r.ok) { navigator.vibrate?.(30); router.refresh() } })}>{pending ? <Loader2 className="size-5 animate-spin" /> : <Hand className="size-5" />} Overtag vagten</button>
      {msg && <p className="slide-msg">{msg}</p>}
    </div>
  )
}
