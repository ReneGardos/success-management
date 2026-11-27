"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { FileUp, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

/** Uploads a PDF/image/Word file straight to private storage, then registers it with the given fields. */
export default function DocUpload({ requestTarget, register, label = "Vælg fil", fields }: {
  requestTarget: (name: string, type: string) => Promise<{ path: string; token: string }>
  register: (path: string, fileName: string, form: Record<string, string>) => Promise<{ ok: boolean; message?: string }>
  label?: string
  fields?: React.ReactNode
}) {
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  async function onFile(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    if (f.size > 15 * 1024 * 1024) return setMsg("Filen er for stor (maks 15 MB).")
    setBusy(true); setMsg("")
    try {
      const t = await requestTarget(f.name, f.type || "application/pdf")
      const { error } = await createClient().storage.from("org-docs").uploadToSignedUrl(t.path, t.token, f, { contentType: f.type || "application/pdf" })
      if (error) throw new Error(error.message)
      const data = Object.fromEntries(new FormData(form.current!).entries()) as Record<string, string>
      const r = await register(t.path, f.name, data)
      if (!r.ok) throw new Error(r.message ?? "Ikke gemt")
      form.current?.reset(); setMsg("Gemt."); router.refresh()
    } catch (e) { setMsg(e instanceof Error ? e.message : "Upload fejlede") } finally { setBusy(false); if (input.current) input.current.value = "" }
  }
  return (
    <form ref={form} className="doc-up" onSubmit={(e) => { e.preventDefault(); input.current?.click() }}>
      {fields}
      <button type="submit" className="doc-up-btn" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} {busy ? "Uploader…" : label}</button>
      <input ref={input} type="file" hidden accept="application/pdf,image/*,.doc,.docx" onChange={(e) => onFile(e.target.files)} />
      {msg && <p className="doc-up-msg" role="status">{msg}</p>}
    </form>
  )
}
