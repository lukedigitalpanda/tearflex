export class ApiError extends Error {
  constructor(public status: number, public detail: string, public body?: unknown) {
    super(detail)
    this.name = 'ApiError'
  }
}

const BASE = '/api/proxy'

// API paths use DRF's trailing-slash convention (e.g. "reports/"). Sending that
// slash to the proxy makes Next.js (trailingSlash: false) answer with a 308
// redirect, doubling every request's round-trips. Strip the trailing slash from
// the path here (keeping the query string); the proxy re-adds it for the
// backend, so Django still sees the canonical "reports/" URL.
function toProxyUrl(path: string): string {
  const [pathPart, query] = path.split('?')
  const trimmed = pathPart.replace(/\/+$/, '')
  return `${BASE}/${trimmed}${query ? `?${query}` : ''}`
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(toProxyUrl(path), { credentials: 'include', ...init })
  const ct = res.headers.get('content-type') || ''
  // Read the body from a clone so `res` itself stays unconsumed (keeps the unit
  // tests, which reuse a single mocked Response across calls, working).
  const clone = res.clone()
  const body = ct.includes('application/json') ? await clone.json() : await clone.text()
  if (!res.ok) {
    const detail = (body && typeof body === 'object' && 'detail' in body)
      ? String((body as { detail: unknown }).detail)
      : `Request failed (${res.status})`
    throw new ApiError(res.status, detail, body)
  }
  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data ?? {}) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postMultipart: <T>(path: string, fields: Record<string, string | Blob | Blob[]>) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value)) for (const item of value) form.append(key, item)
      else form.append(key, value)
    }
    return request<T>(path, { method: 'POST', body: form })
  },
}
