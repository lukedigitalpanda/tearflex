'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useSession } from '@/store/session'
import { canSwitchPractice } from '@/hooks/useRole'
import type { Paginated } from '@shared/types/api'
import type { Patient, PatientListItem } from '@shared/types/patient'

export function usePatients(search: string, page = 1) {
  const me = useSession((s) => s.me)
  const selectedPracticeId = useSession((s) => s.selectedPracticeId)
  const qs = new URLSearchParams({ page: String(page) })
  if (search) qs.set('search', search)
  if (canSwitchPractice(me) && selectedPracticeId) qs.set('practice_id', String(selectedPracticeId))
  return useQuery({
    queryKey: ['patients', search, page, selectedPracticeId],
    queryFn: () => api.get<Paginated<PatientListItem>>(`patients/?${qs.toString()}`),
  })
}

export function usePatient(id: number) {
  return useQuery({ queryKey: ['patient', id], queryFn: () => api.get<Patient>(`patients/${id}/`), enabled: !!id })
}

export function usePatientTrend(id: number) {
  return useQuery({ queryKey: ['patient-trend', id], queryFn: () => api.get<{ date: string; nibut: number }[]>(`patients/${id}/trend/`), enabled: !!id })
}

export function useCreatePatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Patient>) => api.post<Patient>('patients/', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patients'] }),
  })
}

export function useUpdatePatient(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Patient>) => api.patch<Patient>(`patients/${id}/`, data),
    onSuccess: (updated) => {
      qc.setQueryData(['patient', id], updated)
      qc.invalidateQueries({ queryKey: ['patients'] })
    },
  })
}
