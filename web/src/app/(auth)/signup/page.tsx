'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { onboardingSchema, type OnboardingInput } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

export default function SignupPage() {
  const [type, setType] = useState<'practice' | 'chain' | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
  })

  const onSubmit = async (data: OnboardingInput) => {
    if (type === 'chain' && !data.chain_name) { setError('Group / chain name is required.'); return }
    setSubmitting(true); setError('')
    const res = await fetch('/api/auth/onboarding', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...data, registration_type: type }),
    })
    setSubmitting(false)
    if (res.ok) setDone(true)
    else setError('Something went wrong. Please check your details and try again.')
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md p-8 text-center">
          <h1 className="mb-2 text-2xl font-bold text-teal-600">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We&apos;ve sent a verification link to confirm your account. Click it to finish setting up.
          </p>
        </Card>
      </div>
    )
  }

  if (!type) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md p-8 space-y-4">
          <h1 className="text-2xl font-bold text-teal-600">Create your TearFlex account</h1>
          <p className="text-sm text-muted-foreground">What are you registering?</p>
          <button onClick={() => setType('practice')} className="w-full rounded-md border border-border p-4 text-left hover:border-teal-400">
            <span className="font-semibold">A single practice</span>
            <p className="text-xs text-muted-foreground">One clinic. You&apos;ll be its practice admin.</p>
          </button>
          <button onClick={() => setType('chain')} className="w-full rounded-md border border-border p-4 text-left hover:border-teal-400">
            <span className="font-semibold">A multi-practice group (chain)</span>
            <p className="text-xs text-muted-foreground">A brand with several practices. You&apos;ll be its chain admin.</p>
          </button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account? <Link href="/login" className="text-teal-600 hover:underline">Sign in</Link>
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background py-10">
      <Card className="w-full max-w-md p-8">
        <button onClick={() => setType(null)} className="mb-2 text-xs text-muted-foreground hover:underline">← back</button>
        <h1 className="mb-4 text-2xl font-bold text-teal-600">
          {type === 'chain' ? 'Register your group' : 'Register your practice'}
        </h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {type === 'chain' && (
            <div>
              <Label htmlFor="chain">Group / chain name</Label>
              <Input id="chain" {...register('chain_name')} />
              {errors.chain_name && <p className="mt-1 text-xs text-status-severe">{errors.chain_name.message}</p>}
            </div>
          )}
          <div>
            <Label htmlFor="pname">{type === 'chain' ? 'First practice name' : 'Practice name'}</Label>
            <Input id="pname" {...register('practice_name')} />
            {errors.practice_name && <p className="mt-1 text-xs text-status-severe">{errors.practice_name.message}</p>}
          </div>
          <div><Label htmlFor="a1">Address line 1</Label><Input id="a1" {...register('address_line_1')} />
            {errors.address_line_1 && <p className="mt-1 text-xs text-status-severe">{errors.address_line_1.message}</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="city">City</Label><Input id="city" {...register('city')} />
              {errors.city && <p className="mt-1 text-xs text-status-severe">{errors.city.message}</p>}</div>
            <div><Label htmlFor="pc">Postcode</Label><Input id="pc" {...register('postcode')} />
              {errors.postcode && <p className="mt-1 text-xs text-status-severe">{errors.postcode.message}</p>}</div>
          </div>
          <hr className="border-border" />
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="fn">Your first name</Label><Input id="fn" {...register('contact_first_name')} />
              {errors.contact_first_name && <p className="mt-1 text-xs text-status-severe">{errors.contact_first_name.message}</p>}</div>
            <div><Label htmlFor="ln">Your last name</Label><Input id="ln" {...register('contact_last_name')} />
              {errors.contact_last_name && <p className="mt-1 text-xs text-status-severe">{errors.contact_last_name.message}</p>}</div>
          </div>
          <div><Label htmlFor="email">Your work email</Label><Input id="email" type="email" {...register('contact_email')} />
            {errors.contact_email && <p className="mt-1 text-xs text-status-severe">{errors.contact_email.message}</p>}</div>
          <div><Label htmlFor="pw">Password</Label><Input id="pw" type="password" {...register('password')} />
            {errors.password && <p className="mt-1 text-xs text-status-severe">{errors.password.message}</p>}</div>
          {error && <p className="text-sm text-status-severe">{error}</p>}
          <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Create account'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
