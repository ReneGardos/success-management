/** Distance in metres between two coordinates. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371000
  const toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * r * Math.asin(Math.sqrt(a)))
}

/** Looks up coordinates for a Danish address via OpenStreetMap. Returns null if not found. */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=dk&q=${encodeURIComponent(address)}`
    const response = await fetch(url, {
      headers: { "User-Agent": "SuccessManagement/1.0 (rene@successcleaningaps.dk)", "Accept-Language": "da" },
      cache: "no-store",
    })
    if (!response.ok) return null
    const results = (await response.json()) as { lat: string; lon: string }[]
    if (!results[0]) return null
    return { lat: Number(results[0].lat), lng: Number(results[0].lon) }
  } catch {
    return null
  }
}

export const mapsLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
