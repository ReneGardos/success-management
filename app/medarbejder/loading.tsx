/** Instant skeleton while the page data loads. */
export default function Loading() {
  return (
    <div className="sk" aria-busy="true" aria-label="Indlæser">
      <i style={{ height: 170, borderRadius: 22 }} />
      <i style={{ height: 86 }} />
      <i style={{ height: 64 }} />
      <i style={{ height: 220 }} />
    </div>
  )
}
