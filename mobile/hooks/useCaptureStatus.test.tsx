jest.mock('@/lib/secureTokens', () => ({
  getTokens: jest.fn().mockResolvedValue({ access: 'tok', refresh: 'r' }),
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
}))

import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { api } from '@/lib/api'
import { useCaptureStatus } from './useCaptures'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => { jest.restoreAllMocks() })

it('fetches status for a captureId', async () => {
  jest.spyOn(api, 'get').mockResolvedValue({ status: 'analysed' } as never)
  const { result } = renderHook(() => useCaptureStatus(9), { wrapper })
  await waitFor(() => expect(result.current.data?.status).toBe('analysed'))
  expect(api.get).toHaveBeenCalledWith('assessments/captures/9/status/')
})

it('is disabled when captureId is null', () => {
  const spy = jest.spyOn(api, 'get').mockResolvedValue({ status: 'x' } as never)
  renderHook(() => useCaptureStatus(null), { wrapper })
  expect(spy).not.toHaveBeenCalled()
})

it('reports isTimedOut once the cap elapses while still processing', async () => {
  jest.spyOn(api, 'get').mockResolvedValue({ status: 'processing' } as never)
  const { result, rerender } = renderHook(() => useCaptureStatus(9, 50), { wrapper })
  await waitFor(() => expect(result.current.data?.status).toBe('processing'))
  await new Promise((r) => setTimeout(r, 70))
  rerender({})
  expect(result.current.isTimedOut).toBe(true)
})
