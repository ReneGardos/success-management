import { redirect } from "next/navigation"
import { getOrgContext, homeFor } from "@/lib/org"

export const dynamic = "force-dynamic"

/** App start (home-screen icon): straight to the right office for the active company. */
export default async function Start() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/auth/login?next=/start")
  redirect(ctx.org ? homeFor(ctx) : "/vaelg-virksomhed")
}
