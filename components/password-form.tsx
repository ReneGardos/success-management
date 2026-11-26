"use client"

import { FormEvent, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export default function PasswordForm({ disabled }: { disabled?: boolean }) {
  const [a, setA] = useState("")
  const [b, setB] = useState("")
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (a.length < 8) return setMsg("Mindst 8 tegn.")
    if (a !== b) return setMsg("De to adgangskoder er ikke ens.")
    setBusy(true)
    const { error } = await createClient().auth.updateUser({ password: a })
    setBusy(false)
    setMsg(error ? "Adgangskoden blev ikke ændret. Log ind igen og prøv igen." : "Adgangskoden er ændret.")
    if (!error) { setA(""); setB("") }
  }
  return (
    <form onSubmit={submit} className="field-form">
      <label className="field-label">Ny adgangskode<input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} disabled={disabled} /></label>
      <label className="field-label">Gentag<input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} disabled={disabled} /></label>
      <button type="submit" className="field-btn" disabled={busy || disabled}>{busy ? "Gemmer…" : "Skift adgangskode"}</button>
      {msg && <p className="pt-muted" role="status">{msg}</p>}
    </form>
  )
}
