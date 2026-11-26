/** Minimal iCalendar (RFC 5545) writer for read-only subscription feeds. */
export type IcsEvent = { uid: string; start: string; end?: string | null; title: string; location?: string | null; description?: string | null; url?: string | null; cancelled?: boolean; updated?: string | null }

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

/** Folds long lines at 75 octets as the spec requires. */
function fold(line: string) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let cur = ""
  let len = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (len + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; len = 0 }
    cur += ch
    len += n
  }
  out.push(cur)
  return out.join("\r\n ")
}

export function buildIcs(name: string, events: IcsEvent[]) {
  const now = stamp(new Date().toISOString())
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Success Management//DA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`, "X-WR-TIMEZONE:Europe/Copenhagen", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"]
  for (const e of events) {
    const end = e.end ?? new Date(new Date(e.start).getTime() + 3600000).toISOString()
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${e.updated ? stamp(e.updated) : now}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(e.title)}`)
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`)
    if (e.url) lines.push(`URL:${e.url}`)
    lines.push(`STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT")
  }
  lines.push("END:VCALENDAR")
  return lines.map(fold).join("\r\n") + "\r\n"
}
