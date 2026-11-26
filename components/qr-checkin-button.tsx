"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { CheckCircle2, Loader2, LogIn } from "lucide-react"
import { qrCheckIn } from "@/app/medarbejder/actions"

export default function QrCheckInButton({ token, jobId, reportHref }: { token: string; jobId: string; reportHref: string }) {
  const [pending, start] = useTransition()
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null)
  if (res?.ok) return (
    <div className="field-form">
      <p className="field-ok" role="status"><CheckCircle2 className="size-5 inline" /> {res.message}</p>
      <Link href={reportHref} className="field-btn field-btn-primary">Åbn rengøringsrapport</Link>
    </div>
  )
  return (
    <div className="field-form">
      <button type="button" className="field-btn field-btn-primary" disabled={pending} onClick={() => start(async () => setRes((await qrCheckIn(token, jobId)) as { ok: boolean; message: string }))}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />} Tjek ind nu
      </button>
      {res && !res.ok && <p className="field-err" role="alert">{res.message}</p>}
    </div>
  )
}
