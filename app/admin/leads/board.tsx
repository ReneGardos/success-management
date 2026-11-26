"use client"

import Link from "next/link"
import { useOptimistic, useState, useTransition } from "react"
import { CalendarClock, Mail, Phone } from "lucide-react"
import { moveLead } from "./actions"

export type BoardLead = { id: string; name: string; company: string | null; email: string; phone: string | null; value: number | null; status: string; next_action_at: string | null; created_at: string; source: string | null }

const kr0 = (v: number) => `${Math.round(v).toLocaleString("da-DK")} kr.`

export default function LeadBoard({ leads, stages, accent }: { leads: BoardLead[]; stages: { id: string; label: string; color: string }[]; accent: string }) {
  const [items, setOptimistic] = useOptimistic(leads, (state, move: { id: string; status: string }) => state.map((l) => (l.id === move.id ? { ...l, status: move.status } : l)))
  const [over, setOver] = useState<string | null>(null)
  const [, start] = useTransition()
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" })

  const drop = (status: string, id: string) => {
    setOver(null)
    if (!id || items.find((l) => l.id === id)?.status === status) return
    start(async () => {
      setOptimistic({ id, status })
      await moveLead(id, status)
    })
  }

  return (
    <div className="crm-board" style={{ ["--crm-accent" as string]: accent }}>
      {stages.map((st) => {
        const col = items.filter((l) => l.status === st.id)
        const sum = col.reduce((s, l) => s + Number(l.value ?? 0), 0)
        return (
          <section
            key={st.id}
            className={`crm-col${over === st.id ? " is-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(st.id) }}
            onDragLeave={() => setOver((o) => (o === st.id ? null : o))}
            onDrop={(e) => drop(st.id, e.dataTransfer.getData("text/plain"))}
            aria-label={st.label}
          >
            <header><i style={{ background: st.color }} /><h3>{st.label}</h3><span>{col.length}</span>{sum > 0 && <small>{kr0(sum)}</small>}</header>
            <div className="crm-col-body">
              {col.map((l) => (
                <article key={l.id} className="crm-lead" draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", l.id); e.dataTransfer.effectAllowed = "move" }}>
                  <Link href={`/admin/leads/${l.id}`} className="crm-lead-title">{l.company || l.name.replace(/\s*\([^)]+\)$/, "")}</Link>
                  {l.company && <p>{l.name.replace(/\s*\([^)]+\)$/, "")}</p>}
                  <div className="crm-lead-meta">
                    {l.value ? <b>{kr0(Number(l.value))}</b> : <span className="crm-muted">Ingen værdi</span>}
                    {l.next_action_at && <span className={l.next_action_at < today ? "is-late" : ""}><CalendarClock className="size-3" /> {new Date(`${l.next_action_at}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}</span>}
                  </div>
                  <div className="crm-lead-actions">
                    <a href={`mailto:${l.email}`} aria-label={`Mail ${l.name}`}><Mail className="size-3.5" /></a>
                    {l.phone && <a href={`tel:${l.phone.replace(/\s+/g, "")}`} aria-label={`Ring ${l.name}`}><Phone className="size-3.5" /></a>}
                    <small>{l.source ?? "website"}</small>
                    <select aria-label="Flyt til" value={l.status} onChange={(e) => drop(e.target.value, l.id)}>
                      {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                </article>
              ))}
              {!col.length && <p className="crm-col-empty">Træk et lead hertil</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
