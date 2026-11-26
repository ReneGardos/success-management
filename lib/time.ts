export const timeZone = "Europe/Copenhagen"

/** Converts a date ("2026-11-25") and time ("07:30") in Danish local time to an ISO UTC string. */
export function copenhagenToIso(date: string, time: string) {
  const utcGuess = new Date(`${date}T${time || "00:00"}:00Z`)
  if (Number.isNaN(utcGuess.getTime())) return null
  const asLocal = new Date(utcGuess.toLocaleString("en-US", { timeZone }))
  const asUtc = new Date(utcGuess.toLocaleString("en-US", { timeZone: "UTC" }))
  return new Date(utcGuess.getTime() - (asLocal.getTime() - asUtc.getTime())).toISOString()
}

export const dayKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone })
export const formatDay = (iso: string) => new Date(iso).toLocaleDateString("da-DK", { timeZone, weekday: "long", day: "numeric", month: "long" })
export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("da-DK", { timeZone, hour: "2-digit", minute: "2-digit" })

/** Monday (yyyy-mm-dd) of the week containing the given local day. */
export function mondayOf(day: string) {
  const d = new Date(`${day}T12:00:00Z`)
  const weekday = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - weekday)
  return d.toISOString().slice(0, 10)
}

export function addDays(day: string, days: number) {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const todayLocal = () => new Date().toLocaleDateString("sv-SE", { timeZone })

/** ISO week number for a yyyy-mm-dd day. */
export function weekNumber(day: string) {
  const d = new Date(`${day}T12:00:00Z`)
  const thursday = new Date(d)
  thursday.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7))
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
}

export function formatDuration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000))
  return `${Math.floor(minutes / 60)} t ${String(minutes % 60).padStart(2, "0")} min`
}
