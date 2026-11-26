"use client"

import { useActionState } from "react"
import { KeyRound } from "lucide-react"
import { createApiKey } from "./actions"

export default function KeyCreator({ sites }: { sites: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createApiKey, {} as { key?: string; error?: string })
  return (
    <form action={action} className="admin-form-grid">
      <label>Navn<input name="name" placeholder="Fx Kontaktformular på hjemmesiden" /></label>
      <label>Hjemmeside<select name="site_id" defaultValue={sites[0]?.id ?? ""}><option value="">Ingen bestemt</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <div className="admin-form-actions span-2"><button type="submit" className="admin-primary" disabled={pending}><KeyRound className="size-4" /> {pending ? "Opretter…" : "Opret API-nøgle"}</button></div>
      {state.error && <p className="admin-notice is-error span-2" role="alert">{state.error}</p>}
      {state.key && (
        <div className="admin-notice is-ok span-2" role="status">
          <p><strong>Kopiér nøglen nu</strong> – den vises kun denne ene gang. Gem den som en hemmelig miljøvariabel (fx <code>SM_API_KEY</code>) på hjemmesidens server – aldrig i browserkode.</p>
          <input readOnly value={state.key} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%", fontFamily: "monospace" }} />
        </div>
      )}
    </form>
  )
}
