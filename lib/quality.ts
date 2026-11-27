export const scoreClass = (s: number | null) => (s == null ? "" : s >= 90 ? "is-good" : s >= 75 ? "is-mid" : "is-low")
