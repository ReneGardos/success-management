import { NextResponse } from "next/server"

export const runtime = "nodejs"

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "succes-cleaning-aps",
    timestamp: new Date().toISOString(),
  })
}
