'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Clinician, Practice } from '@shared/types/user'
import type { ClinicianInviteResult, Paginated } from '@shared/types/api'

export function usePractice() {
  return useQuery({ queryKey: ['practice'], queryFn: () => api.get<Practice>('auth/practice/') })
}

export function useUpdatePractice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Practice>) => api.patch<Practice>('auth/practice/', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['practice'] }),
  })
}

export function useClinicians() {
  return useQuery({ queryKey: ['clinicians'], queryFn: () => api.get<Paginated<Clinician>>('auth/practice/clinicians/') })
}

export function useInviteClinician() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { email: string; first_name: string; last_name: string; role: string }) =>
      api.post<ClinicianInviteResult>('auth/practice/clinicians/invite/', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinicians'] }),
  })
}
