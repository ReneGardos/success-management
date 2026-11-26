"use server"

import { revalidatePath } from "next/cache"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"

const text = (formData: FormData, key: string, max = 120) => String(formData.get(key) ?? "").trim().slice(0, max)
const back = "/admin/forsyning"

export async function setRequestStatus(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const status = text(formData, "status", 10)
  if (!["open", "ordered", "done"].includes(status)) return
  const db = createAdminClient()
  const { data: req } = await db.from("supply_requests").update({ status, resolved_at: status === "done" ? new Date().toISOString() : null }).eq("org_id", org.id).eq("id", text(formData, "id", 64)).select("location_id, product_id").maybeSingle()
  // Delivered: the product is back in stock at the location.
  if (status === "done" && req?.location_id && req.product_id) await db.from("location_products").update({ status: "ok", updated_at: new Date().toISOString() }).eq("org_id", org.id).eq("location_id", req.location_id).eq("product_id", req.product_id)
  revalidatePath(back)
}

export async function saveProduct(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id", 64)
  const row = { name: text(formData, "name"), unit: text(formData, "unit", 10) || "stk", position: Number(text(formData, "position", 6)) || 100 }
  if (row.name.length < 2) return
  const db = createAdminClient()
  if (id) await db.from("products").update(row).eq("org_id", org.id).eq("id", id)
  else await db.from("products").insert({ ...row, org_id: org.id })
  revalidatePath(back)
}

export async function toggleProduct(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  await createAdminClient().from("products").update({ active: formData.get("active") === "true" }).eq("org_id", org.id).eq("id", text(formData, "id", 64))
  revalidatePath(back)
}

export async function setStock(formData: FormData) {
  const { org, user } = await requireRoleAction(["admin"])
  const status = text(formData, "status", 10)
  if (!["ok", "low", "missing"].includes(status)) return
  await createAdminClient().from("location_products").upsert({ org_id: org.id, location_id: text(formData, "location_id", 64), product_id: text(formData, "product_id", 64), status, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: "location_id,product_id" })
  revalidatePath(back)
}
