import { NextResponse } from 'next/server'
import { fetchWithRefresh, type RefreshTokens } from '@/lib/server/serverFetch'
import { API_BASE, clearAuthCookies, readAuthCookies, setAuthCookies } from '@/lib/server/cookies'

export async function GET(req: Request, ctx: { params: { id: string } }) {
  // ?inline=1 renders the PDF in the browser; otherwise it downloads as a file.
  const inline = new URL(req.url).searchParams.get('inline') === '1'
  const { access, refresh } = readAuthCookies()
  const rotation: { tokens: RefreshTokens | null } = { tokens: null }
  const res = await fetchWithRefresh(`${API_BASE}/reports/${ctx.params.id}/download/`, { method: 'GET' }, {
    access, refresh, apiBase: API_BASE, onTokens: (t) => { rotation.tokens = t },
  })
  if (res.status === 401) {
    clearAuthCookies()
    return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 })
  }
  if (!res.ok) return NextResponse.json({ detail: 'Not found.' }, { status: res.status })
  if (rotation.tokens) setAuthCookies(rotation.tokens.access, rotation.tokens.refresh)

  // Forward the upstream status/content-type rather than assuming 200/application/pdf,
  // so an error page or 204 can never masquerade as a valid PDF.
  const headers = new Headers()
  headers.set('content-type', res.headers.get('content-type') ?? 'application/pdf')
  const contentLength = res.headers.get('content-length')
  if (contentLength) headers.set('content-length', contentLength)
  const disposition = inline ? 'inline' : 'attachment'
  headers.set('content-disposition', `${disposition}; filename="tearflex_report_${ctx.params.id}.pdf"`)
  return new NextResponse(res.body, { status: res.status, headers })
}
