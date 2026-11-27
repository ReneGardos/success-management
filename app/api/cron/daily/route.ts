import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { ORG_COLUMNS, type Org } from "@/lib/org"
import { runAutomation } from "@/lib/backend/automation"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Daily automation for every active company (Vercel Cron, Authorization: Bearer CRON_SECRET). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const got = request.headers.get("authorization") ?? ""
  const want = `Bearer ${secret}`
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return NextResponse.json({ ok: false }, { status: 401 })
  const { data: orgs } = await createAdminClient().from("organizations").select(ORG_COLUMNS).eq("active", true)
  const result: Record<string, number> = {}
  for (const org of (orgs ?? []) as unknown as Org[]) {
    const logs = await runAutomation(org).catch(() => [])
    result[org.slug] = logs.length
  }
  return NextResponse.json({ ok: true, result })
}
