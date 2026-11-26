"use server"

import { revalidatePath } from "next/cache"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { copenhagenToIso } from "@/lib/time"
import { notifyCustomer, notifyUsers } from "@/lib/backend/notify"

/** Approve (skip → cancel visit, move → reschedule) or decline a customer's visit request. */
export async function decideVisit(formData: FormData) {
  const { org, user } = await requireRoleAction(["admin"])
  const id = String(formData.get("id") ?? "")
  const decision = String(formData.get("decision") ?? "")
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["approved", "declined"].includes(decision)) return
  const db = createAdminClient()
  const { data: r } = await db.from("visit_requests").select("id, job_id, customer_id, kind, wish_date, wish_time, status").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!r || r.status !== "pending") return
  const { data: job } = await db.from("jobs").select("id, scheduled_start, scheduled_end").eq("org_id", org.id).eq("id", r.job_id).maybeSingle()
  let when = ""
  if (decision === "approved" && job) {
    if (r.kind === "skip") {
      await db.from("jobs").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", job.id)
    } else {
      const date = String(formData.get("date") || r.wish_date || "")
      const fallbackTime = job.scheduled_start ? new Date(job.scheduled_start).toLocaleTimeString("da-DK", { timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit" }).replace(".", ":") : "08:00"
      const time = String(formData.get("time") || r.wish_time || fallbackTime)
      const start = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time) ? copenhagenToIso(date, time) : null
      if (!start) return
      const dur = job.scheduled_start && job.scheduled_end ? new Date(job.scheduled_end).getTime() - new Date(job.scheduled_start).getTime() : 2 * 3600000
      await db.from("jobs").update({ scheduled_start: start, scheduled_end: new Date(new Date(start).getTime() + dur).toISOString(), updated_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", job.id)
      when = new Date(start).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    }
    const { data: staff } = await db.from("job_assignments").select("employee_id").eq("org_id", org.id).eq("job_id", job.id)
    await notifyUsers(org, (staff ?? []).map((s) => s.employee_id), { kind: "shift", title: r.kind === "skip" ? "En vagt er aflyst" : "En vagt er flyttet", body: r.kind === "skip" ? "Kunden har sprunget besøget over." : when, href: "/medarbejder/vagter" })
  }
  await db.from("visit_requests").update({ status: decision, decided_by: user.id, decided_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", id)
  await notifyCustomer(org, r.customer_id, { kind: "shift", title: decision === "approved" ? (r.kind === "skip" ? "Besøget er sprunget over" : "Besøget er flyttet") : "Vi kunne ikke ændre besøget", body: decision === "approved" ? when || "Se jeres besøg." : "Skriv til os under Beskeder, så finder vi en løsning.", href: "/kunde/besoeg" })
  revalidatePath("/admin/besoeg")
  revalidatePath("/admin/vagtplan")
}
