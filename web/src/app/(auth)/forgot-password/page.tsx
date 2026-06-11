'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/schemas'
import { useForgotPassword } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  const request = useForgotPassword()
  const { register, handleSubmit, formState: { errors } } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = (data: ForgotPasswordInput) =>
    request.mutate(data, { onSuccess: () => setSubmitted(true) })

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-1 text-2xl font-bold text-teal-600">TearFlex</h1>
        {submitted ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              If an account with that email exists, a password reset link has been sent. Check your inbox.
            </p>

            <Link href="/login" className="block text-center text-sm text-teal-600 hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-6 text-sm text-muted-foreground">Enter your email and we&apos;ll send you a reset link.</p>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="email">Email address <span className="text-xs text-red-500">* required</span></Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email && <p className="mt-1 text-xs text-status-severe">{errors.email.message}</p>}
              </div>
              {request.isError && (
                <p className="text-sm text-status-severe">{(request.error as Error).message}</p>
              )}
              <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={request.isPending}>
                {request.isPending ? 'Sending…' : 'Send reset link'}
              </Button>
              <Link href="/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">
                Back to sign in
              </Link>
            </form>
          </>
        )}
      </Card>
    </div>
  )
}
