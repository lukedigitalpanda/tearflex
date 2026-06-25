'use client'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { TestCapture } from '@shared/types/assessment'

interface UploadCaptureInput {
  assessment: number
  test_type: string
  video_file: Blob
}

export function useUploadCapture() {
  return useMutation({
    mutationFn: (input: UploadCaptureInput) =>
      api.postMultipart<{ id: number; status: string }>('assessments/captures/', {
        assessment: String(input.assessment),
        test_type: input.test_type,
        source: 'upload',
        video_file: input.video_file,
      }),
  })
}

interface UploadManualInput {
  assessment: number
  test_type: string
  video_file: Blob
  nibut_first_breakup_seconds?: number
  nibut_mean_breakup_seconds?: number
  fluorescein_grade?: number
  fluorescein_breakup_seconds?: number
  lipid_grade?: number
  lipid_thickness_nm?: number
  tear_meniscus_height_mm?: number
}

export function useUploadManualCapture() {
  return useMutation({
    mutationFn: (input: UploadManualInput) => {
      const { assessment, test_type, video_file, ...results } = input
      const fields: Record<string, string | Blob> = {
        assessment: String(assessment),
        test_type,
        source: 'upload',
        video_file,
      }
      for (const [k, v] of Object.entries(results)) {
        if (v !== undefined && v !== null) fields[k] = String(v)
      }
      return api.postMultipart<TestCapture>('assessments/captures/manual/', fields)
    },
  })
}

interface CreateStillInput {
  captureId: number
  image: Blob
  timestamp_seconds: number
  label?: string
}

export function useCreateCaptureStill() {
  return useMutation({
    mutationFn: (input: CreateStillInput) => {
      const fields: Record<string, string | Blob> = {
        image: input.image,
        timestamp_seconds: String(input.timestamp_seconds),
      }
      if (input.label) fields.label = input.label
      return api.postMultipart<{ id: number }>(`assessments/captures/${input.captureId}/stills/`, fields)
    },
  })
}
