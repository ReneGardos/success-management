'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const nextPath = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setPending(false)
    if (authError) {
      setError(authError.message.toLowerCase().includes('confirm') ? 'Bekræft din emailadresse før du logger ind.' : 'Ugyldig email eller adgangskode.')
      return
    }
    // The start page sends each person to the right organization and area.
    const destination = nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/'
    router.push(destination)
    router.refresh()
  }

  return <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-4 py-24"><Card className="w-full max-w-md"><CardHeader><CardTitle>Log ind</CardTitle><CardDescription>Success Management – administration, vagter og tilbud.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-5"><div className="flex flex-col gap-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div><div className="flex flex-col gap-2"><Label htmlFor="password">Adgangskode</Label><Input id="password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={pending}>{pending ? 'Logger ind…' : 'Log ind'}</Button><p className="text-center text-sm text-muted-foreground">Adgang gives af din arbejdsgiver. Glemt adgangskoden? Bed en administrator om en ny invitation.</p></form></CardContent></Card></main>
}
