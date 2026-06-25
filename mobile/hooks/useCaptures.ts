import { useMutation } from '@tanstack/react-query'
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
