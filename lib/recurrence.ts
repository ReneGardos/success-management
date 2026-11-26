// Pure date helpers for repeating shifts. Dates are local "yyyy-mm-dd" strings.

export type RepeatRule = "none" | "weekly" | "biweekly" | "every3weeks" | "every4weeks" | "monthly_date" | "monthly_weekday"

export const repeatOptions: { value: RepeatRule; label: string }[] = [
  { value: "none", label: "Kun de valgte dage" },
  { value: "weekly", label: "Hver uge" },
  { value: "biweekly", label: "Hver 14. dag" },
  { value: "every3weeks", label: "Hver 3. uge" },
  { value: "every4weeks", label: "Hver 4. uge" },
  { value: "monthly_date", label: "Én gang om måneden (samme dato)" },
  { value: "monthly_weekday", label: "Én gang om måneden (fx 1. mandag)" },
]

export const MAX_OCCURRENCES = 500

const toDate = (day: string) => new Date(`${day}T12:00:00Z`)
const toDay = (d: Date) => d.toISOString().slice(0, 10)

function addDaysUtc(day: string, n: number) {
  const d = toDate(day)
  d.setUTCDate(d.getUTCDate() + n)
  return toDay(d)
}

/** The n-th (1-4) or last (5) given weekday in a month; null if it doesn't exist. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number) {
  if (nth >= 5) {
    const last = new Date(Date.UTC(year, month + 1, 0, 12))
    last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7))
    return toDay(last)
  }
  const first = new Date(Date.UTC(year, month, 1, 12))
  const offset = (weekday - first.getUTCDay() + 7) % 7
  const date = 1 + offset + (nth - 1) * 7
  const d = new Date(Date.UTC(year, month, date, 12))
  return d.getUTCMonth() === month ? toDay(d) : null
}

/** Label like "1. mandag" for the monthly-weekday rule. */
export function weekdayOrdinal(day: string) {
  const d = toDate(day)
  const names = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"]
  const nth = Math.ceil(d.getUTCDate() / 7)
  const isLast = d.getUTCMonth() !== new Date(d.getTime() + 7 * 86400000).getUTCMonth()
  return `${isLast && nth >= 4 ? "sidste" : `${nth}.`} ${names[d.getUTCDay()]}`
}

/** All dates for one starting day and rule, up to and including `until`. */
export function occurrences(start: string, rule: RepeatRule, until: string): string[] {
  if (rule === "none" || !until || until < start) return [start]
  const out: string[] = []
  const step = { weekly: 7, biweekly: 14, every3weeks: 21, every4weeks: 28 }[rule as "weekly"]
  if (step) {
    for (let day = start; day <= until && out.length < MAX_OCCURRENCES; day = addDaysUtc(day, step)) out.push(day)
    return out
  }
  const s = toDate(start)
  const dayOfMonth = s.getUTCDate()
  const weekday = s.getUTCDay()
  const nth = Math.ceil(dayOfMonth / 7)
  const isLast = s.getUTCMonth() !== new Date(s.getTime() + 7 * 86400000).getUTCMonth()
  for (let i = 0; out.length < MAX_OCCURRENCES; i++) {
    const year = s.getUTCFullYear() + Math.floor((s.getUTCMonth() + i) / 12)
    const month = (s.getUTCMonth() + i) % 12
    let day: string | null
    if (rule === "monthly_date") {
      const d = new Date(Date.UTC(year, month, dayOfMonth, 12))
      day = d.getUTCMonth() === month ? toDay(d) : null // skip months without that date (e.g. 31st)
    } else {
      day = nthWeekdayOfMonth(year, month, weekday, isLast && nth >= 4 ? 5 : nth)
    }
    if (day && day > until) break
    if (day) out.push(day)
    if (i > 600) break
  }
  return out
}

/** Expand several selected days with the same rule; sorted, unique, capped. */
export function expandDates(days: string[], rule: RepeatRule, until: string) {
  const all = new Set<string>()
  for (const d of days) for (const o of occurrences(d, rule, until)) all.add(o)
  return [...all].sort().slice(0, MAX_OCCURRENCES)
}
