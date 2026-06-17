'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useSession } from '@/store/session'
import { canSwitchPractice } from '@/hooks/useRole'
import type { Clinician, Practice } from '@shared/types/user'
import type { ClinicianInviteResult, Paginated } from '@shared/types/api'

export function usePractices() {
  const me = useSession((s) => s.me)
  return useQuery({
    queryKey: ['practices'],
    queryFn: () => api.get<Practice[]>('auth/practices/'),
    enabled: canSwitchPractice(me),
  })
}

export function usePractice() {
  const me = useSession((s) => s.me)
  const selectedPracticeId = useSession((s) => s.selectedPracticeId)
  const suffix = canSwitchPractice(me) && selectedPracticeId ? `?practice_id=${selectedPracticeId}` : ''
  return useQuery({
    queryKey: ['practice', selectedPracticeId],
    queryFn: () => api.get<Practice>(`auth/practice/${suffix}`),
  })
}

export function useUpdatePractice() {
  const qc = useQueryClient()
  const me = useSession((s) => s.me)
  const selectedPracticeId = useSession((s) => s.selectedPracticeId)
  const suffix = canSwitchPractice(me) && selectedPracticeId ? `?practice_id=${selectedPracticeId}` : ''
  return useMutation({
    mutationFn: (data: Partial<Practice>) => api.patch<Practice>(`auth/practice/${suffix}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['practice'] }),
  })
}

export function useClinicians() {
  const me = useSession((s) => s.me)
  const selectedPracticeId = useSession((s) => s.selectedPracticeId)
  const suffix = canSwitchPractice(me) && selectedPracticeId ? `?practice_id=${selectedPracticeId}` : ''
  return useQuery({
    queryKey: ['clinicians', selectedPracticeId],
    queryFn: () => api.get<Paginated<Clinician>>(`auth/practice/clinicians/${suffix}`),
  })
}

export function useInviteClinician() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { email: string; first_name: string; last_name: string; role: string }) =>
      api.post<ClinicianInviteResult>('auth/practice/clinicians/invite/', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinicians'] }),
  })
}
