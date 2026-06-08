import { describe, expect, it, vi } from 'vitest'
import { fetchWithRefresh } from './serverFetch'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

describe('fetchWithRefresh', () => {
  it('passes through a successful response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    const onTokens = vi.fn()
    const res = await fetchWithRefresh('http://api/x', {}, {
      access: 'a1', refresh: 'r1', apiBase: 'http://api', fetchImpl, onTokens,
    })
    expect(res.status).toBe(200)
    expect(onTokens).not.toHaveBeenCalled()
  })

  it('refreshes on 401, retries once, and reports rotated tokens', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { access: 'a2', refresh: 'r2' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    const onTokens = vi.fn()
    const res = await fetchWithRefresh('http://api/x', {}, {
      access: 'a1', refresh: 'r1', apiBase: 'http://api', fetchImpl, onTokens,
    })
    expect(res.status).toBe(200)
    expect(onTokens).toHaveBeenCalledWith({ access: 'a2', refresh: 'r2' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('returns 401 when refresh fails', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'invalid refresh' }))
    const onTokens = vi.fn()
    const res = await fetchWithRefresh('http://api/x', {}, {
      access: 'a1', refresh: 'r1', apiBase: 'http://api', fetchImpl, onTokens,
    })
    expect(res.status).toBe(401)
    expect(onTokens).not.toHaveBeenCalled()
  })
})
