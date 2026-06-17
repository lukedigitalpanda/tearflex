'use client'
import { useSession } from '@/store/session'
import type { Me } from '@shared/types/user'

// Superusers, chain admins and practice admins get admin UI (Compare, Delete,
// report recovery, clinician/practice management).
export function useIsAdmin() {
  const me = useSession((s) => s.me)
  return !!(
    me?.user.is_superuser ||
    me?.clinician?.role === 'admin' ||
    me?.clinician?.role === 'chain_admin'
  )
}

// Whether the user can switch between practices (superusers across all, chain
// admins across their chain) — drives the header practice selector and the
// ?practice_id sent on scoped requests.
export function canSwitchPractice(me?: Me | null): boolean {
  return !!(me?.user.is_superuser || me?.clinician?.role === 'chain_admin')
}
