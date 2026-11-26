"use server"

import { notifyAdmins, notifyCustomer, notifyUsers } from "@/lib/backend/notify"
import { revalidatePath } from "next/cache"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { distanceMeters } from "@/lib/geo"

type Position = { lat: number; lng: number; accuracy: number } | null

function refresh() {
  revalidatePath("/medarbejder")
  revalidatePath("/admin", "layout")
}

async function assertAssigned(orgId: string, jobId: string, userId: string) {
  // Everyone, admins included, checks in on shifts they are assigned to, in the active organization.
  const { data } = await createAdminClient().from("job_assignments").select("job_id").eq("org_id", orgId).eq("job_id", jobId).eq("employee_id", userId).maybeSingle()
  if (!data) throw new Error("Vagten er ikke din")
}

async function distanceToJob(orgId: string, jobId: string, pos: Position) {
  if (!pos) return null
  const { data } = await createAdminClient().from("jobs").select("location:locations(lat, lng)").eq("org_id", orgId).eq("id", jobId).maybeSingle()
  const loc = data?.location as unknown as { lat: number | null; lng: number | null } | null
  if (!loc || loc.lat === null || loc.lng === null) return null
  return distanceMeters(pos.lat, pos.lng, loc.lat, loc.lng)
}

/** Take an open shift. */
export async function claimShift(jobId: string) {
  const { user, org } = await requireRoleAction(["employee", "admin"])
  const db = createAdminClient()
  const { data: job } = await db.from("jobs").select("id, is_open, max_staff, status, scheduled_start").eq("org_id", org.id).eq("id", jobId).maybeSingle()
  if (!job || !job.is_open || job.status === "cancelled") return { ok: false, message: "Vagten er ikke ledig længere." }
  const { data: current } = await db.from("job_assignments").select("employee_id").eq("org_id", org.id).eq("job_id", jobId)
  if ((current ?? []).some((a) => a.employee_id === user.id)) return { ok: true, message: "Du er allerede på vagten." }
  if ((current ?? []).length >= (job.max_staff ?? 1)) {
    await db.from("jobs").update({ is_open: false }).eq("org_id", org.id).eq("id", jobId)
    return { ok: false, message: "Vagten blev lige taget af en anden." }
  }
  const { error } = await db.from("job_assignments").insert({ org_id: org.id, job_id: jobId, employee_id: user.id })
  if (error) return { ok: false, message: "Kunne ikke tage vagten. Prøv igen." }
  if ((current ?? []).length + 1 >= (job.max_staff ?? 1)) await db.from("jobs").update({ is_open: false }).eq("org_id", org.id).eq("id", jobId)
  const { data: me } = await db.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
  await notifyAdmins(org, { kind: "shift", title: "Ledig vagt taget", body: `${me?.full_name ?? "En medarbejder"} tog vagten ${job.scheduled_start ? new Date(job.scheduled_start).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "short", day: "numeric", month: "short" }) : ""}.`, href: `/admin/vagtplan?vagt=${jobId}` }, user.id)
  refresh()
  return { ok: true, message: "Vagten er din." }
}

export async function checkIn(jobId: string, pos: Position) {
  const { user, org } = await requireRoleAction(["employee", "admin"])
  try {
    await assertAssigned(org.id, jobId, user.id)
  } catch {
    return { ok: false, message: "Vagten er ikke din." }
  }
  const db = createAdminClient()
  const { data: openEntry } = await db.from("time_entries").select("id").eq("org_id", org.id).eq("employee_id", user.id).is("check_out_at", null).maybeSingle()
  if (openEntry) return { ok: false, message: "Du er allerede tjekket ind et andet sted. Tjek ud først." }
  const distance = await distanceToJob(org.id, jobId, pos)
  const { error } = await db.from("time_entries").insert({
    org_id: org.id,
    job_id: jobId,
    employee_id: user.id,
    check_in_lat: pos?.lat ?? null,
    check_in_lng: pos?.lng ?? null,
    check_in_accuracy_m: pos?.accuracy ?? null,
    check_in_distance_m: distance,
  })
  if (error) return { ok: false, message: "Kunne ikke tjekke ind. Prøv igen." }
  await db.from("jobs").update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", jobId).eq("status", "scheduled")
  refresh()
  return { ok: true, message: distance !== null ? `Tjekket ind (${distance} m fra stedet).` : "Tjekket ind." }
}

export async function checkOut(entryId: string, pos: Position, note: string, markDone: boolean) {
  const { user, org } = await requireRoleAction(["employee", "admin"])
  const db = createAdminClient()
  const { data: entry } = await db.from("time_entries").select("id, job_id, employee_id").eq("org_id", org.id).eq("id", entryId).maybeSingle()
  if (!entry || entry.employee_id !== user.id) return { ok: false, message: "Registreringen findes ikke." }
  const distance = entry.job_id ? await distanceToJob(org.id, entry.job_id, pos) : null
  const cleanNote = note.trim().slice(0, 2000)
  const { error } = await db
    .from("time_entries")
    .update({ check_out_at: new Date().toISOString(), check_out_lat: pos?.lat ?? null, check_out_lng: pos?.lng ?? null, check_out_distance_m: distance, ...(cleanNote ? { note: cleanNote } : {}) })
    .eq("org_id", org.id)
    .eq("id", entryId)
  if (error) return { ok: false, message: "Kunne ikke tjekke ud. Prøv igen." }
  if (entry.job_id) {
    await db
      .from("jobs")
      .update({ ...(markDone ? { status: "completed", completed_at: new Date().toISOString() } : {}), ...(cleanNote ? { employee_note: cleanNote } : {}), updated_at: new Date().toISOString() })
      .eq("org_id", org.id)
      .eq("id", entry.job_id)
  }
  refresh()
  return { ok: true, message: "Tjekket ud. Tak for i dag!" }
}

/** Check-in by scanning the QR sign at the location (proves presence without GPS). */
export async function qrCheckIn(token: string, jobId: string) {
  const { user, org, ctx } = await requireRoleAction(["employee", "admin"])
  const { getViewAs } = await import("@/lib/view-as")
  if (await getViewAs(ctx)) return { ok: false, message: "Visning er skrivebeskyttet." }
  if (!/^[a-f0-9]{24}$/.test(token)) return { ok: false, message: "Ugyldig QR-kode." }
  const db = createAdminClient()
  const { data: loc } = await db.from("locations").select("id").eq("org_id", org.id).eq("qr_token", token).maybeSingle()
  const { data: job } = loc ? await db.from("jobs").select("id, location_id, status").eq("org_id", org.id).eq("id", jobId).maybeSingle() : { data: null }
  if (!loc || !job || job.location_id !== loc.id || job.status === "cancelled") return { ok: false, message: "QR-koden passer ikke til vagten." }
  try { await assertAssigned(org.id, jobId, user.id) } catch { return { ok: false, message: "Vagten er ikke din." } }
  const { data: openEntry } = await db.from("time_entries").select("id, job_id").eq("org_id", org.id).eq("employee_id", user.id).is("check_out_at", null).maybeSingle()
  if (openEntry) return { ok: false, message: openEntry.job_id === jobId ? "Du er allerede tjekket ind her." : "Du er tjekket ind et andet sted. Tjek ud først." }
  const { error } = await db.from("time_entries").insert({ org_id: org.id, job_id: jobId, employee_id: user.id, method: "qr", check_in_distance_m: 0 })
  if (error) return { ok: false, message: "Kunne ikke tjekke ind. Prøv igen." }
  await db.from("jobs").update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", jobId).eq("status", "scheduled")
  refresh()
  return { ok: true, message: "Tjekket ind med QR." }
}

/** Offer one of my shifts to colleagues. I stay on it until someone takes it. */
export async function offerShift(jobId: string, reason: string) {
  const { user, org, ctx } = await requireRoleAction(["employee", "admin"])
  const { getViewAs } = await import("@/lib/view-as")
  if (await getViewAs(ctx)) return { ok: false, message: "Visning er skrivebeskyttet." }
  try { await assertAssigned(org.id, jobId, user.id) } catch { return { ok: false, message: "Vagten er ikke din." } }
  const db = createAdminClient()
  const { data: job } = await db.from("jobs").select("scheduled_start, status").eq("org_id", org.id).eq("id", jobId).maybeSingle()
  if (!job?.scheduled_start || new Date(job.scheduled_start).getTime() < Date.now() || job.status !== "scheduled") return { ok: false, message: "Vagten kan ikke afgives." }
  const { error } = await db.from("shift_handovers").insert({ org_id: org.id, job_id: jobId, employee_id: user.id, reason: reason.trim().slice(0, 300) || null })
  if (error) return { ok: false, message: "Vagten er allerede sat til overtagelse." }
  const { data: me } = await db.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
  const when = new Date(job.scheduled_start).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  const { data: staff } = await db.from("memberships").select("user_id").eq("org_id", org.id).eq("role", "employee").neq("user_id", user.id)
  await notifyUsers(org, (staff ?? []).map((s) => String(s.user_id)), { kind: "shift", title: "Vagt til overtagelse", body: `${me?.full_name?.split(" ")[0] ?? "En kollega"} kan ikke ${when}. Kan du?`, href: "/medarbejder/vagter?vis=ledige" })
  await notifyAdmins(org, { kind: "shift", title: "Vagt sat til overtagelse", body: `${me?.full_name ?? "En medarbejder"} · ${when}${reason ? ` · ${reason}` : ""}`, href: `/admin/vagtplan?vagt=${jobId}` }, user.id)
  refresh()
  return { ok: true, message: "Vagten er sat til overtagelse. Du bliver på den, indtil en kollega tager den." }
}

export async function withdrawOffer(handoverId: string) {
  const { user, org } = await requireRoleAction(["employee", "admin"])
  await createAdminClient().from("shift_handovers").update({ status: "withdrawn" }).eq("org_id", org.id).eq("id", handoverId).eq("employee_id", user.id).eq("status", "open")
  refresh()
  return { ok: true, message: "Du beholder vagten." }
}

/** A colleague takes over an offered shift: the swap happens right away. */
export async function takeOverShift(handoverId: string) {
  const { user, org, ctx } = await requireRoleAction(["employee", "admin"])
  const { getViewAs } = await import("@/lib/view-as")
  if (await getViewAs(ctx)) return { ok: false, message: "Visning er skrivebeskyttet." }
  const db = createAdminClient()
  const { data: h } = await db.from("shift_handovers").select("id, job_id, employee_id, status").eq("org_id", org.id).eq("id", handoverId).maybeSingle()
  if (!h || h.status !== "open") return { ok: false, message: "Vagten er allerede taget." }
  if (h.employee_id === user.id) return { ok: false, message: "Det er din egen vagt." }
  const { data: claimed } = await db.from("shift_handovers").update({ status: "taken", taken_by: user.id, taken_at: new Date().toISOString() }).eq("id", h.id).eq("status", "open").select("id").maybeSingle()
  if (!claimed) return { ok: false, message: "Vagten blev lige taget af en anden." }
  await db.from("job_assignments").delete().eq("org_id", org.id).eq("job_id", h.job_id).eq("employee_id", h.employee_id)
  await db.from("job_assignments").upsert({ org_id: org.id, job_id: h.job_id, employee_id: user.id }, { onConflict: "job_id,employee_id" })
  const { data: me } = await db.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
  const name = me?.full_name ?? "En kollega"
  await notifyUsers(org, [h.employee_id], { kind: "shift", title: "Din vagt er overtaget", body: `${name} har taget vagten. Tak!`, href: "/medarbejder/vagter" })
  await notifyAdmins(org, { kind: "shift", title: "Vagt overtaget", body: `${name} har overtaget en vagt.`, href: `/admin/vagtplan?vagt=${h.job_id}` }, user.id)
  refresh()
  return { ok: true, message: "Vagten er din nu." }
}
