'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useSession } from '@/store/session'
import type { Me } from '@shared/types/user'

export function useMe() {
  const setMe = useSession((s) => s.setMe)
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const me = await api.get<Me>('auth/me/')
      setMe(me)
      return me
    },
  })
}

export function useLogin() {
  return useMutation({
    mutationFn: (creds: { username: string; password: string }) =>
      fetch('/api/auth/login', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(creds),
      }).then(async (r) => { if (!r.ok) throw new Error('Invalid credentials'); return r.json() }),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  const setMe = useSession((s) => s.setMe)
  return useMutation({
    mutationFn: () => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }),
    onSuccess: () => { setMe(null); qc.clear() },
  })
}
