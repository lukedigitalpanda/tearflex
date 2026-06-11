'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/schemas'
import { useResetPassword } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [token, setToken] = useState<string>('')
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '')
  }, [])
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const reset = useResetPassword()
  const { register, handleSubmit, formState: { errors } } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  })

  const onSubmit = (data: ResetPasswordInput) =>
    reset.mutate({ token, password: data.password }, {
      onSuccess: () => router.push('/login?reset=1'),
    })

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-sm p-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">This reset link is invalid or has expired.</p>
          <Link href="/forgot-password" className="text-sm text-teal-600 hover:underline">Request a new link</Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-1 text-2xl font-bold text-teal-600">TearFlex</h1>
        <p className="mb-6 text-sm text-muted-foreground">Choose a new password for your account.</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="password">New password <span className="text-xs text-red-500">* required</span></Label>
            <div className="relative">
              <Input id="password" type={showPassword ? 'text' : 'password'} className="pr-10" {...register('password')} />
              <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
            {errors.password && <p className="mt-1 text-xs text-status-severe">{errors.password.message}</p>}
          </div>
          <div>
            <Label htmlFor="confirm_password">Confirm password <span className="text-xs text-red-500">* required</span></Label>
            <div className="relative">
              <Input id="confirm_password" type={showConfirm ? 'text' : 'password'} className="pr-10" {...register('confirm_password')} />
              <button type="button" tabIndex={-1} onClick={() => setShowConfirm((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}>
                {showConfirm ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
            {errors.confirm_password && <p className="mt-1 text-xs text-status-severe">{errors.confirm_password.message}</p>}
          </div>
          {reset.isError && (
            <p className="text-sm text-status-severe">{(reset.error as Error).message}</p>
          )}
          <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={reset.isPending}>
            {reset.isPending ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
