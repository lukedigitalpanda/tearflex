'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMe, useLogout } from '@/hooks/useAuth'
import { usePractice, usePractices } from '@/hooks/usePractice'
import { useSession } from '@/store/session'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { ThemeToggle } from './ThemeToggle'

function PracticeSelector() {
  const router = useRouter()
  const { data: practices } = usePractices()
  const selectedPracticeId = useSession((s) => s.selectedPracticeId)
  const setSelectedPracticeId = useSession((s) => s.setSelectedPracticeId)

  useEffect(() => {
    if (!selectedPracticeId && practices && practices.length > 0) {
      setSelectedPracticeId(practices[0].id)
    }
  }, [practices, selectedPracticeId, setSelectedPracticeId])

  const value = selectedPracticeId ? String(selectedPracticeId) : ''

  const handleChange = (v: string) => {
    setSelectedPracticeId(Number(v))
    router.push('/')
  }

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className="h-8 w-52 text-sm font-medium border-0 shadow-none px-0 focus:ring-0">
        <span className="truncate">
          {practices?.find((p) => p.id === selectedPracticeId)?.name ?? '…'}
        </span>
      </SelectTrigger>
      <SelectContent>
        {practices?.map((p) => (
          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function Header() {
  const { data: me } = useMe()
  const { data: practice } = usePractice()
  const logout = useLogout()
  const isSuperuser = me?.user.is_superuser

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <div className="text-sm text-muted-foreground">
        {isSuperuser
          ? <PracticeSelector />
          : (practice?.name ?? me?.clinician?.practice?.name ?? '')}
      </div>
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
