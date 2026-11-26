"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Printer } from "lucide-react"
import { respondToQuote } from "@/app/t/[token]/actions"

export function PrintButton() {
  return <button type="button" className="quote-btn quote-btn-outline" onClick={() => window.print()}><Printer className="size-4" aria-hidden="true" /> Gem som PDF / print</button>
}

export function QuoteResponse({ token, defaultName }: { token: string; defaultName: string }) {
  const router = useRouter()
  const [name, setName] = useState(defaultName)
  const [agree, setAgree] = useState(false)
  const [message, setMessage] = useState("")
  const [pending, start] = useTransition()
  const respond = (answer: "accept" | "decline") => start(async () => {
    const result = await respondToQuote(token, answer, name)
    setMessage(result.message)
    if (result.ok) router.refresh()
  })
  return (
    <section className="quote-accept" aria-label="Acceptér tilbuddet">
      <h2>Acceptér tilbuddet</h2>
      <label>Dit fulde navn<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
      <label className="quote-accept-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Jeg har læst tilbuddet og betingelserne og accepterer på vegne af virksomheden.</label>
      <div className="quote-accept-actions">
        <button type="button" className="quote-btn" disabled={pending || !agree || name.trim().length < 2} onClick={() => respond("accept")}><CheckCircle2 className="size-4" aria-hidden="true" /> {pending ? "Sender…" : "Acceptér tilbud"}</button>
        <button type="button" className="quote-btn-link" disabled={pending} onClick={() => respond("decline")}>Nej tak</button>
      </div>
      {message && <p role="status" className="quote-accept-message">{message}</p>}
    </section>
  )
}
