import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import AdminRecordTable from "@/components/admin-record-table"

export const dynamic = "force-dynamic"

const leadStatuses = [
  { value: "new", label: "Ny" },
  { value: "contacted", label: "Kontaktet" },
  { value: "qualified", label: "Kvalificeret" },
  { value: "quoted", label: "Tilbud sendt" },
  { value: "won", label: "Vundet" },
  { value: "lost", label: "Tabt" },
]
const quoteStatuses = [
  { value: "draft", label: "Kladde" },
  { value: "sent", label: "Sendt" },
  { value: "accepted", label: "Accepteret" },
  { value: "declined", label: "Afvist" },
  { value: "expired", label: "Udløbet" },
]
const jobStatuses = [
  { value: "scheduled", label: "Planlagt" },
  { value: "in_progress", label: "I gang" },
  { value: "completed", label: "Udført" },
  { value: "cancelled", label: "Aflyst" },
]

const content = {
  kunder: {
    title: "Kunder",
    intro: "Kunderegister med kontaktoplysninger.",
    table: "customers",
    fields: [{ key: "name", label: "Navn" }, { key: "company", label: "Firma" }, { key: "email", label: "Email" }, { key: "phone", label: "Telefon" }, { key: "address", label: "Adresse" }, { key: "created_at", label: "Oprettet" }],
  },
  foresporgsler: {
    title: "Forespørgsler",
    intro: "Beskeder fra kontaktformularerne på hjemmesiden.",
    table: "contact_requests",
    fields: [{ key: "name", label: "Navn" }, { key: "email", label: "Email" }, { key: "phone", label: "Telefon" }, { key: "message", label: "Besked" }, { key: "created_at", label: "Modtaget" }],
    deleteTable: "contact_requests",
  },
  leads: {
    title: "Leads",
    intro: "Potentielle kunder fra første henvendelse til afsluttet salg.",
    table: "leads",
    fields: [{ key: "name", label: "Navn" }, { key: "email", label: "Email" }, { key: "phone", label: "Telefon" }, { key: "message", label: "Besked" }, { key: "created_at", label: "Oprettet" }],
    statusTable: "leads",
    statusOptions: leadStatuses,
    deleteTable: "leads",
  },
  opgaver: {
    title: "Opgaver",
    intro: "Planlagte og igangværende rengøringsopgaver.",
    table: "jobs",
    fields: [{ key: "address", label: "Adresse" }, { key: "scheduled_start", label: "Start" }, { key: "scheduled_end", label: "Slut" }, { key: "notes", label: "Noter" }, { key: "created_at", label: "Oprettet" }],
    statusTable: "jobs",
    statusOptions: jobStatuses,
    deleteTable: "jobs",
  },
  tilbud: {
    title: "Tilbud",
    intro: "Priser, gyldighed og status på alle tilbud.",
    table: "quotes",
    fields: [{ key: "total", label: "Total" }, { key: "valid_until", label: "Gyldigt til" }, { key: "notes", label: "Noter" }, { key: "created_at", label: "Oprettet" }],
    statusTable: "quotes",
    statusOptions: quoteStatuses,
    deleteTable: "quotes",
  },
} as const

export default async function AdminWorkspace({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  const page = content[section as keyof typeof content]
  if (!page) notFound()

  const { org } = await requireRolePage(["admin"], `/admin/${section}`)

  const { data: records, count, error: loadError } = await createAdminClient()
    .from(page.table)
    .select("*", { count: "exact" })
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(100)
  const rows = (records ?? []) as Record<string, unknown>[]

  return (
    <main className="admin-shell">
      <div className="admin-workspace">
        <Link href="/admin" className="admin-back"><ArrowLeft className="size-4" /> Tilbage til overblik</Link>
        <p className="admin-eyebrow">Administration / {page.title}</p>
        <div className="admin-workspace-heading"><div><h1>{page.title}</h1><p>{page.intro}</p></div></div>
        <div className="admin-record-summary"><strong>{count ?? rows.length}</strong><span>registrerede poster</span></div>
        {loadError ? (
          <div className="admin-empty-state" role="alert"><strong>!</strong><span>Kunne ikke hente data</span><p>Databasen svarede: {loadError.message}. Se Systemstatus på oversigten.</p></div>
        ) : rows.length ? (
          <AdminRecordTable
            records={rows}
            fields={[...page.fields]}
            statusTable={"statusTable" in page ? page.statusTable : undefined}
            statusOptions={"statusOptions" in page ? [...page.statusOptions] : undefined}
            deleteTable={"deleteTable" in page ? page.deleteTable : undefined}
            exportName={section}
          />
        ) : (
          <div className="admin-empty-state"><strong>0</strong><span>registrerede poster</span><p>Der er endnu ingen poster i denne del af administrationen.</p></div>
        )}
      </div>
    </main>
  )
}
