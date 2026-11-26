import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadReportByToken } from "@/lib/backend/reports"
import { loadOrgById } from "@/lib/org"
import ReportView from "@/components/report-view"
import PhotoUpload from "@/components/photo-upload"
import { feedbackUploadTarget, registerFeedbackPhoto, submitReportFeedback } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Rengøringsrapport", robots: { index: false, follow: false } }

export default async function PublicReport({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ tak?: string; fejl?: string }> }) {
  const { token } = await params
  const sp = await searchParams
  const report = await loadReportByToken(token)
  if (!report || !report.customer_visible || report.status !== "submitted") notFound()
  const org = await loadOrgById(report.org_id)
  if (!org) notFound()
  const db = createAdminClient()
  const [{ data: job }, { data: entry }, { data: emp }] = await Promise.all([
    report.job_id ? db.from("jobs").select("title, scheduled_start, location:locations(name)").eq("org_id", org.id).eq("id", report.job_id).maybeSingle() : Promise.resolve({ data: null }),
    report.time_entry_id ? db.from("time_entries").select("check_in_at, check_out_at").eq("org_id", org.id).eq("id", report.time_entry_id).maybeSingle() : Promise.resolve({ data: null }),
    report.employee_id ? db.from("profiles").select("full_name").eq("id", report.employee_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const title = (job?.location as unknown as { name: string } | null)?.name ?? job?.title ?? org.name
  const logo = org.email_logo_url || org.logo_url

  return (
    <main className="rv-page" style={{ background: org.color_background, ["--primary" as string]: org.color_primary, ["--accent" as string]: org.color_accent }}>
      <div className="rv-brand">{logo ? <img src={logo} alt={org.name} /> : <strong>{org.name}</strong>}</div>
      <ReportView report={report} title={title} date={job?.scheduled_start ?? report.created_at} checkIn={entry?.check_in_at ?? null} checkOut={entry?.check_out_at ?? null} employee={emp?.full_name ?? null} />
      <section className="rv-feedback" id="feedback">
        <h2>Er der noget, vi kan gøre bedre?</h2>
        <p>Skriv til os, og tilføj gerne et billede, så vi kan se, hvad det drejer sig om.</p>
        {sp.fejl && <p className="field-err" role="alert">{sp.fejl === "2" ? "For mange beskeder. Prøv igen senere." : "Skriv en kort besked."}</p>}
        {sp.tak ? (
          <>
            <p className="field-ok" role="status">Tak! Vi har fået din besked.</p>
            {/^[0-9a-f-]{36}$/i.test(sp.tak) && <PhotoUpload requestTarget={feedbackUploadTarget.bind(null, token, sp.tak)} register={registerFeedbackPhoto.bind(null, token, sp.tak)} label="Tilføj billede" />}
          </>
        ) : (
          <form action={submitReportFeedback.bind(null, token)} className="rv-form">
            <input name="name" placeholder="Dit navn" maxLength={120} />
            <textarea name="message" rows={4} required placeholder="Fx: Der var ikke tømt skraldespand i mødelokalet" />
            <button type="submit" className="field-btn field-btn-primary">Send til {org.name}</button>
          </form>
        )}
      </section>
    </main>
  )
}
