import Link from "next/link"
import { Building2, HardHat, Plus } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { listStaff } from "@/lib/backend/staff"
import { isUnread, type ChatThread } from "@/lib/backend/chat"
import { startThread } from "./actions"

const ago = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" })
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }) === today
    ? d.toLocaleTimeString("da-DK", { timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "short" })
}

/** Thread list for the office, used on both the list page and next to an open thread. */
export async function loadInbox(orgId: string) {
  const db = createAdminClient()
  const [{ data: threads }, { data: customers }, { staff }] = await Promise.all([
    db.from("chat_threads").select("id, org_id, kind, customer_id, employee_id, last_message_at, last_preview, last_from_office, office_read_at, member_read_at").eq("org_id", orgId).order("last_message_at", { ascending: false, nullsFirst: false }).limit(200),
    db.from("customers").select("id, name, company").eq("org_id", orgId).order("name").limit(1000),
    listStaff(orgId),
  ])
  const cName = new Map((customers ?? []).map((c) => [c.id, c.company || c.name]))
  const eName = new Map(staff.map((s) => [s.id, s.name]))
  const rows = ((threads ?? []) as ChatThread[]).map((t) => ({ ...t, name: t.kind === "customer" ? cName.get(t.customer_id!) ?? "Kunde" : eName.get(t.employee_id!) ?? "Medarbejder", unread: isUnread(t, "office") }))
  return { rows, customers: customers ?? [], staff }
}

export default function Inbox({ data, activeId, filter }: { data: Awaited<ReturnType<typeof loadInbox>>; activeId?: string; filter?: string }) {
  const rows = data.rows.filter((r) => (filter === "kunder" ? r.kind === "customer" : filter === "team" ? r.kind === "employee" : true)).filter((r) => r.last_message_at || r.id === activeId)
  const q = (f?: string) => `/admin/beskeder${activeId ? `/${activeId}` : ""}${f ? `?vis=${f}` : ""}`
  return (
    <aside className="cx-inbox">
      <form action={startThread} className="cx-new">
        <select name="who" defaultValue="" required aria-label="Ny samtale">
          <option value="" disabled>Ny samtale med…</option>
          <optgroup label="Medarbejdere">{data.staff.map((s) => <option key={s.id} value={`e:${s.id}`}>{s.name}</option>)}</optgroup>
          <optgroup label="Kunder">{data.customers.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.company || c.name}</option>)}</optgroup>
        </select>
        <button type="submit" className="crm-btn" aria-label="Start"><Plus className="size-4" /></button>
      </form>
      <nav className="cx-tabs">
        <Link href={q()} aria-current={!filter ? "page" : undefined}>Alle</Link>
        <Link href={q("kunder")} aria-current={filter === "kunder" ? "page" : undefined}>Kunder</Link>
        <Link href={q("team")} aria-current={filter === "team" ? "page" : undefined}>Team</Link>
      </nav>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/beskeder/${r.id}${filter ? `?vis=${filter}` : ""}`} aria-current={r.id === activeId ? "page" : undefined} className={r.unread ? "is-unread" : ""}>
              <span className={`cx-av ${r.kind}`}>{r.kind === "customer" ? <Building2 className="size-4" /> : <HardHat className="size-4" />}</span>
              <span className="cx-tx"><strong>{r.name}</strong><small>{r.last_from_office ? "Du: " : ""}{r.last_preview ?? "Ingen beskeder"}</small></span>
              <span className="cx-meta"><time>{ago(r.last_message_at)}</time>{r.unread && <i aria-label="Ulæst" />}</span>
            </Link>
          </li>
        ))}
        {!rows.length && <li className="crm-empty">Ingen samtaler endnu.</li>}
      </ul>
    </aside>
  )
}
