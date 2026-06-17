'use client'
import { useSession } from '@/store/session'

export function useIsAdmin() {
  const me = useSession((s) => s.me)
  return !!(me?.user.is_superuser || me?.clinician?.role === 'admin')
}
