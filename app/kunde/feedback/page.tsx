import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/admin"
import { customerPortal } from "@/lib/portal"
import PhotoUpload from "@/components/photo-upload"
import { customerUploadTarget, registerCustomerPhoto, submitCustomerFeedback } from "../actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Feedback" }

export default async function CustomerFeedback({ searchParams }: { searchParams: Promise<{ tak?: string; fejl?: string }> }) {
  const p = await customerPortal("/kunde/feedback")
  const sp = await searchParams
  const { data: history } = await createAdminClient().from("customer_feedback").select("id, message, status, created_at, handled_at, location:locations(name)").eq("org_id", p.org.id).in("customer_id", p.ids).order("created_at", { ascending: false }).limit(30)
  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Er der noget, vi skal forbedre?</h1><p>Skriv til os og vedhæft gerne et billede. Beskeden går direkte til kontoret.</p></header>
      <div className="pt-pairs">
        <section className="pt-card">
          {sp.fejl && <p className="field-err" role="alert">Skriv en kort besked.</p>}
          {sp.tak ? (
            <>
              <p className="field-ok" role="status">Tak! Vi har fået din besked. Tilføj gerne et billede.</p>
              {/^[0-9a-f-]{36}$/i.test(sp.tak) && <PhotoUpload requestTarget={customerUploadTarget.bind(null, sp.tak)} register={registerCustomerPhoto.bind(null, sp.tak)} label="Tilføj billede" />}
              <p><Link href="/kunde/feedback" className="pt-link">Skriv en ny besked</Link></p>
            </>
          ) : (
            <form action={submitCustomerFeedback} className="rv-form">
              <fieldset disabled={Boolean(p.preview)}>
                {p.locations.length > 1 && <select name="location_id" defaultValue=""><option value="">Vælg sted</option>{p.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
                {p.locations.length === 1 && <input type="hidden" name="location_id" value={p.locations[0].id} />}
                <textarea name="message" rows={5} required placeholder="Beskriv hvad der skal forbedres" />
                <button type="submit" className="field-btn field-btn-primary">Send</button>
              </fieldset>
            </form>
          )}
        </section>
        <section className="pt-card">
          <h2>Tidligere beskeder</h2>
          <ul className="pt-mini">
            {(history ?? []).map((f) => (
              <li key={f.id}>
                <span><strong>{f.message.length > 80 ? `${f.message.slice(0, 80)}…` : f.message}</strong><small>{new Date(f.created_at).toLocaleDateString("da-DK")}{(f.location as unknown as { name: string } | null)?.name ? ` · ${(f.location as unknown as { name: string }).name}` : ""}</small></span>
                <b><span className={`pt-pill ${f.status === "handled" ? "s-done" : "s-open"}`}>{f.status === "handled" ? "Løst" : "Modtaget"}</span></b>
              </li>
            ))}
            {!history?.length && <li className="pt-empty">Ingen beskeder endnu.</li>}
          </ul>
        </section>
      </div>
    </main>
  )
}
