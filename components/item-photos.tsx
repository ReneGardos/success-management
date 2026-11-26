"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { shrink } from "@/components/photo-upload"

type Thumb = { id: string; url: string; kind: string }

/** Small before/after camera buttons on one checklist item, with thumbnails. */
export default function ItemPhotos({ thumbs, requestTarget, register, disabled }: {
  thumbs: Thumb[]
  requestTarget: () => Promise<{ path: string; token: string }>
  register: (path: string, kind: string, caption: string) => Promise<{ ok: boolean; message?: string }>
  disabled?: boolean
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<"before" | "after">("before")
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState("")
  async function onFile(files: FileList | null) {
    if (!files?.length) return
    setBusy(kind)
    setErr("")
    try {
      const blob = await shrink(files[0])
      const t = await requestTarget()
      const { error } = await createClient().storage.from("org-photos").uploadToSignedUrl(t.path, t.token, blob, { contentType: "image/jpeg" })
      if (error) throw new Error(error.message)
      const r = await register(t.path, kind, "")
      if (!r.ok) throw new Error(r.message ?? "Ikke gemt")
      router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : "Fejl") } finally { setBusy(null); if (input.current) input.current.value = "" }
  }
  const pick = (k: "before" | "after") => { setKind(k); setTimeout(() => input.current?.click(), 0) }
  return (
    <div className="ip">
      {thumbs.map((t) => <a key={t.id} href={t.url} target="_blank" rel="noreferrer" className="ip-thumb">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={t.url} alt="" /><em>{t.kind === "after" ? "Efter" : "Før"}</em></a>)}
      {!disabled && (["before", "after"] as const).map((k) => (
        <button key={k} type="button" className="ip-btn" onClick={() => pick(k)} disabled={Boolean(busy)}>{busy === k ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} {k === "before" ? "Før" : "Efter"}</button>
      ))}
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files)} />
      {err && <small className="ip-err">{err}</small>}
    </div>
  )
}
