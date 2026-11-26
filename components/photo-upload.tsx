"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type Target = { path: string; token: string }

/** Shrinks a photo in the browser (max 1600 px, JPEG) before upload, so it works on mobile data. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.82))
  } catch {
    return file
  }
}

/**
 * Camera/photo picker. `requestTarget` and `register` are server actions bound to the report or feedback,
 * so the server decides where a photo may go.
 */
export default function PhotoUpload({ requestTarget, register, kinds, label = "Tag eller vælg billede" }: {
  requestTarget: () => Promise<Target>
  register: (path: string, kind: string, caption: string) => Promise<{ ok: boolean; message?: string }>
  kinds?: { value: string; label: string }[]
  label?: string
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState(kinds?.[0]?.value ?? "customer")
  const [caption, setCaption] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setMessage("")
    try {
      const supabase = createClient()
      for (const file of Array.from(files).slice(0, 8)) {
        const blob = await shrink(file)
        const target = await requestTarget()
        const { error } = await supabase.storage.from("org-photos").uploadToSignedUrl(target.path, target.token, blob, { contentType: "image/jpeg" })
        if (error) throw new Error(error.message)
        const res = await register(target.path, kind, caption)
        if (!res.ok) throw new Error(res.message ?? "Billedet blev ikke gemt")
      }
      setCaption("")
      setMessage("Billedet er gemt.")
      router.refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload fejlede")
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="photo-up">
      {kinds && kinds.length > 1 && (
        <div className="photo-up-kinds" role="radiogroup" aria-label="Type">
          {kinds.map((k) => <button type="button" key={k.value} role="radio" aria-checked={kind === k.value} className={kind === k.value ? "is-on" : ""} onClick={() => setKind(k.value)}>{k.label}</button>)}
        </div>
      )}
      <input className="photo-up-caption" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Kort beskrivelse (valgfri)" maxLength={200} />
      <button type="button" className="photo-up-btn" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />} {busy ? "Uploader…" : label}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      {message && <p className="photo-up-msg" role="status">{message}</p>}
    </div>
  )
}
