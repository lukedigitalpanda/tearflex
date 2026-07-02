'use client'
import { useEffect, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated } from '@shared/types/api'
import type { TopographyScan, TopographyScanStatus, TopographyResult } from '@shared/types/topography'

export function useTopographyScans(assessmentId: number | undefined) {
  return useQuery({
    queryKey: ['topography-scans', assessmentId],
    queryFn: () => api.get<Paginated<TopographyScan>>(`topography/scans/?assessment=${assessmentId}`),
    enabled: !!assessmentId,
  })
}

export function useCreateTopographyScan() {
  return useMutation({
    mutationFn: (params: { assessment: number; stills: File[] }) =>
      api.postMultipart<TopographyScan>('topography/scans/', {
        assessment: String(params.assessment),
        stills: params.stills,
      }),
  })
}

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 120000

interface TopographyScanStatusResponse {
  id: number
  status: TopographyScanStatus
  result?: TopographyResult
}

export function useTopographyScanStatus(scanId: number | null, timeoutMs: number = POLL_TIMEOUT_MS) {
  const startRef = useRef<number | null>(null)
  useEffect(() => {
    startRef.current = scanId === null ? null : Date.now()
  }, [scanId])

  const query = useQuery({
    queryKey: ['topography-scan-status', scanId],
    enabled: scanId !== null,
    queryFn: () => api.get<TopographyScanStatusResponse>(`topography/scans/${scanId}/status/`),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'analysed' || status === 'failed') return false
      if (startRef.current !== null && Date.now() - startRef.current >= timeoutMs) return false
      return POLL_INTERVAL_MS
    },
  })

  const status = query.data?.status
  const isTimedOut =
    status !== 'analysed' && status !== 'failed' &&
    startRef.current !== null && Date.now() - startRef.current >= timeoutMs

  return { ...query, isTimedOut }
}
