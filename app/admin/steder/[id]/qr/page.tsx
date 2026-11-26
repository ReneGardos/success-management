import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, RefreshCw } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { appUrl } from "@/lib/org"
import { qrSvg } from "@/lib/qr"
import { PrintButton } from "@/components/quote-response"
import { renewQr } from "../../actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "QR-skilt" }

/** Printable A4 sign with the location's QR code for check-in. */
export default async function QrSign({ params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/steder")
  const { id } = await params
  const { data: loc } = await createAdminClient().from("locations").select("id, name, address, qr_token").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!loc?.qr_token) notFound()
  const url = `${appUrl()}/q/${loc.qr_token}`
  const logo = org.logo_url || org.email_logo_url
  return (
    <main className="admin-shell crm">
      <div className="qr-tools">
        <Link href={`/admin/steder/${loc.id}`} className="crm-btn"><ArrowLeft className="size-4" /> Tilbage</Link>
        <PrintButton />
        <form action={renewQr}><input type="hidden" name="id" value={loc.id} /><button type="submit" className="crm-btn" title="Gamle skilte holder op med at virke"><RefreshCw className="size-4" /> Ny kode</button></form>
      </div>
      <article className="qr-sheet" style={{ ["--qr" as string]: org.color_primary }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt={org.name} className="qr-logo" /> : <strong className="qr-org">{org.name}</strong>}
        <h1>Tjek ind her</h1>
        <p>Scan koden med telefonens kamera, når du starter rengøringen.</p>
        <div className="qr-code" dangerouslySetInnerHTML={{ __html: qrSvg(url, { color: org.color_primary, margin: 2 }) }} />
        <h2>{loc.name}</h2>
        <p className="qr-addr">{loc.address}</p>
        <small>{url.replace(/^https?:\/\//, "")}</small>
      </article>
    </main>
  )
}
