import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sm-track.js|sw.js|offline.html|manifest.webmanifest|api/v1|api/email|api/health|api/cron|api/stripe|api/kalender|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
