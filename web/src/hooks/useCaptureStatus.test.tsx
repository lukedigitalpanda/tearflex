import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { makeWrapper } from '@/test/queryWrapper'
import { api } from '@/lib/api'
import { useCaptureStatus } from './useCaptures'

beforeEach(() => { vi.restoreAllMocks() })

describe('useCaptureStatus', () => {
  it('fetches the capture status when a captureId is given', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ id: 9, status: 'analysed' })
    const { result } = renderHook(() => useCaptureStatus(9), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data?.status).toBe('analysed'))
    expect(api.get).toHaveBeenCalledWith('assessments/captures/9/status/')
  })

  it('is disabled when captureId is null', () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ id: 0, status: 'x' })
    renderHook(() => useCaptureStatus(null), { wrapper: makeWrapper() })
    expect(spy).not.toHaveBeenCalled()
  })

  it('reports isTimedOut=true when timeoutMs=0 and status is still processing', async () => {
    // Strategy: pass timeoutMs=0 so the timeout is already exceeded after the first settled fetch.
    // This avoids fake-timer / React Query interplay issues.
    vi.spyOn(api, 'get').mockResolvedValue({ id: 9, status: 'processing' })
    const { result } = renderHook(() => useCaptureStatus(9, 0), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isTimedOut).toBe(true))
  })
})
