'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated, Report } from '@shared/types/api'

export function useReports() {
  return useQuery({ queryKey: ['reports'], queryFn: () => api.get<Paginated<Report>>('reports/') })
}

export function useGenerateReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assessment: number) => api.post<Report>('reports/generate/', { assessment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  })
}

export function downloadReportUrl(id: number) {
  return `/api/download/${id}`
}
