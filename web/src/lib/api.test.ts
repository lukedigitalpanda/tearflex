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
    expect(fetch).toHaveBeenCalledWith('/api/proxy/patients', expect.objectContaining({ method: 'GET', credentials: 'include' }))
  })

  it('strips the trailing slash but keeps the query string (avoids the proxy 308)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 0 }), { status: 200, headers: { 'content-type': 'application/json' } })
    ))
    await api.get('reports/?patient=5')
    expect(fetch).toHaveBeenCalledWith('/api/proxy/reports?patient=5', expect.objectContaining({ method: 'GET' }))
  })

  it('throws ApiError with status + detail on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'nope' }), { status: 400, headers: { 'content-type': 'application/json' } })
    ))
    await expect(api.get('patients/')).rejects.toMatchObject({ status: 400, detail: 'nope' })
    await expect(api.get('patients/')).rejects.toBeInstanceOf(ApiError)
  })
})
