"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"

const back = "/admin/prisliste"
const text = (formData: FormData, key: string, max = 300) => String(formData.get(key) ?? "").trim().slice(0, max)
const num = (v: string) => Number(v.replace(/\s/g, "").replace(",", ".")) || 0
const slugify = (s: string) => s.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "ydelse"

function fields(formData: FormData) {
  return {
    name: text(formData, "name", 120),
    category: text(formData, "category", 60) || null,
    unit: text(formData, "unit", 20) || "stk",
    unit_price: num(text(formData, "unit_price")),
    recurring: text(formData, "recurring") !== "false",
    qty_from_area: formData.get("qty_from_area") === "on",
    description: text(formData, "description", 300) || null,
    position: Math.round(num(text(formData, "position"))),
    published: formData.get("published") !== "off",
    updated_at: new Date().toISOString(),
  }
}

export async function saveService(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id", 64)
  const f = fields(formData)
  if (f.name.length < 2) redirect(`${back}?fejl=${encodeURIComponent("Skriv et navn.")}`)
  const db = createAdminClient()
  const { error } = id
    ? await db.from("services").update(f).eq("org_id", org.id).eq("id", id)
    : await db.from("services").insert({ ...f, org_id: org.id, slug: `${slugify(f.name)}-${Math.random().toString(36).slice(2, 6)}` })
  if (error) redirect(`${back}?fejl=${encodeURIComponent(error.message)}`)
  revalidatePath(back)
  redirect(`${back}?gemt=1`)
}

export async function toggleService(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  await createAdminClient().from("services").update({ published: formData.get("published") === "true" }).eq("org_id", org.id).eq("id", text(formData, "id", 64))
  revalidatePath(back)
}

export async function deleteService(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  await createAdminClient().from("services").delete().eq("org_id", org.id).eq("id", text(formData, "id", 64))
  revalidatePath(back)
  redirect(`${back}?slettet=1`)
}
