import { redirect } from "next/navigation"
import { getOrgContext, homeFor } from "@/lib/org"

export const dynamic = "force-dynamic"

/** Start page: send each person to their organization's area. */
export default async function Home() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/auth/login")
  redirect(homeFor(ctx))
}
