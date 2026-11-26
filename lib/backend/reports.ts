import { randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"

export type ReportItem = { id: string; task_id: string | null; label: string; area: string | null; done: boolean; note: string | null; position: number }
export type Product = { id: string; name: string; unit: string }
export type ReportProduct = { product_id: string; status: "ok" | "low" | "missing"; qty_taken: number }
export type Photo = { id: string; kind: string; caption: string | null; path: string; url: string | null; created_at: string; uploaded_by: string | null; item_id: string | null }
export type Report = {
  id: string
  org_id: string
  job_id: string | null
  location_id: string | null
  employee_id: string | null
  time_entry_id: string | null
  status: "draft" | "submitted"
  note: string | null
  customer_visible: boolean
  public_token: string
  submitted_at: string | null
  created_at: string
  customer_rating: number | null
  customer_comment: string | null
  rated_at: string | null
  signature_path: string | null
  signed_name: string | null
  signed_at: string | null
  signatureUrl?: string | null
  items: ReportItem[]
  products: ReportProduct[]
  photos: Photo[]
}

export const BUCKET = "org-photos"
export const productStatusLabels = { ok: "Nok", low: "Snart tom", missing: "Mangler" } as const
export const photoKindLabels: Record<string, string> = { issue: "Problem", unusual: "Ud over det sædvanlige", before: "Før", after: "Efter", customer: "Fra kunden", chat: "Chat", signature: "Underskrift" }

/** First line of a quote line description, used as a checklist label. */
const taskLabel = (description: string) => description.split("\n")[0].replace(/\s*\([^)]*\)\s*$/, "").trim()

/** Suggests checklist tasks for a location from its latest accepted quote (fixed lines). */
export async function tasksFromQuote(orgId: string, locationId: string) {
  const db = createAdminClient()
  const { data: loc } = await db.from("locations").select("id, customer_id").eq("org_id", orgId).eq("id", locationId).maybeSingle()
  if (!loc) return []
  let query = db.from("quotes").select("id, billing").eq("org_id", orgId).eq("status", "accepted").order("accepted_at", { ascending: false }).limit(1)
  query = loc.customer_id ? query.or(`location_id.eq.${locationId},customer_id.eq.${loc.customer_id}`) : query.eq("location_id", locationId)
  const { data: quotes } = await query
  const quote = quotes?.[0]
  if (!quote) return []
  const { data: lines } = await db.from("quote_line_items").select("id, description, recurring, unit_price").eq("org_id", orgId).eq("quote_id", quote.id).order("position")
  return (lines ?? [])
    .filter((l) => Number(l.unit_price) >= 0 && (l.recurring ?? quote.billing !== "one_time"))
    .map((l) => ({ label: taskLabel(String(l.description)), quote_line_id: String(l.id) }))
    .filter((t) => t.label && !/^rabat/i.test(t.label))
}

/** Finds or creates the employee's report for a shift, with the location's checklist. */
export async function ensureReport(orgId: string, jobId: string, employeeId: string) {
  const db = createAdminClient()
  const { data: existing } = await db.from("cleaning_reports").select("id").eq("org_id", orgId).eq("job_id", jobId).eq("employee_id", employeeId).maybeSingle()
  if (existing) return String(existing.id)
  const { data: job } = await db.from("jobs").select("id, location_id").eq("org_id", orgId).eq("id", jobId).maybeSingle()
  if (!job) throw new Error("Vagten findes ikke.")
  const { data: entry } = await db.from("time_entries").select("id").eq("org_id", orgId).eq("job_id", jobId).eq("employee_id", employeeId).order("check_in_at", { ascending: false }).limit(1).maybeSingle()
  const { data: report, error } = await db
    .from("cleaning_reports")
    .insert({ org_id: orgId, job_id: jobId, location_id: job.location_id, employee_id: employeeId, time_entry_id: entry?.id ?? null })
    .select("id")
    .single()
  if (error || !report) {
    // Created concurrently (unique job+employee): use that one.
    const { data: again } = await db.from("cleaning_reports").select("id").eq("org_id", orgId).eq("job_id", jobId).eq("employee_id", employeeId).maybeSingle()
    if (again) return String(again.id)
    throw new Error(error?.message ?? "Rapporten blev ikke oprettet.")
  }
  let tasks: { label: string; area: string | null; id: string | null }[] = []
  if (job.location_id) {
    const { data: lt } = await db.from("location_tasks").select("id, label, area").eq("org_id", orgId).eq("location_id", job.location_id).eq("active", true).order("position")
    tasks = (lt ?? []).map((t) => ({ id: String(t.id), label: t.label, area: t.area }))
    if (!tasks.length) tasks = (await tasksFromQuote(orgId, job.location_id)).map((t) => ({ id: null, label: t.label, area: null }))
  }
  if (!tasks.length) tasks = ["Støvsugning og gulvvask", "Aftørring af borde og kontaktflader", "Køkken", "Toiletter", "Tømning af affald"].map((label) => ({ id: null, label, area: null }))
  await db.from("cleaning_report_items").insert(tasks.map((t, i) => ({ org_id: orgId, report_id: report.id, task_id: t.id, label: t.label, area: t.area, position: i })))
  return String(report.id)
}

export async function signedUrls(paths: string[]) {
  if (!paths.length) return new Map<string, string>()
  const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrls(paths, 60 * 60)
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]))
}

export async function loadReport(orgId: string, id: string): Promise<Report | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const db = createAdminClient()
  const { data } = await db.from("cleaning_reports").select("*").eq("org_id", orgId).eq("id", id).maybeSingle()
  if (!data) return null
  return withDetails(data as Report)
}

export async function loadReportByToken(token: string) {
  if (!/^[a-f0-9]{20,64}$/.test(token)) return null
  const { data } = await createAdminClient().from("cleaning_reports").select("*").eq("public_token", token).maybeSingle()
  return data ? withDetails(data as Report) : null
}

async function withDetails(r: Report): Promise<Report> {
  const db = createAdminClient()
  const [{ data: items }, { data: products }, { data: photos }] = await Promise.all([
    db.from("cleaning_report_items").select("id, task_id, label, area, done, note, position").eq("org_id", r.org_id).eq("report_id", r.id).order("position"),
    db.from("report_products").select("product_id, status, qty_taken").eq("org_id", r.org_id).eq("report_id", r.id),
    db.from("photos").select("id, kind, caption, path, created_at, uploaded_by, item_id").eq("org_id", r.org_id).eq("report_id", r.id).order("created_at"),
  ])
  const urls = await signedUrls([...(photos ?? []).map((p) => String(p.path)), ...(r.signature_path ? [r.signature_path] : [])])
  return {
    ...r,
    signatureUrl: r.signature_path ? urls.get(r.signature_path) ?? null : null,
    items: (items ?? []) as ReportItem[],
    products: (products ?? []).map((p) => ({ ...p, qty_taken: Number(p.qty_taken) })) as ReportProduct[],
    photos: (photos ?? []).map((p) => ({ ...p, url: urls.get(String(p.path)) ?? null })) as Photo[],
  }
}

export async function loadProducts(orgId: string) {
  const { data } = await createAdminClient().from("products").select("id, name, unit").eq("org_id", orgId).eq("active", true).order("position").order("name")
  return (data ?? []) as Product[]
}

/** A signed upload URL so phones upload photos straight to storage (no size limit on the app server). */
export async function photoUploadTarget(orgId: string, folder: string, contentType: string) {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg"
  const path = `${orgId}/${folder}/${randomUUID()}.${ext}`
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw new Error(error?.message ?? "Upload kunne ikke startes.")
  return { path, token: data.token }
}

/** Only accept paths that were issued for this organization and folder. */
export const pathAllowed = (orgId: string, folder: string, path: string) => new RegExp(`^${orgId}/${folder}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(path)
