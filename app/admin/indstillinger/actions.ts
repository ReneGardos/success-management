"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { senderFor, sendAdminEmail } from "@/lib/backend/mail"
import { isHexColor } from "@/lib/brand"

const back = "/admin/indstillinger"
const text = (formData: FormData, key: string, max = 500) => String(formData.get(key) ?? "").trim().slice(0, max) || null
const url = (formData: FormData, key: string) => {
  const v = text(formData, key)
  if (!v) return null
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}
const done = (q: string) => redirect(`${back}?${q}`)

export async function saveMailSettings(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const { error } = await createAdminClient()
    .from("email_settings")
    .upsert({
      org_id: org.id,
      show_logo: formData.get("show_logo") === "on",
      tagline: text(formData, "tagline", 160),
      company_phone: text(formData, "company_phone", 40),
      company_email: text(formData, "company_email", 120),
      website: text(formData, "website", 120),
      address: text(formData, "address", 160),
      cvr: text(formData, "cvr", 20),
      facebook_url: url(formData, "facebook_url"),
      instagram_url: url(formData, "instagram_url"),
      linkedin_url: url(formData, "linkedin_url"),
      closing: text(formData, "closing", 80),
      disclaimer: text(formData, "disclaimer", 1000),
      default_banner_id: text(formData, "default_banner_id", 64) ?? "none",
      banner_position: formData.get("banner_position") === "top" ? "top" : "bottom",
      updated_at: new Date().toISOString(),
    }, { onConflict: "org_id" })
  if (error) done(`fejl=${encodeURIComponent(`Indstillingerne blev ikke gemt: ${error.message}`)}`)
  revalidatePath(back)
  done("gemt=1")
}

/** Company details, branding and quote defaults for the active organization. */
export async function saveOrganization(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const color = (key: string, fallback: string) => {
    const v = text(formData, key, 7)
    return v && isHexColor(v) ? v : fallback
  }
  const db = createAdminClient()
  let logoUrl = url(formData, "logo_url")
  const file = formData.get("logo") as File | null
  if (file && typeof file === "object" && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) done(`fejl=${encodeURIComponent("Logoet må højst være 2 MB.")}`)
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) done(`fejl=${encodeURIComponent("Brug PNG, JPG, WEBP eller SVG til logoet.")}`)
    const ext = file.type.split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg")
    const path = `${org.id}/logo-${randomUUID()}.${ext}`
    const { error: uploadError } = await db.storage.from("org-assets").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
    if (uploadError) done(`fejl=${encodeURIComponent(`Upload fejlede: ${uploadError.message}`)}`)
    logoUrl = db.storage.from("org-assets").getPublicUrl(path).data.publicUrl
  }
  const website = text(formData, "website", 120)?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? null
  const { error } = await db
    .from("organizations")
    .update({
      name: text(formData, "name", 120) ?? org.name,
      legal_name: text(formData, "legal_name", 160),
      cvr: text(formData, "cvr", 20),
      address: text(formData, "address", 200),
      phone: text(formData, "phone", 40),
      office_email: text(formData, "office_email", 160),
      website,
      logo_url: logoUrl,
      email_logo_url: url(formData, "email_logo_url") ?? logoUrl,
      color_primary: color("color_primary", org.color_primary),
      color_accent: color("color_accent", org.color_accent),
      color_background: color("color_background", org.color_background),
      color_muted: color("color_muted", org.color_muted),
      mail_from_name: text(formData, "mail_from_name", 80),
      quote_default_intro: text(formData, "quote_default_intro", 2000),
      quote_default_terms: text(formData, "quote_default_terms", 4000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", org.id)
  if (error) done(`fejl=${encodeURIComponent(`Virksomheden blev ikke gemt: ${error.message}`)}`)
  revalidatePath("/", "layout")
  done("virksomhed=1")
}

export async function addBanner(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const name = text(formData, "name", 80)
  if (!name) done(`fejl=${encodeURIComponent("Giv banneret et navn.")}`)
  const db = createAdminClient()
  let imageUrl = url(formData, "image_url")
  const file = formData.get("image") as File | null
  if (file && typeof file === "object" && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) done(`fejl=${encodeURIComponent("Billedet må højst være 2 MB.")}`)
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) done(`fejl=${encodeURIComponent("Brug et PNG-, JPG-, GIF- eller WEBP-billede.")}`)
    const ext = file.type.split("/")[1].replace("jpeg", "jpg")
    const path = `${org.id}/banners/${randomUUID()}.${ext}`
    const { error: uploadError } = await db.storage.from("org-assets").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
    if (uploadError) done(`fejl=${encodeURIComponent(`Upload fejlede: ${uploadError.message}`)}`)
    imageUrl = db.storage.from("org-assets").getPublicUrl(path).data.publicUrl
  }
  if (!imageUrl) done(`fejl=${encodeURIComponent("Upload et billede eller indsæt et billedlink.")}`)
  const { error } = await db.from("email_banners").insert({ org_id: org.id, name, image_url: imageUrl, link_url: url(formData, "link_url"), alt_text: text(formData, "alt_text", 200) ?? name })
  if (error) done(`fejl=${encodeURIComponent(error.message)}`)
  revalidatePath(back)
  done("banner=1")
}

export async function toggleBanner(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id", 64)
  if (!id) return
  await createAdminClient().from("email_banners").update({ active: formData.get("active") === "true" }).eq("org_id", org.id).eq("id", id)
  revalidatePath(back)
}

export async function deleteBanner(formData: FormData) {
  const { org } = await requireRoleAction(["admin"])
  const id = text(formData, "id", 64)
  if (!id) return
  const db = createAdminClient()
  const { data: banner } = await db.from("email_banners").select("image_url").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!banner) return
  const marker = "/org-assets/"
  if (banner.image_url?.includes(marker) && banner.image_url.split(marker)[1].startsWith(`${org.id}/`)) await db.storage.from("org-assets").remove([banner.image_url.split(marker)[1]])
  await db.from("email_banners").delete().eq("org_id", org.id).eq("id", id)
  await db.from("email_settings").update({ default_banner_id: "none" }).eq("org_id", org.id).eq("default_banner_id", id)
  revalidatePath(back)
}

/** Sends a test mail to the signed-in admin with the current settings. */
export async function sendTestMail(formData: FormData) {
  const { user, org } = await requireRoleAction(["admin"])
  if (!user.email) done(`fejl=${encodeURIComponent("Din bruger har ingen email.")}`)
  try {
    await sendAdminEmail({
      org,
      to: user.email!,
      subject: `Test af mailsignatur – ${org.name}`,
      text: "Hej\n\nDette er en testmail, så du kan se signaturen og banneret, som kunderne ser dem.",
      sentBy: user.id,
      sender: await senderFor(org, user.id, user.email ?? null),
      bannerId: text(formData, "banner_id", 64) ?? undefined,
    })
  } catch (error) {
    done(`fejl=${encodeURIComponent(error instanceof Error ? error.message : "Testmailen blev ikke sendt")}`)
  }
  done(`test=${encodeURIComponent(user.email!)}`)
}
