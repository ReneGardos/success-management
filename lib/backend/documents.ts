import { randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { kr, splitTotals, type Quote } from "@/lib/backend/quotes"
import type { Org } from "@/lib/org"

export const DOC_BUCKET = "org-docs"
export const docKinds = { contract: "Kontrakt", employee: "Medarbejderdokument", policy: "Politik" } as const
export const docStatus: Record<string, string> = { draft: "Kladde", sent: "Afventer underskrift", signed: "Underskrevet", declined: "Afvist", archived: "Arkiveret" }

const extOf = (type: string, name: string) => (/\.([a-z0-9]{2,5})$/i.exec(name)?.[1] ?? (type === "application/pdf" ? "pdf" : "bin")).toLowerCase()

export async function docUploadTarget(orgId: string, folder: string, contentType: string, fileName: string) {
  const path = `${orgId}/${folder}/${randomUUID()}.${extOf(contentType, fileName)}`
  const { data, error } = await createAdminClient().storage.from(DOC_BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw new Error(error?.message ?? "Upload kunne ikke startes.")
  return { path, token: data.token }
}

export const docPathAllowed = (orgId: string, folder: string, path: string) => path.startsWith(`${orgId}/${folder}/`) && !path.includes("..")

export async function docUrl(path: string | null, download?: string) {
  if (!path) return null
  const { data } = await createAdminClient().storage.from(DOC_BUCKET).createSignedUrl(path, 60 * 30, download ? { download } : undefined)
  return data?.signedUrl ?? null
}

export async function loadDocByToken(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null
  const { data } = await createAdminClient().from("org_documents").select("*").eq("public_token", token).maybeSingle()
  return data
}

/** Plain-language service agreement from an accepted quote. Editable before sending. */
export function contractTemplate(org: Org, c: { name: string; company: string | null; address: string | null; cvr?: string | null }, q: Quote | null) {
  const split = q ? splitTotals(q.lines, q.vat_rate, q.billing) : null
  const lines = split ? split.monthlyLines.map((l) => `- ${l.description.split("\n")[0]}${l.quantity !== 1 ? ` (${l.quantity} ${l.unit})` : ""}`).join("\n") : "- (beskriv opgaverne)"
  const price = split ? (split.monthly.subtotal ? `${kr(split.monthly.subtotal)} ekskl. moms pr. måned` : `${kr(split.oneOff.subtotal)} ekskl. moms`) : "(pris)"
  return `# Serviceaftale

**Mellem** ${org.legal_name || org.name}${org.cvr ? `, CVR ${org.cvr}` : ""}, ${org.address ?? ""} (leverandøren)
**og** ${c.company || c.name}${c.cvr ? `, CVR ${c.cvr}` : ""}${c.address ? `, ${c.address}` : ""} (kunden)

## 1. Ydelser
Leverandøren udfører følgende fast aftalte opgaver${q ? ` jf. tilbud nr. ${q.quote_number}` : ""}:
${lines}

Ekstra opgaver aftales særskilt og faktureres efter gældende prisliste.

## 2. Pris og betaling
Prisen er ${price}. Der faktureres månedsvis forud med ${org.payment_terms_days ?? 8} dages betalingsfrist. Priserne kan reguleres én gang årligt med varsel på 1 måned.

## 3. Udførelse og kvalitet
Arbejdet udføres af faste, oplærte medarbejdere. Efter hvert besøg kan kunden se en rengøringsrapport i kundeportalen. Leverandøren foretager løbende kvalitetskontroller. Fejl og mangler meldes via kundeportalen og udbedres hurtigst muligt og senest ved næste besøg.

## 4. Nøgler og adgang
Kunden stiller nøgle/adgang til rådighed. Leverandøren opbevarer nøgler forsvarligt og registrerer udlevering.

## 5. Forsikring og ansvar
Leverandøren har erhvervs- og produktansvarsforsikring. Leverandørens ansvar er begrænset til direkte tab og maksimalt et beløb svarende til 3 måneders betaling.

## 6. Ændring af besøg
Besøg kan flyttes eller springes over via kundeportalen med mindst 24 timers varsel. Aflyses senere, faktureres besøget.

## 7. Varighed og opsigelse
Aftalen løber fra underskrift og kan opsiges af begge parter med 1 måneds varsel til udgangen af en måned.

## 8. Persondata
Leverandøren behandler kun personoplysninger, der er nødvendige for at levere ydelsen, og i overensstemmelse med gældende lovgivning.
`
}
