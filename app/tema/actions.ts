"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

/** Light / dark / follow the device, remembered for a year. */
export async function setTheme(formData: FormData) {
  const v = String(formData.get("theme") ?? "auto")
  const theme = v === "dark" || v === "light" ? v : "auto"
  ;(await cookies()).set("sm_theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
  revalidatePath("/", "layout")
}
