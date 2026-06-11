'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated } from '@shared/types/api'
import type { Assessment, AssessmentListItem } from '@shared/types/assessment'

export function useAssessments(params: { patient?: number } = {}) {
  const qs = new URLSearchParams()
  if (params.patient) qs.set('patient', String(params.patient))
  return useQuery({
    queryKey: ['assessments', params],
    queryFn: () => api.get<Paginated<AssessmentListItem>>(`assessments/?${qs.toString()}`),
  })
}

export function useAssessment(id: number) {
  return useQuery({ queryKey: ['assessment', id], queryFn: () => api.get<Assessment>(`assessments/${id}/`), enabled: !!id })
}

export function useCreateAssessment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { patient: number; eye: string }) =>
      api.post<Assessment>('assessments/', data),
    onSuccess: (_, variables) =>
      qc.invalidateQueries({ queryKey: ['assessments', { patient: variables.patient }] }),
  })
}

interface ManualCaptureInput {
  assessment: number
  test_type: string
  nibut_first_breakup_seconds?: number
  nibut_mean_breakup_seconds?: number
  fluorescein_grade?: number
  fluorescein_breakup_seconds?: number
  lipid_grade?: number
  lipid_thickness_nm?: number
  tear_meniscus_height_mm?: number
}

export function useCreateManualCapture() {
  return useMutation({
    mutationFn: (data: ManualCaptureInput) =>
      api.post('assessments/captures/manual/', data),
  })
}
