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

  it('postMultipart builds FormData, posts to the proxy, and omits content-type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 7 }), { status: 201, headers: { 'content-type': 'application/json' } })
    )
    vi.stubGlobal('fetch', fetchMock)
    const blob = new Blob(['x'], { type: 'video/mp4' })
    const data = await api.postMultipart<{ id: number }>('assessments/captures/', { assessment: '3', source: 'upload', video_file: blob })
    expect(data.id).toBe(7)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/proxy/assessments/captures')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('assessment')).toBe('3')
    expect((init.body as FormData).get('video_file')).toBeInstanceOf(Blob)
    // No forced content-type (browser sets the multipart boundary)
    expect(init.headers?.['content-type']).toBeUndefined()
  })

  it('postMultipart appends array values as repeated form keys', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 7 }), { status: 201, headers: { 'content-type': 'application/json' } })
    )
    vi.stubGlobal('fetch', fetchMock)
    const a = new Blob(['a'])
    const b = new Blob(['b'])
    await api.postMultipart('topography/scans/', { assessment: '5', stills: [a, b] })
    const [, init] = fetchMock.mock.calls[0]
    const body = init.body as FormData
    expect(body.getAll('stills')).toHaveLength(2)
    expect(body.get('assessment')).toBe('5')
  })
})
