import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { makeWrapper } from '@/test/queryWrapper'
import { api } from '@/lib/api'
import { useCreateTopographyScan, useTopographyScanStatus } from './useTopography'

beforeEach(() => { vi.restoreAllMocks() })

describe('useCreateTopographyScan', () => {
  it('posts multipart with assessment and repeated stills', async () => {
    const spy = vi.spyOn(api, 'postMultipart').mockResolvedValue({ id: 7, status: 'processing' })
    const { result } = renderHook(() => useCreateTopographyScan(), { wrapper: makeWrapper() })
    const f = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    await result.current.mutateAsync({ assessment: 5, stills: [f] })
    expect(spy).toHaveBeenCalledWith('topography/scans/', { assessment: '5', stills: [f] })
  })
})

describe('useTopographyScanStatus', () => {
  it('fetches the scan status when a scanId is given', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ id: 7, status: 'analysed' })
    const { result } = renderHook(() => useTopographyScanStatus(7), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data?.status).toBe('analysed'))
    expect(api.get).toHaveBeenCalledWith('topography/scans/7/status/')
  })

  it('is disabled when scanId is null', () => {
    const spy = vi.spyOn(api, 'get')
    renderHook(() => useTopographyScanStatus(null), { wrapper: makeWrapper() })
    expect(spy).not.toHaveBeenCalled()
  })

  it('reports isTimedOut=true after timeoutMs elapses while still processing', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ id: 7, status: 'processing' })
    const { result, rerender } = renderHook(() => useTopographyScanStatus(7, 50), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data?.status).toBe('processing'))
    await new Promise((r) => setTimeout(r, 70))
    rerender()
    await waitFor(() => expect(result.current.isTimedOut).toBe(true))
  })
})
