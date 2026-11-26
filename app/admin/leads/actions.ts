"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"

const statuses = ["new", "contacted", "qualified", "quoted", "won", "lost"] as const
const text = (formData: FormData, key: string, max = 500) => String(formData.get(key) ?? "").trim().slice(0, max)
const num = (v: string) => (v ? Number(v.replace(/\s/g, "").replace(",", ".")) || null : null)
const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

/** Drag-and-drop on the board. */
export async function moveLead(id: string, status: string) {
  const { org } = await requireRoleAction(["admin"])
  if (!(statuses as readonly string[]).includes(status)) return { ok: false }
  const { error } = await createAdminClient().from("leads").update({ status, updated_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", id)
  revalidatePath("/admin/leads")
  revalidatePath("/admin")
  return { ok: !error }
}

export async function createLead(formData: FormData) {
  const { org, user } = await requireRoleAction(["admin"])
  const name = text(formData, "name", 120)
  const email = text(formData, "email", 180)
  if (name.length < 2 || !email.includes("@")) redirect(`/admin/leads?ny=1&fejl=${encodeURIComponent("Udfyld navn og en gyldig email.")}`)
  const { data, error } = await createAdminClient()
    .from("leads")
    .insert({ org_id: org.id, name, email, company: text(formData, "company", 160) || null, phone: text(formData, "phone", 40) || null, value: num(text(formData, "value")), message: text(formData, "message", 4000) || null, source: text(formData, "source", 60) || "manuel", owner_id: user.id, next_action_at: date(text(formData, "next_action_at")) })
    .select("id")
    .single()
  if (error || !data) redirect(`/admin/leads?fejl=${encodeURIComponent(error?.message ?? "Leadet blev ikke oprettet")}`)
  revalidatePath("/admin/leads")
  redirect(`/admin/leads/${data!.id}`)
}

export async function saveLead(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id", 64)
  const status = text(formData, "status", 20)
  const { error } = await createAdminClient()
    .from("leads")
    .update({
      name: text(formData, "name", 120),
      email: text(formData, "email", 180),
      company: text(formData, "company", 160) || null,
      phone: text(formData, "phone", 40) || null,
      value: num(text(formData, "value")),
      next_action_at: date(text(formData, "next_action_at")),
      notes: text(formData, "notes", 8000) || null,
      ...((statuses as readonly string[]).includes(status) ? { status } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", org.id)
    .eq("id", id)
  if (error) redirect(`/admin/leads/${id}?fejl=${encodeURIComponent(error.message)}`)
  revalidatePath("/admin/leads")
  redirect(`/admin/leads/${id}?gemt=1`)
}

/** Creates (or links) a customer from the lead and marks it won. */
export async function convertLead(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id", 64)
  const db = createAdminClient()
  const { data: lead } = await db.from("leads").select("*").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!lead) redirect("/admin/leads")
  let customerId = lead!.customer_id as string | null
  if (!customerId) {
    const { data: existing } = await db.from("customers").select("id").eq("org_id", org.id).ilike("email", lead!.email).maybeSingle()
    customerId = existing?.id ?? null
  }
  if (!customerId) {
    const cleanName = String(lead!.name).replace(/\s*\([^)]+\)$/, "")
    const { data: created, error } = await db
      .from("customers")
      .insert({ org_id: org.id, name: lead!.company || cleanName, company: lead!.company, contact_name: cleanName, email: lead!.email, phone: lead!.phone, monthly_value: lead!.value, notes: lead!.notes })
      .select("id")
      .single()
    if (error || !created) redirect(`/admin/leads/${id}?fejl=${encodeURIComponent(error?.message ?? "Kunden blev ikke oprettet")}`)
    customerId = created!.id
  }
  await db.from("leads").update({ customer_id: customerId, status: "won", updated_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", id)
  revalidatePath("/admin", "layout")
  redirect(`/admin/kunder/${customerId}?fra=lead`)
}

export async function deleteLead(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  await createAdminClient().from("leads").delete().eq("org_id", org.id).eq("id", text(formData, "id", 64))
  revalidatePath("/admin/leads")
  redirect("/admin/leads?slettet=1")
}
