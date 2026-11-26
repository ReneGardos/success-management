import { NextRequest, NextResponse } from "next/server"
import { getOrgContext, isAdminRole } from "@/lib/org"
import { VIEW_COOKIE } from "@/lib/view-as"

export const runtime = "nodejs"

/** /org/se-som?type=employee|customer&id=… starts a read-only preview; ?stop=1 ends it. */
export async function GET(request: NextRequest) {
  const ctx = await getOrgContext()
  const url = request.nextUrl
  if (!ctx?.org || !(isAdminRole(ctx.orgRole) || ctx.isSuperadmin)) return NextResponse.redirect(new URL("/", url.origin))
  if (url.searchParams.get("stop")) {
    const res = NextResponse.redirect(new URL("/admin/se-som", url.origin))
    res.cookies.delete(VIEW_COOKIE)
    return res
  }
  const type = url.searchParams.get("type") === "customer" ? "customer" : "employee"
  const id = url.searchParams.get("id") ?? ""
  const res = NextResponse.redirect(new URL(type === "customer" ? "/kunde" : "/medarbejder", url.origin))
  res.cookies.set(VIEW_COOKIE, `${ctx.org.id}:${type}:${id}`, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 4 })
  return res
}
