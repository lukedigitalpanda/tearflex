'use client'
import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated, Report } from '@shared/types/api'

const POLL_INTERVAL_MS = 3_000
const MAX_POLLS = 10 // hard cap (~30s) so a perpetually-pending report can't loop forever

export function useReports(patientId?: number) {
  const query = patientId ? `reports/?patient=${patientId}` : 'reports/'
  const polls = useRef(0)
  const lastPending = useRef(0)
  return useQuery({
    queryKey: ['reports', patientId ?? 'all'],
    queryFn: () => api.get<Paginated<Report>>(query),
    // Auto-refresh while a report is still generating, capped so it stops.
    refetchInterval: (q) => {
      const pending = q.state.data?.results.filter((r) => r.status === 'pending').length ?? 0
      // New generation work appeared (e.g. a manual retry) → reset the budget.
      if (pending > lastPending.current) polls.current = 0
      lastPending.current = pending
      if (pending === 0) { polls.current = 0; return false }
      if (polls.current >= MAX_POLLS) return false
      polls.current += 1
      return POLL_INTERVAL_MS
    },
  })
}

export function useGenerateReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assessment: number) => api.post<Report>('reports/generate/', { assessment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'], exact: false }),
  })
}

export function useRetryReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.post<Report>(`reports/${id}/retry/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'], exact: false }),
  })
}

export function useDeleteReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`reports/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'], exact: false }),
  })
}

// Soft-deleted (recoverable) reports for a patient — admin-only on the backend.
export function useDeletedReports(patientId: number) {
  return useQuery({
    queryKey: ['reports', 'deleted', patientId],
    queryFn: () => api.get<Paginated<Report>>(`reports/?patient=${patientId}&deleted=true`),
  })
}

export function useRestoreReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.post<Report>(`reports/${id}/restore/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'], exact: false }),
  })
}

export function downloadReportUrl(id: number) {
  return `/api/download/${id}`
}

export function viewReportUrl(id: number) {
  return `/api/download/${id}?inline=1`
}
