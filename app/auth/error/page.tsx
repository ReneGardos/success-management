import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AuthErrorPage() {
  return <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-4 py-24"><Card className="w-full max-w-md"><CardHeader><CardTitle>Linket kunne ikke bruges</CardTitle></CardHeader><CardContent className="flex flex-col gap-5"><p className="text-muted-foreground">Linket er udløbet eller allerede brugt. Prøv at logge ind igen.</p><Button asChild><Link href="/auth/login">Gå til login</Link></Button></CardContent></Card></main>
}
