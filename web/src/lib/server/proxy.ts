import { NextResponse } from 'next/server'
import { fetchWithRefresh } from './serverFetch'
import { API_BASE, clearAuthCookies, readAuthCookies, setAuthCookies } from './cookies'

/** Proxy a JSON request to Django `path` (e.g. "patients/"), handling auth + refresh. */
export async function proxyJson(path: string, init: RequestInit) {
  const { access, refresh } = readAuthCookies()
  let rotated: { access: string; refresh?: string } | null = null

  const res = await fetchWithRefresh(`${API_BASE}/${path}`, init, {
    access, refresh, apiBase: API_BASE,
    onTokens: (t) => { rotated = t as { access: string; refresh?: string } },
  })

  if (res.status === 401) {
    clearAuthCookies()
    return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 })
  }

  const contentType = res.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await res.json() : await res.text()
  const out = NextResponse.json(body as object, { status: res.status })
  if (rotated) setAuthCookies((rotated as { access: string; refresh?: string }).access, (rotated as { access: string; refresh?: string }).refresh)
  return out
}
