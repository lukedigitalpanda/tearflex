'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useSession } from '@/store/session'
import { canSwitchPractice } from '@/hooks/useRole'
import type { Clinician, Practice } from '@shared/types/user'
import type { ClinicianInviteResult, Paginated } from '@shared/types/api'
import type { PracticeInput } from '@/lib/schemas'

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
  const me = useSession((s) => s.me)
  const selectedPracticeId = useSession((s) => s.selectedPracticeId)
  const suffix = canSwitchPractice(me) && selectedPracticeId ? `?practice_id=${selectedPracticeId}` : ''
  return useMutation({
    mutationFn: (data: { email: string; first_name: string; last_name: string; role: string }) =>
      api.post<ClinicianInviteResult>(`auth/practice/clinicians/invite/${suffix}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinicians'] }),
  })
}

export function useUpdateClinician(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch<Clinician>(`auth/clinicians/${id}/`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinicians'] }),
  })
}

export function useRemoveClinician(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.del(`auth/clinicians/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinicians'] }),
  })
}

export function useResetClinicianPassword(id: number) {
  return useMutation({
    mutationFn: () =>
      api.post<{ token: string; reset_url: string }>(`auth/clinicians/${id}/reset-password/`, {}),
  })
}

export function useCreatePractice() {
  const qc = useQueryClient()
  const setSelectedPracticeId = useSession((s) => s.setSelectedPracticeId)
  return useMutation({
    mutationFn: (data: PracticeInput) => api.post<Practice>('auth/practices/', data),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['practices'] })
      setSelectedPracticeId(created.id)
      qc.invalidateQueries({ queryKey: ['practice'] })
    },
  })
}
