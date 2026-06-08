import { NextResponse } from 'next/server'
import { fetchWithRefresh, type RefreshTokens } from './serverFetch'
import { API_BASE, clearAuthCookies, readAuthCookies, setAuthCookies } from './cookies'

/** Read a response body as JSON, tolerating empty/malformed bodies (gateway errors). */
async function safeParse(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') || ''
  const text = await res.text()
  if (!text) return { detail: `Upstream returned ${res.status}.` }
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text)
    } catch {
      return { detail: `Malformed response from upstream (${res.status}).` }
    }
  }
  return text
}

/** Proxy a JSON request to Django `path` (e.g. "patients/"), handling auth + refresh. */
export async function proxyJson(path: string, init: RequestInit) {
  const { access, refresh } = readAuthCookies()
  // Holder (not a bare `let`) so the closure assignment survives TS control-flow narrowing.
  const rotation: { tokens: RefreshTokens | null } = { tokens: null }

  const res = await fetchWithRefresh(`${API_BASE}/${path}`, init, {
    access, refresh, apiBase: API_BASE,
    onTokens: (t) => { rotation.tokens = t },
  })

  if (res.status === 401) {
    // Fail closed: a 401 even after a refresh attempt means the session is dead.
    // We intentionally discard any rotated token here rather than risk a refresh loop.
    clearAuthCookies()
    return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 })
  }

  const body = await safeParse(res)
  const out = NextResponse.json(body as object, { status: res.status })
  if (rotation.tokens) setAuthCookies(rotation.tokens.access, rotation.tokens.refresh)
  return out
}
