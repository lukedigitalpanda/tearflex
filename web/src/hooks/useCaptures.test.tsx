import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { makeWrapper } from '@/test/queryWrapper'
import { api } from '@/lib/api'
import { useUploadCapture, useUploadManualCapture, useCreateCaptureStill } from './useCaptures'

beforeEach(() => { vi.restoreAllMocks() })

describe('capture hooks', () => {
  it('useUploadCapture posts to the auto endpoint with source=upload', async () => {
    const spy = vi.spyOn(api, 'postMultipart').mockResolvedValue({ id: 9, status: 'processing' })
    const { result } = renderHook(() => useUploadCapture(), { wrapper: makeWrapper() })
    const blob = new Blob(['x'], { type: 'video/mp4' })
    await result.current.mutateAsync({ assessment: 3, test_type: 'nibut', video_file: blob })
    expect(spy).toHaveBeenCalledWith('assessments/captures/', { assessment: '3', test_type: 'nibut', source: 'upload', video_file: blob })
  })

  it('useUploadManualCapture posts video + source + result fields to the manual endpoint', async () => {
    const spy = vi.spyOn(api, 'postMultipart').mockResolvedValue({ id: 10 })
    const { result } = renderHook(() => useUploadManualCapture(), { wrapper: makeWrapper() })
    const blob = new Blob(['x'], { type: 'video/mp4' })
    await result.current.mutateAsync({ assessment: 3, test_type: 'nibut', video_file: blob, nibut_first_breakup_seconds: 7.2 })
    expect(spy).toHaveBeenCalledWith('assessments/captures/manual/', { assessment: '3', test_type: 'nibut', source: 'upload', video_file: blob, nibut_first_breakup_seconds: '7.2' })
  })

  it('useCreateCaptureStill posts the frame to the capture stills endpoint', async () => {
    const spy = vi.spyOn(api, 'postMultipart').mockResolvedValue({ id: 1 })
    const { result } = renderHook(() => useCreateCaptureStill(), { wrapper: makeWrapper() })
    const img = new Blob(['x'], { type: 'image/jpeg' })
    await result.current.mutateAsync({ captureId: 9, image: img, timestamp_seconds: 8.2, label: 'first_breakup' })
    expect(spy).toHaveBeenCalledWith('assessments/captures/9/stills/', { image: img, timestamp_seconds: '8.2', label: 'first_breakup' })
  })
})
