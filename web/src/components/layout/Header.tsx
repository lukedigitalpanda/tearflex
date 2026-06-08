'use client'
import { useRouter } from 'next/navigation'
import { useMe, useLogout } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'

export function Header() {
  const { data: me } = useMe()
  const logout = useLogout()
  const router = useRouter()
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-300 bg-white px-6">
      <div className="text-sm text-slate-600">{me?.clinician.practice.name ?? ''}</div>
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">{me ? `${me.user.first_name} ${me.user.last_name}` : ''}</span>
        <Button variant="ghost" size="sm"
          onClick={() => logout.mutate(undefined, { onSuccess: () => router.push('/login') })}>
          Sign out
        </Button>
      </div>
    </header>
  )
}
