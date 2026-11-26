import { redirect } from "next/navigation"
import { getOrgContext, isAdminRole } from "@/lib/org"

export const dynamic = "force-dynamic"

export default async function Messages() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/auth/login?next=/beskeder")
  if (!ctx.org) redirect("/vaelg-virksomhed")
  redirect(isAdminRole(ctx.orgRole) ? "/admin/beskeder" : ctx.orgRole === "employee" ? "/medarbejder/beskeder" : "/kunde/beskeder")
}
