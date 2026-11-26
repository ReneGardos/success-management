"use client"

import { useState, useTransition } from "react"
import { Crosshair } from "lucide-react"
import { setLocationPosition } from "@/app/admin/steder/actions"

/** Button that saves the phone's current position as the location's check-in point. */
export default function UseMyPosition({ id }: { id: string }) {
  const [message, setMessage] = useState("")
  const [pending, startTransition] = useTransition()

  function run() {
    if (!navigator.geolocation) return setMessage("Telefonen kan ikke give en position.")
    setMessage("Finder position…")
    navigator.geolocation.getCurrentPosition(
      (pos) => startTransition(async () => {
        const result = await setLocationPosition(id, pos.coords.latitude, pos.coords.longitude)
        setMessage(result.ok ? `Position gemt (±${Math.round(pos.coords.accuracy)} m).` : "Kunne ikke gemme positionen.")
      }),
      () => setMessage("Giv adgang til placering i browseren og prøv igen."),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  return (
    <span className="admin-inline-form">
      <button type="button" onClick={run} disabled={pending}><Crosshair className="size-4" aria-hidden="true" /> Brug min position</button>
      {message && <small role="status">{message}</small>}
    </span>
  )
}
