'use client'
import { useMe, useLogout } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from './ThemeToggle'

export function Header() {
  const { data: me } = useMe()
  const logout = useLogout()
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <div className="text-sm text-muted-foreground">{me?.clinician.practice.name ?? ''}</div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{me ? `${me.user.first_name} ${me.user.last_name}` : ''}</span>
        <ThemeToggle />
        <Button variant="ghost" size="sm"
          onClick={() => logout.mutate(undefined, { onSuccess: () => { window.location.href = '/login' } })}>
          Sign out
        </Button>
      </div>
    </header>
  )
}
