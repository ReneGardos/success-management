import Link from "next/link"
import { Clock, KeyRound, MapPin, Phone } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
const privateMeta = { title: "Medarbejder", robots: { index: false, follow: false } }
import { loadShifts, shiftAddress, shiftName, type Shift } from "@/lib/backend/shifts"
import { entryDurationMs, entryPlace, loadTimeEntries } from "@/lib/backend/time-entries"
import { mapsLink } from "@/lib/geo"
import { addDays, copenhagenToIso, dayKey, formatDay, formatDuration, formatTime, mondayOf, todayLocal } from "@/lib/time"
import { CheckInButton, CheckOutForm, ClaimButton } from "@/components/employee-shift-actions"
import { getViewAs } from "@/lib/view-as"
import ViewAsBanner from "@/components/view-as-banner"

export const metadata = privateMeta
export const dynamic = "force-dynamic"

const statusLabels: Record<string, string> = { scheduled: "Planlagt", in_progress: "I gang", completed: "Udført", cancelled: "Aflyst" }
const tabs = [["vagter", "Mine vagter"], ["ledige", "Ledige vagter"], ["timer", "Mine timer"]] as const

function ShiftInfo({ shift }: { shift: Shift }) {
  const address = shiftAddress(shift)
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{shiftName(shift)}</h3>
          {shift.location?.name && shift.title && <p className="text-sm text-muted-foreground">{shift.location.name}</p>}
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">{statusLabels[shift.status] ?? shift.status}</span>
      </div>
      {shift.scheduled_start && <p className="flex items-center gap-2 text-sm"><Clock className="size-4" aria-hidden="true" /> {formatTime(shift.scheduled_start)}{shift.scheduled_end ? `–${formatTime(shift.scheduled_end)}` : ""}</p>}
      {address && <a className="flex items-center gap-2 text-sm font-medium text-primary underline" href={mapsLink(address)} target="_blank" rel="noreferrer"><MapPin className="size-4" aria-hidden="true" /> {address}</a>}
      {shift.location?.access_notes && <p className="flex items-start gap-2 whitespace-pre-wrap rounded-lg bg-secondary/60 p-3 text-sm"><KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {shift.location.access_notes}</p>}
      {shift.location?.contact_phone && <a className="flex items-center gap-2 text-sm" href={`tel:${shift.location.contact_phone.replace(/\s+/g, "")}`}><Phone className="size-4" aria-hidden="true" /> {shift.location.contact_name ?? "Kontakt"}: {shift.location.contact_phone}</a>}
      {shift.notes && <p className="whitespace-pre-wrap rounded-lg border border-border p-3 text-sm">{shift.notes}</p>}
    </>
  )
}

export default async function EmployeePage({ searchParams }: { searchParams: Promise<{ vis?: string; rapport?: string; mangler?: string }> }) {
  const { user: me, fullName: myName, org, ctx } = await requireRolePage(["employee", "admin"], "/medarbejder")
  // Admin preview: show the app as the chosen employee (read-only).
  const viewAs = await getViewAs(ctx)
  const preview = viewAs?.type === "employee" ? viewAs : null
  const user = preview ? { id: preview.id, email: null as string | null } : me
  const fullName = preview ? preview.name : myName
  const { vis = "vagter", rapport, mangler } = await searchParams
  const db = createAdminClient()
  const today = todayLocal()
  const now = copenhagenToIso(today, "00:00")!
  const in60 = copenhagenToIso(addDays(today, 60), "00:00")!

  const { data: openEntry } = await db.from("time_entries").select("id, job_id, check_in_at").eq("org_id", org.id).eq("employee_id", user.id).is("check_out_at", null).maybeSingle()
  const { data: assignments } = await db.from("job_assignments").select("job_id").eq("org_id", org.id).eq("employee_id", user.id)
  const myIds = (assignments ?? []).map((a) => String(a.job_id))

  const mine = vis === "vagter" ? (await loadShifts(org.id, now, in60, { onlyIds: myIds })).shifts.filter((s) => s.status !== "cancelled") : []
  const open = vis === "ledige" ? (await loadShifts(org.id, new Date().toISOString(), in60, { onlyOpen: true })).shifts.filter((s) => !s.employeeIds.includes(user.id) && s.employeeIds.length < s.max_staff) : []
  const monthStart = `${today.slice(0, 7)}-01`
  const weekStart = mondayOf(today)
  const hours = vis === "timer" ? (await loadTimeEntries(org.id, copenhagenToIso(addDays(monthStart, -31), "00:00")!, copenhagenToIso(addDays(today, 1), "00:00")!, user.id)).entries : []
  const weekMs = hours.filter((e) => dayKey(e.check_in_at) >= weekStart).reduce((s, e) => s + entryDurationMs(e), 0)
  const monthMs = hours.filter((e) => dayKey(e.check_in_at) >= monthStart).reduce((s, e) => s + entryDurationMs(e), 0)

  const groups = new Map<string, Shift[]>()
  for (const s of mine) if (s.scheduled_start) groups.set(dayKey(s.scheduled_start), [...(groups.get(dayKey(s.scheduled_start)) ?? []), s])
  const openGroups = new Map<string, Shift[]>()
  for (const s of open) if (s.scheduled_start) openGroups.set(dayKey(s.scheduled_start), [...(openGroups.get(dayKey(s.scheduled_start)) ?? []), s])
  const todayCount = groups.get(today)?.length ?? 0
  const dayTitle = (day: string, s: Shift) => (day === today ? "I dag" : day === addDays(today, 1) ? "I morgen" : formatDay(s.scheduled_start!))

  return (
    <>
    {preview && <ViewAsBanner viewAs={preview} />}
    <main className={`min-h-screen bg-secondary/30 px-4 pb-16 pt-10${preview ? " viewas-readonly" : ""}`} style={{ ["--primary" as string]: org.color_primary, ["--ring" as string]: org.color_accent }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary">{org.name} · Medarbejderportal</p>
            <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Hej {(fullName || user.email || "").split(" ")[0]}</h1>
            {vis === "vagter" && <p className="mt-1 text-muted-foreground">{todayCount ? `Du har ${todayCount} vagt${todayCount === 1 ? "" : "er"} i dag.` : "Ingen vagter i dag."}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            {ctx.memberships.length > 1 && <Link href="/vaelg-virksomhed?skift=1" className="text-sm underline">Skift virksomhed</Link>}
            <form action="/auth/sign-out" method="post"><button type="submit" className="rounded-md border border-border bg-background px-3 py-2 text-sm">Log ud</button></form>
          </div>
        </div>

        {rapport && <p className="rounded-lg border border-primary bg-background p-3 text-sm" role="status">Tak! Rapporten er sendt.</p>}
        {mangler && <p className="rounded-lg border border-primary bg-background p-3 text-sm" role="status">Beskeden er sendt til kontoret.</p>}
        <Link href="/medarbejder/mangler" className="rounded-xl border-2 border-dashed border-border bg-background px-4 py-4 text-center text-base font-semibold">Mangler du noget? Giv kontoret besked</Link>

        {openEntry && (
          <section className="flex flex-col gap-3 rounded-xl border-2 border-primary bg-background p-5" aria-label="Du er tjekket ind">
            <p className="font-semibold">Du er tjekket ind siden {formatTime(openEntry.check_in_at)} · {formatDuration(Date.now() - new Date(openEntry.check_in_at).getTime())}</p>
            {openEntry.job_id && <Link href={`/medarbejder/rapport/${openEntry.job_id}`} className="rounded-lg border border-primary px-4 py-3 text-center font-semibold text-primary">Udfyld rapport før du tjekker ud</Link>}
            {!preview && <CheckOutForm entryId={String(openEntry.id)} />}
          </section>
        )}

        <nav className="grid grid-cols-3 gap-2" aria-label="Menu">
          {tabs.map(([value, label]) => (
            <Link key={value} href={`?vis=${value}`} aria-current={vis === value ? "page" : undefined} className={`rounded-lg border px-2 py-3 text-center text-sm font-medium ${vis === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>{label}</Link>
          ))}
        </nav>

        {vis === "vagter" && (mine.length ? [...groups.entries()].map(([day, list]) => (
          <section key={day} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{dayTitle(day, list[0])}</h2>
            {list.map((s) => {
              const isCurrent = openEntry?.job_id === s.id
              const canCheckIn = !openEntry && s.status !== "completed" && day <= addDays(today, 0) && day >= addDays(today, -1)
              return (
                <article key={s.id} className={`flex flex-col gap-3 rounded-xl border bg-background p-5 ${isCurrent ? "border-primary" : ""} ${s.status === "completed" ? "opacity-70" : ""}`}>
                  <ShiftInfo shift={s} />
                  {canCheckIn && !preview && <CheckInButton jobId={s.id} />}
                  {(isCurrent || (day <= today && day >= addDays(today, -2))) && <Link href={`/medarbejder/rapport/${s.id}${preview ? "?se=1" : ""}`} className="rounded-lg bg-primary px-4 py-4 text-center text-base font-semibold text-primary-foreground">Udfyld rengøringsrapport</Link>}
                </article>
              )
            })}
          </section>
        )) : <div className="rounded-xl border bg-background p-8 text-center text-muted-foreground">Du har ingen vagter de næste 60 dage. <Link className="text-primary underline" href="?vis=ledige">Se ledige vagter</Link>.</div>)}

        {vis === "ledige" && (open.length ? [...openGroups.entries()].map(([day, list]) => (
          <section key={day} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{dayTitle(day, list[0])}</h2>
            {list.map((s) => (
              <article key={s.id} className="flex flex-col gap-3 rounded-xl border bg-background p-5">
                <ShiftInfo shift={s} />
                <p className="text-sm text-muted-foreground">{s.max_staff - s.employeeIds.length} ledig{s.max_staff - s.employeeIds.length === 1 ? "" : "e"} plads{s.max_staff - s.employeeIds.length === 1 ? "" : "er"}</p>
                {!preview && <ClaimButton jobId={s.id} />}
              </article>
            ))}
          </section>
        )) : <div className="rounded-xl border bg-background p-8 text-center text-muted-foreground">Der er ingen ledige vagter lige nu.</div>)}

        {vis === "timer" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-background p-5"><p className="text-2xl font-semibold">{formatDuration(weekMs)}</p><p className="text-sm text-muted-foreground">Denne uge</p></div>
              <div className="rounded-xl border bg-background p-5"><p className="text-2xl font-semibold">{formatDuration(monthMs)}</p><p className="text-sm text-muted-foreground">Denne måned</p></div>
            </div>
            <section className="flex flex-col gap-2">
              {hours.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-4 text-sm">
                  <div><p className="font-medium">{entryPlace(e)}</p><p className="text-muted-foreground">{new Date(e.check_in_at).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "short", day: "numeric", month: "short" })} · {formatTime(e.check_in_at)}–{e.check_out_at ? formatTime(e.check_out_at) : "nu"}</p></div>
                  <strong>{formatDuration(entryDurationMs(e))}</strong>
                </div>
              ))}
              {!hours.length && <div className="rounded-xl border bg-background p-8 text-center text-muted-foreground">Ingen registrerede timer endnu.</div>}
            </section>
          </>
        )}
      </div>
    </main>
    </>
  )
}
