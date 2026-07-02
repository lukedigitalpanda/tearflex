// @vitest-environment node
//
// The project's default vitest environment is jsdom (see vitest.config.ts),
// but jsdom provides its own `Blob` global that is a different constructor
// identity from the undici Blob that `next/server`'s NextRequest/Request
// implementation actually produces from req.blob(). Under jsdom, a genuine
// multipart body Blob fails `instanceof Blob` (wrong realm), so this file
// opts into the node environment where both sides agree on one Blob class.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const proxyJson = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
vi.mock('@/lib/server/proxy', () => ({ proxyJson: (...args: unknown[]) => proxyJson(...args) }))

import { POST } from './route'

beforeEach(() => proxyJson.mockClear())

describe('proxy route body forwarding', () => {
  it('forwards multipart bodies verbatim with their boundary header', async () => {
    const form = new FormData()
    form.append('assessment', '5')
    form.append('stills', new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), 'a.jpg')
    const req = new NextRequest('http://localhost/api/proxy/topography/scans/', {
      method: 'POST',
      body: form,
    })
    await POST(req, { params: { path: ['topography', 'scans'] } })
    const [path, init] = proxyJson.mock.calls[0]
    expect(path).toBe('topography/scans/')
    expect(init.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/)
    expect(init.body).toBeInstanceOf(Blob)
    expect(init.body.size).toBeGreaterThan(0)
  })

  it('keeps forwarding JSON bodies as before', async () => {
    const req = new NextRequest('http://localhost/api/proxy/patients/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ first_name: 'A' }),
    })
    await POST(req, { params: { path: ['patients'] } })
    const [path, init] = proxyJson.mock.calls[0]
    expect(path).toBe('patients/')
    expect(init.headers['content-type']).toBe('application/json')
    expect(typeof init.body).toBe('string')
  })
})
