"use client"

import { useMemo, useState, useTransition } from "react"
import { Download, Mail, Phone, Trash2 } from "lucide-react"
import { deleteRecord, updateStatus } from "@/app/admin/actions"

type RecordRow = Record<string, unknown>
type Field = { key: string; label: string }

type Props = {
  records: RecordRow[]
  fields: Field[]
  statusTable?: "leads" | "quotes" | "jobs"
  statusOptions?: { value: string; label: string }[]
  deleteTable?: "contact_requests" | "leads" | "quotes" | "jobs"
  exportName?: string
}

const dateFormatter = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" })

function formatValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "-"
  if (key.endsWith("_at") || key.startsWith("scheduled") || key === "valid_until") {
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? String(value) : dateFormatter.format(date)
  }
  if (key === "total") return `${Number(value).toLocaleString("da-DK")} kr.`
  return String(value)
}

function toCsv(rows: RecordRow[], fields: Field[]) {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`
  const header = fields.map((f) => escape(f.label)).join(";")
  const lines = rows.map((row) => fields.map((f) => escape(formatValue(f.key, row[f.key]) === "-" ? "" : formatValue(f.key, row[f.key]))).join(";"))
  // BOM so Excel opens æ, ø and å correctly
  return "\uFEFF" + [header, ...lines].join("\r\n")
}

export default function AdminRecordTable({ records, fields, statusTable, statusOptions, deleteTable, exportName = "eksport" }: Props) {
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState(records)
  const [message, setMessage] = useState("")
  const [pending, startTransition] = useTransition()

  const filtered = useMemo(
    () => rows.filter((record) => Object.values(record).some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()))),
    [rows, query],
  )

  function changeStatus(id: string, status: string) {
    if (!statusTable) return
    startTransition(async () => {
      const result = await updateStatus(statusTable, id, status)
      if (result.ok) {
        setRows((current) => current.map((row) => (row.id === id ? { ...row, status } : row)))
        setMessage("Status opdateret")
      } else setMessage(result.message ?? "Kunne ikke opdatere status")
    })
  }

  function remove(id: string) {
    if (!deleteTable || !window.confirm("Vil du slette denne post permanent?")) return
    startTransition(async () => {
      const result = await deleteRecord(deleteTable, id)
      if (result.ok) {
        setRows((current) => current.filter((row) => row.id !== id))
        setMessage("Posten er slettet")
      } else setMessage(result.message ?? "Kunne ikke slette posten")
    })
  }

  function exportCsv() {
    const exportFields = statusTable ? [...fields, { key: "status", label: "Status" }] : fields
    const blob = new Blob([toCsv(filtered, exportFields)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="admin-record-table-wrap">
      <div className="admin-record-toolbar">
        <label htmlFor="admin-record-search">Søg i poster</label>
        <div className="flex flex-wrap items-center gap-2">
          <input id="admin-record-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Navn, email eller status" />
          <button type="button" onClick={exportCsv} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted">
            <Download className="size-4" aria-hidden="true" /> Eksportér til Excel
          </button>
        </div>
      </div>
      {message && <p className="admin-record-message" role="status">{message}</p>}
      {filtered.length ? (
        <div className="admin-record-list" aria-busy={pending}>
          {filtered.map((record, index) => {
            const id = String(record.id ?? index)
            return (
              <article className="admin-record" key={id}>
                {fields.filter(({ key }) => record[key] !== null && record[key] !== undefined && record[key] !== "").map(({ key, label }) => (
                  key === "message" || key === "notes" ? (
                    <details key={key} className="admin-record-long">
                      <summary><small>{label}</small><strong>{formatValue(key, record[key])}</strong></summary>
                      <p>{formatValue(key, record[key])}</p>
                    </details>
                  ) : (
                    <div key={key}>
                      <small>{label}</small>
                      <strong>{formatValue(key, record[key])}</strong>
                    </div>
                  )
                ))}
                {(statusTable || deleteTable || typeof record.email === "string" || typeof record.phone === "string") && (
                  <div className="flex flex-wrap items-center gap-2">
                    {typeof record.email === "string" && record.email && (
                      <a href={`mailto:${record.email}?subject=${encodeURIComponent("Vedr. din henvendelse")}`} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted">
                        <Mail className="size-4" aria-hidden="true" /> Svar
                      </a>
                    )}
                    {typeof record.phone === "string" && record.phone && (
                      <a href={`tel:${record.phone.replace(/\s+/g, "")}`} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted">
                        <Phone className="size-4" aria-hidden="true" /> Ring
                      </a>
                    )}
                    {statusTable && statusOptions && (
                      <label className="flex flex-col gap-1">
                        <small>Status</small>
                        <select
                          value={String(record.status ?? "")}
                          onChange={(event) => changeStatus(id, event.target.value)}
                          disabled={pending}
                          className="min-h-10 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                        >
                          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                    )}
                    {deleteTable && (
                      <button type="button" onClick={() => remove(id)} disabled={pending} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted">
                        <Trash2 className="size-4" aria-hidden="true" /> Slet
                      </button>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="admin-empty-state admin-empty-state-compact"><strong>0</strong><span>matchende poster</span><p>Prøv en anden søgning.</p></div>
      )}
    </div>
  )
}
