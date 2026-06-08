'use client'
import { useQuery } from '@tanstack/react-query'
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
