import { NextResponse } from 'next/server'
import { fetchWithRefresh, type RefreshTokens } from '@/lib/server/serverFetch'
import { API_BASE, clearAuthCookies, readAuthCookies, setAuthCookies } from '@/lib/server/cookies'

// Serves the report as an HTML document for the in-app viewer.
export async function GET(req: Request, ctx: { params: { id: string } }) {
  const theme = new URL(req.url).searchParams.get('theme') === 'dark' ? '?theme=dark' : ''
  const { access, refresh } = readAuthCookies()
  const rotation: { tokens: RefreshTokens | null } = { tokens: null }
  const res = await fetchWithRefresh(`${API_BASE}/reports/${ctx.params.id}/html/${theme}`, { method: 'GET' }, {
    access, refresh, apiBase: API_BASE, onTokens: (t) => { rotation.tokens = t },
  })
  if (res.status === 401) {
    clearAuthCookies()
    return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 })
  }
  if (!res.ok) return NextResponse.json({ detail: 'Not found.' }, { status: res.status })
  if (rotation.tokens) setAuthCookies(rotation.tokens.access, rotation.tokens.refresh)

  const html = await res.text()
  return new NextResponse(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
}
