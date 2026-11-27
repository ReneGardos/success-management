import { notFound } from "next/navigation"
import { CheckCircle2, FileText } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { docUrl, loadDocByToken } from "@/lib/backend/documents"
import { signedUrls } from "@/lib/backend/reports"
import { loadOrgById } from "@/lib/org"
import { Markdown } from "@/lib/md"
import SignaturePad from "@/components/signature-pad"
import { PrintButton } from "@/components/quote-response"
import { docSignTarget, signDocument } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Dokument", robots: { index: false, follow: false } }

/** Public read-and-sign page (secret link). */
export default async function PublicDocument({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const d = await loadDocByToken(token)
  if (!d || d.status === "draft" || d.status === "archived") notFound()
  const org = await loadOrgById(d.org_id)
  if (!org) notFound()
  if (!d.viewed_at) await createAdminClient().from("org_documents").update({ viewed_at: new Date().toISOString() }).eq("id", d.id)
  const [fileUrl, sig] = await Promise.all([docUrl(d.file_path), d.signature_path ? signedUrls([d.signature_path]).then((m) => m.get(d.signature_path!) ?? null) : Promise.resolve(null)])
  const logo = org.logo_url || org.email_logo_url
  return (
    <main className="quote-page" style={{ background: org.color_background, ["--quote-primary" as string]: org.color_primary, ["--quote-accent" as string]: org.color_accent, ["--primary" as string]: org.color_primary }}>
      <div className="quote-toolbar"><PrintButton /></div>
      <article className="quote-doc doc-public">
        <header className="doc-head">{/* eslint-disable-next-line @next/next/no-img-element */}{logo ? <img src={logo} alt={org.name} /> : <strong>{org.name}</strong>}<span>{org.legal_name || org.name}{org.cvr ? ` · CVR ${org.cvr}` : ""}</span></header>
        {d.file_path ? (
          <div className="doc-file"><FileText className="size-8" /><div><h1>{d.title}</h1>{fileUrl && <a href={fileUrl} target="_blank" rel="noreferrer" className="pay-btn">Åbn {d.file_name ?? "dokumentet"}</a>}</div></div>
        ) : <Markdown text={d.body} />}
        {d.status === "signed" ? (
          <section className="doc-sign is-done">
            <p><CheckCircle2 className="size-5 inline" /> Underskrevet digitalt af <strong>{d.signed_name}</strong> den {new Date(d.signed_at!).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", dateStyle: "long", timeStyle: "short" })}.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {sig && <img src={sig} alt="Underskrift" />}
          </section>
        ) : d.needs_signature ? (
          <section className="doc-sign">
            <h2>Underskrift</h2>
            <p>Når du underskriver, bekræfter du at have læst og accepteret dokumentet. Vi gemmer dit navn, tidspunktet og din IP-adresse som dokumentation.</p>
            <SignaturePad requestTarget={docSignTarget.bind(null, token)} register={signDocument.bind(null, token)} />
          </section>
        ) : null}
      </article>
    </main>
  )
}
