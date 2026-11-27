"use server"

import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadDocByToken } from "@/lib/backend/documents"
import { pathAllowed, photoUploadTarget } from "@/lib/backend/reports"
import { notifyAdmins } from "@/lib/backend/notify"
import { loadOrgById } from "@/lib/org"
import { isRateLimited } from "@/lib/backend/rate-limit"

export async function docSignTarget(token: string) {
  const d = await loadDocByToken(token)
  if (!d || d.status !== "sent" || !d.needs_signature) throw new Error("Dokumentet kan ikke underskrives.")
  if (isRateLimited(`docsig|${token}`, 20, 60 * 60 * 1000)) throw new Error("For mange forsøg.")
  return photoUploadTarget(d.org_id, `docsign/${d.id}`, "image/png")
}

/** Simple electronic signature: drawn signature + typed name + time + IP. */
export async function signDocument(token: string, path: string, name: string) {
  const d = await loadDocByToken(token)
  if (!d || d.status !== "sent" || !d.needs_signature) return { ok: false, message: "Dokumentet kan ikke underskrives." }
  const clean = name.trim().slice(0, 120)
  if (clean.length < 2) return { ok: false, message: "Skriv dit fulde navn under underskriften." }
  if (!pathAllowed(d.org_id, `docsign/${d.id}`, path)) return { ok: false, message: "Ugyldig underskrift." }
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const { error } = await createAdminClient().from("org_documents").update({ status: "signed", signed_name: clean, signed_at: new Date().toISOString(), signed_ip: ip, signature_path: path }).eq("id", d.id).eq("status", "sent")
  if (error) return { ok: false, message: "Kunne ikke gemme. Prøv igen." }
  const org = await loadOrgById(d.org_id)
  if (org) await notifyAdmins(org, { kind: "quote", title: `✍️ ${d.title} er underskrevet`, body: `af ${clean}`, href: `/admin/dokumenter/${d.id}` })
  return { ok: true }
}
