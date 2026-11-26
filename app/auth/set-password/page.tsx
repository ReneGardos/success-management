'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== repeat) return setError('De to adgangskoder er ikke ens.')
    setPending(true)
    setError('')
    const { error: updateError } = await createClient().auth.updateUser({ password })
    setPending(false)
    if (updateError) return setError(updateError.message.includes('session') ? 'Linket er udløbet. Bed om en ny invitation.' : 'Adgangskoden kunne ikke gemmes. Prøv igen.')
    const next = new URLSearchParams(window.location.search).get('next')
    router.push(next && next.startsWith('/') && !next.startsWith('//') ? next : '/')
    router.refresh()
  }

  return <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-4 py-24"><Card className="w-full max-w-md"><CardHeader><CardTitle>Vælg din adgangskode</CardTitle><CardDescription>Du bruger den, når du logger ind i Success Management.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-5"><div className="flex flex-col gap-2"><Label htmlFor="password">Ny adgangskode</Label><Input id="password" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div><div className="flex flex-col gap-2"><Label htmlFor="repeat">Gentag adgangskode</Label><Input id="repeat" type="password" minLength={8} required autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={pending}>{pending ? 'Gemmer…' : 'Gem og fortsæt'}</Button></form></CardContent></Card></main>
}
