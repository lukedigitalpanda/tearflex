'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'

type State = 'verifying' | 'provisioned' | 'awaiting' | 'error'

export default function VerifyEmailPage() {
  const router = useRouter()
  const [state, setState] = useState<State>('verifying')

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') ?? ''
    if (!token) { setState('error'); return }
    fetch('/api/auth/onboarding/verify', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setState('error'); return }
      if (data.status === 'provisioned') {
        setState('provisioned')
        setTimeout(() => router.push('/login?onboarded=1'), 2500)
      } else {
        setState('awaiting')
      }
    }).catch(() => setState('error'))
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md p-8 text-center">
        {state === 'verifying' && <p className="text-sm text-muted-foreground">Verifying your email…</p>}
        {state === 'provisioned' && (
          <>
            <h1 className="mb-2 text-2xl font-bold text-teal-600">Your account is ready</h1>
            <p className="text-sm text-muted-foreground">Redirecting you to sign in…</p>
            <Link href="/login" className="mt-3 inline-block text-sm text-teal-600 hover:underline">Go to sign in</Link>
          </>
        )}
        {state === 'awaiting' && (
          <>
            <h1 className="mb-2 text-2xl font-bold text-teal-600">Under review</h1>
            <p className="text-sm text-muted-foreground">
              Thanks — your application is being reviewed. We&apos;ll email you when your account is approved.
            </p>
          </>
        )}
        {state === 'error' && (
          <>
            <p className="mb-3 text-sm text-muted-foreground">This verification link is invalid or has expired.</p>
            <Link href="/signup" className="text-sm text-teal-600 hover:underline">Start again</Link>
          </>
        )}
      </Card>
    </div>
  )
}
