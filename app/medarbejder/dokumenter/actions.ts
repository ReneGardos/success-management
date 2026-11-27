"use server"

import { revalidatePath } from "next/cache"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { getViewAs } from "@/lib/view-as"
import { docPathAllowed, docUploadTarget } from "@/lib/backend/documents"
import { notifyAdmins } from "@/lib/backend/notify"

export async function myDocTarget(name: string, type: string) {
  const { org, user, ctx } = await requireRoleAction(["employee", "admin"])
  if (await getViewAs(ctx)) throw new Error("Visning er skrivebeskyttet.")
  return docUploadTarget(org.id, `emp/${user.id}`, type, name)
}

/** Employee uploads own certificate, driving licence etc. */
export async function registerMyDoc(path: string, fileName: string, form: Record<string, string>) {
  const { org, user } = await requireRoleAction(["employee", "admin"])
  if (!docPathAllowed(org.id, `emp/${user.id}`, path)) return { ok: false, message: "Ugyldig fil." }
  const expires = /^\d{4}-\d{2}-\d{2}$/.test(form.expires_on ?? "") ? form.expires_on : null
  const title = (form.title || fileName).slice(0, 200)
  const { error } = await createAdminClient().from("org_documents").insert({ org_id: org.id, kind: "employee", title, file_path: path, file_name: fileName.slice(0, 200), employee_id: user.id, needs_signature: false, status: "signed", uploaded_by_employee: true, expires_on: expires, created_by: user.id })
  if (!error) await notifyAdmins(org, { kind: "report", title: "Nyt medarbejderdokument", body: title, href: "/admin/dokumenter" }, user.id)
  revalidatePath("/medarbejder/dokumenter")
  return { ok: !error, message: error?.message }
}
