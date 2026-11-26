"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"

const text = (formData: FormData, key: string, max = 500) => String(formData.get(key) ?? "").trim().slice(0, max)
const num = (v: string) => (v ? Number(v.replace(/\s/g, "").replace(",", ".")) || null : null)
const fields = (formData: FormData) => ({
  name: text(formData, "name", 160),
  company: text(formData, "company", 160) || null,
  contact_name: text(formData, "contact_name", 120) || null,
  email: text(formData, "email", 180) || null,
  phone: text(formData, "phone", 40) || null,
  address: text(formData, "address", 300) || null,
  cvr: text(formData, "cvr", 20) || null,
  monthly_value: num(text(formData, "monthly_value")),
  status: ["active", "paused", "former"].includes(text(formData, "status")) ? text(formData, "status") : "active",
  notes: text(formData, "notes", 8000) || null,
})

export async function createCustomer(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const f = fields(formData)
  if (f.name.length < 2) redirect(`/admin/kunder?ny=1&fejl=${encodeURIComponent("Skriv et navn.")}`)
  const { data, error } = await createAdminClient().from("customers").insert({ ...f, org_id: org.id }).select("id").single()
  if (error || !data) redirect(`/admin/kunder?fejl=${encodeURIComponent(error?.message ?? "Kunden blev ikke oprettet")}`)
  revalidatePath("/admin/kunder")
  redirect(`/admin/kunder/${data!.id}`)
}

export async function saveCustomer(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id", 64)
  const { error } = await createAdminClient().from("customers").update({ ...fields(formData), updated_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", id)
  if (error) redirect(`/admin/kunder/${id}?fejl=${encodeURIComponent(error.message)}`)
  revalidatePath("/admin/kunder")
  redirect(`/admin/kunder/${id}?gemt=1`)
}

/** Links a location (address) to the customer. */
export async function linkLocation(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id", 64)
  const locationId = text(formData, "location_id", 64)
  if (locationId) await createAdminClient().from("locations").update({ customer_id: id }).eq("org_id", org.id).eq("id", locationId)
  revalidatePath(`/admin/kunder/${id}`)
  redirect(`/admin/kunder/${id}`)
}

export async function deleteCustomer(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  await createAdminClient().from("customers").delete().eq("org_id", org.id).eq("id", text(formData, "id", 64))
  revalidatePath("/admin/kunder")
  redirect("/admin/kunder?slettet=1")
}
