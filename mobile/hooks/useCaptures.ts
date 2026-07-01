import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import type { TestType } from '@shared/types/assessment'

type Source = 'mobile' | 'upload'

interface AutoInput {
  assessmentId: number
  testType: TestType
  source: Source
  videoUri: string
}

export function useUploadCapture() {
  return useMutation({
    mutationFn: (input: AutoInput) => api.postMultipart<{ id: number; status: string }>(
      'assessments/captures/',
      { assessment: String(input.assessmentId), test_type: input.testType, source: input.source },
      { uri: input.videoUri, name: 'capture.mp4', type: 'video/mp4' },
    ),
  })
}

interface ManualInput {
  assessmentId: number
  testType: TestType
  source: Source
  videoUri: string
  results: Record<string, number>
}

export function useUploadManualCapture() {
  return useMutation({
    mutationFn: (input: ManualInput) => {
      const fields: Record<string, string> = {
        assessment: String(input.assessmentId),
        test_type: input.testType,
        source: input.source,
      }
      for (const [k, v] of Object.entries(input.results)) {
        if (v !== undefined && v !== null) fields[k] = String(v)
      }
      return api.postMultipart<{ id: number }>(
        'assessments/captures/manual/',
        fields,
        { uri: input.videoUri, name: 'capture.mp4', type: 'video/mp4' },
      )
    },
  })
}

interface StillInput {
  captureId: number
  frameUri: string
  timestampSeconds: number
  label?: string
}

export function useCreateCaptureStill() {
  return useMutation({
    mutationFn: (input: StillInput) => {
      const fields: Record<string, string> = { timestamp_seconds: String(input.timestampSeconds) }
      if (input.label) fields.label = input.label
      return api.postMultipart<{ id: number }>(
        `assessments/captures/${input.captureId}/stills/`,
        fields,
        { uri: input.frameUri, name: 'still.jpg', type: 'image/jpeg' },
        'image',
      )
    },
  })
}

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 120000

interface StatusResponse { status: string }

export function useCaptureStatus(captureId: number | null, timeoutMs: number = POLL_TIMEOUT_MS) {
  const startRef = useRef<number | null>(null)
  useEffect(() => { startRef.current = captureId === null ? null : Date.now() }, [captureId])

  const query = useQuery({
    queryKey: ['capture-status', captureId],
    enabled: captureId !== null,
    queryFn: () => api.get<StatusResponse>(`assessments/captures/${captureId}/status/`),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      if (s === 'analysed' || s === 'failed') return false
      if (startRef.current !== null && Date.now() - startRef.current >= timeoutMs) return false
      return POLL_INTERVAL_MS
    },
  })
  const s = query.data?.status
  const isTimedOut = s !== 'analysed' && s !== 'failed' && startRef.current !== null && Date.now() - startRef.current >= timeoutMs
  return { ...query, isTimedOut }
}
