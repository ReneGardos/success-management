import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgContext, homeFor, ORG_COOKIE } from "@/lib/org"

export const runtime = "nodejs"

const safeNext = (value: string | null) => (value && value.startsWith("/") && !value.startsWith("//") ? value : null)

/** Switches the active organization: /org/skift?org=<id>&next=/admin */
export async function GET(request: NextRequest) {
  const ctx = await getOrgContext()
  const url = request.nextUrl.clone()
  if (!ctx) {
    url.pathname = "/auth/login"
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`
    return NextResponse.redirect(url)
  }
  const orgId = request.nextUrl.searchParams.get("org") ?? ""
  const membership = ctx.memberships.find((m) => m.orgId === orgId)
  if (!membership && !ctx.isSuperadmin) {
    url.pathname = "/vaelg-virksomhed"
    url.search = "?fejl=1"
    return NextResponse.redirect(url)
  }
  await createAdminClient().from("profiles").update({ last_org_id: orgId }).eq("id", ctx.user.id)
  const role = membership?.role ?? "admin"
  const fallback = homeFor({ ...ctx, org: { id: orgId } as never, orgRole: role })
  const next = safeNext(request.nextUrl.searchParams.get("next"))
  // Customers and employees may only land in their own area.
  const allowed = next && (role === "owner" || role === "admin" || (role === "employee" && next.startsWith("/medarbejder")) || (role === "customer" && next.startsWith("/kunde")))
  const target = new URL(allowed ? next! : fallback, request.nextUrl.origin)
  const response = NextResponse.redirect(target)
  response.cookies.set(ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 })
  return response
}
