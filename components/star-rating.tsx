"use client"

import { useState } from "react"
import { Star } from "lucide-react"

/** Tap-friendly 1–5 star picker that submits with its form. */
export default function StarRating({ name = "rating", initial = 0, label = "Bedøm besøget" }: { name?: string; initial?: number; label?: string }) {
  const [value, setValue] = useState(initial)
  const [hover, setHover] = useState(0)
  const words = ["", "Dårligt", "Under middel", "OK", "Godt", "Fremragende"]
  return (
    <div className="stars" role="radiogroup" aria-label={label}>
      <input type="hidden" name={name} value={value || ""} />
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} stjerne${n === 1 ? "" : "r"}`} className={(hover || value) >= n ? "is-on" : ""} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setValue(n)}>
          <Star className="size-8" />
        </button>
      ))}
      <span className="stars-word">{words[hover || value] ?? ""}</span>
    </div>
  )
}
