import { describe, expect, it, vi, beforeEach } from 'vitest'
import { api, ApiError } from './api'

beforeEach(() => { vi.restoreAllMocks() })

describe('api', () => {
  it('GET hits the proxy and returns json', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), { status: 200, headers: { 'content-type': 'application/json' } })
    ))
    const data = await api.get<{ id: number }>('patients/')
    expect(data.id).toBe(1)
    expect(fetch).toHaveBeenCalledWith('/api/proxy/patients/', expect.objectContaining({ method: 'GET', credentials: 'include' }))
  })

  it('throws ApiError with status + detail on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'nope' }), { status: 400, headers: { 'content-type': 'application/json' } })
    ))
    await expect(api.get('patients/')).rejects.toMatchObject({ status: 400, detail: 'nope' })
    await expect(api.get('patients/')).rejects.toBeInstanceOf(ApiError)
  })
})
