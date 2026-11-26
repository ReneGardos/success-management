"use client"

import { useState } from "react"
import { CalendarPlus, Check, Copy } from "lucide-react"

/** "Add to my calendar" – webcal for iPhone/Mac/Outlook, Google link, and copy for anything else. */
export default function CalendarSubscribe({ feed, label = "Tilføj til kalender" }: { feed: { https: string; webcal: string; google: string } | null; label?: string }) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  if (!feed) return null
  return (
    <div className="calsub">
      <button type="button" className="field-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}><CalendarPlus className="size-5" /> {label}</button>
      {open && (
        <div className="calsub-pop">
          <a href={feed.webcal}>iPhone, Mac og Outlook</a>
          <a href={feed.google} target="_blank" rel="noreferrer">Google Kalender</a>
          <button type="button" onClick={async () => { await navigator.clipboard.writeText(feed.https); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>{copied ? <><Check className="size-4" /> Kopieret</> : <><Copy className="size-4" /> Kopiér link</>}</button>
          <small>Kalenderen opdaterer selv, når der ændres noget.</small>
        </div>
      )}
    </div>
  )
}
