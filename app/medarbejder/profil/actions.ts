"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { getViewAs } from "@/lib/view-as"

/** Name and phone for the signed-in person (employee or customer area). */
export async function saveProfile(formData: FormData) {
  const { user, ctx } = await requireRoleAction(["employee", "admin", "customer"])
  const back = String(formData.get("back") ?? "/medarbejder/profil")
  const safeBack = back === "/kunde/profil" ? back : "/medarbejder/profil"
  if (await getViewAs(ctx)) redirect(safeBack)
  const name = String(formData.get("full_name") ?? "").trim().slice(0, 120)
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 40) || null
  if (name.length < 2) redirect(`${safeBack}?fejl=${encodeURIComponent("Skriv dit navn.")}`)
  await createAdminClient().from("profiles").update({ full_name: name, phone, updated_at: new Date().toISOString() }).eq("id", user.id)
  revalidatePath("/", "layout")
  redirect(`${safeBack}?gemt=1`)
}
