'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { loginSchema, type LoginInput } from '@/lib/schemas'
import { useLogin } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const login = useLogin()
  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  const onSubmit = (data: LoginInput) =>
    login.mutate(data, { onSuccess: () => router.push('/') })

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-1 text-2xl font-bold text-teal-600">TearFlex</h1>
        <p className="mb-6 text-sm text-muted-foreground">Sign in to your practice account</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input id="username" {...register('username')} />
            {errors.username && <p className="mt-1 text-xs text-status-severe">{errors.username.message}</p>}
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register('password')} />
            {errors.password && <p className="mt-1 text-xs text-status-severe">{errors.password.message}</p>}
          </div>
          {login.isError && <p className="text-sm text-status-severe">Invalid username or password.</p>}
          <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
