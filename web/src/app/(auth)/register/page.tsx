'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
})
type RegisterInput = z.infer<typeof schema>

function RegisterForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (!token) setError('Invalid or missing invite link.')
  }, [token])

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterInput>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: RegisterInput) => {
    setError(null)
    setIsPending(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password: data.password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = body?.token?.[0] ?? body?.detail ?? 'Registration failed.'
        setError(msg)
        return
      }
      router.push('/')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      {error && <p className="mb-4 rounded bg-destructive/10 p-3 text-sm text-status-severe">{error}</p>}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="password">Password <span className="text-xs text-red-500">* required</span></Label>
          <Input id="password" type="password" {...register('password')} />
          {errors.password && <p className="mt-1 text-xs text-status-severe">{errors.password.message}</p>}
        </div>
        <div>
          <Label htmlFor="confirm">Confirm password <span className="text-xs text-red-500">* required</span></Label>
          <Input id="confirm" type="password" {...register('confirm')} />
          {errors.confirm && <p className="mt-1 text-xs text-status-severe">{errors.confirm.message}</p>}
        </div>
        <Button
          type="submit"
          className="w-full bg-teal-600 hover:bg-teal-700"
          disabled={isPending || !token}
        >
          {isPending ? 'Activating…' : 'Activate account'}
        </Button>
      </form>
    </>
  )
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-1 text-2xl font-bold text-teal-600">TearFlex</h1>
        <p className="mb-6 text-sm text-muted-foreground">Set your password to activate your account</p>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <RegisterForm />
        </Suspense>
      </Card>
    </div>
  )
}
