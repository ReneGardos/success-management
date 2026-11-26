"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { geocodeAddress } from "@/lib/geo"

const back = "/admin/steder"
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim()

export async function saveLocation(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id")
  const name = text(formData, "name")
  const address = text(formData, "address")
  if (!name || !address) redirect(`${back}?fejl=${encodeURIComponent("Udfyld navn og adresse.")}`)

  const db = createAdminClient()
  const { data: existing } = id ? await db.from("locations").select("address, lat, lng").eq("org_id", org.id).eq("id", id).maybeSingle() : { data: null }
  let coords = existing && existing.address === address && existing.lat !== null ? { lat: existing.lat as number, lng: existing.lng as number } : null
  if (!coords) coords = await geocodeAddress(address)

  const row = {
    name,
    address,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    radius_m: Math.min(2000, Math.max(50, Number(text(formData, "radius_m")) || 200)),
    contact_name: text(formData, "contact_name") || null,
    contact_phone: text(formData, "contact_phone") || null,
    access_notes: text(formData, "access_notes") || null,
    updated_at: new Date().toISOString(),
  }
  const { error } = id ? await db.from("locations").update(row).eq("org_id", org.id).eq("id", id) : await db.from("locations").insert({ ...row, org_id: org.id })
  if (error) redirect(`${back}?fejl=${encodeURIComponent(error.message)}`)
  revalidatePath("/admin", "layout")
  redirect(`${back}?gemt=${coords ? "1" : "uden-position"}`)
}

/** Saves the admin's current GPS position as the location's coordinates (when standing on site). */
export async function setLocationPosition(id: string, lat: number, lng: number) {
  const { org } = await requireRoleAction(["admin"])
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false }
  const { error } = await createAdminClient().from("locations").update({ lat, lng, updated_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", id)
  revalidatePath(back)
  return { ok: !error }
}

export async function toggleLocation(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id")
  const active = text(formData, "active") === "true"
  await createAdminClient().from("locations").update({ active, updated_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", id)
  revalidatePath(back)
}
