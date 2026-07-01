jest.mock('@/lib/secureTokens', () => ({
  getTokens: jest.fn().mockResolvedValue({ access: 'tok', refresh: 'r' }),
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
}))

import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { api } from '@/lib/api'
import { useUploadCapture, useUploadManualCapture, useCreateCaptureStill } from './useCaptures'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => { jest.restoreAllMocks() })

it('useUploadCapture posts to the auto endpoint with source', async () => {
  const spy = jest.spyOn(api, 'postMultipart').mockResolvedValue({ id: 9, status: 'processing' } as never)
  const { result } = renderHook(() => useUploadCapture(), { wrapper })
  await result.current.mutateAsync({ assessmentId: 3, testType: 'nibut', source: 'upload', videoUri: 'file://v.mp4' })
  expect(spy).toHaveBeenCalledWith(
    'assessments/captures/',
    { assessment: '3', test_type: 'nibut', source: 'upload' },
    { uri: 'file://v.mp4', name: 'capture.mp4', type: 'video/mp4' },
  )
})

it('useUploadManualCapture posts video + source + result fields to the manual endpoint', async () => {
  const spy = jest.spyOn(api, 'postMultipart').mockResolvedValue({ id: 10 } as never)
  const { result } = renderHook(() => useUploadManualCapture(), { wrapper })
  await result.current.mutateAsync({ assessmentId: 3, testType: 'nibut', source: 'upload', videoUri: 'file://v.mp4', results: { nibut_first_breakup_seconds: 7.2 } })
  expect(spy).toHaveBeenCalledWith(
    'assessments/captures/manual/',
    { assessment: '3', test_type: 'nibut', source: 'upload', nibut_first_breakup_seconds: '7.2' },
    { uri: 'file://v.mp4', name: 'capture.mp4', type: 'video/mp4' },
  )
})

it('useCreateCaptureStill posts the frame under field image', async () => {
  const spy = jest.spyOn(api, 'postMultipart').mockResolvedValue({ id: 1 } as never)
  const { result } = renderHook(() => useCreateCaptureStill(), { wrapper })
  await result.current.mutateAsync({ captureId: 9, frameUri: 'file://s.jpg', timestampSeconds: 8.2, label: 'first_breakup' })
  expect(spy).toHaveBeenCalledWith(
    'assessments/captures/9/stills/',
    { timestamp_seconds: '8.2', label: 'first_breakup' },
    { uri: 'file://s.jpg', name: 'still.jpg', type: 'image/jpeg' },
    'image',
  )
})
