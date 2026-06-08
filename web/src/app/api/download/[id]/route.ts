import { NextResponse } from 'next/server'
import { fetchWithRefresh } from '@/lib/server/serverFetch'
import { API_BASE, clearAuthCookies, readAuthCookies, setAuthCookies } from '@/lib/server/cookies'

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const { access, refresh } = readAuthCookies()
  let rotated: { access: string; refresh?: string } | null = null
  const res = await fetchWithRefresh(`${API_BASE}/reports/${ctx.params.id}/download/`, { method: 'GET' }, {
    access, refresh, apiBase: API_BASE, onTokens: (t) => { rotated = t as { access: string; refresh?: string } },
  })
  if (res.status === 401) { clearAuthCookies(); return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 }) }
  if (!res.ok) return NextResponse.json({ detail: 'Not found.' }, { status: res.status })
  if (rotated) setAuthCookies((rotated as { access: string; refresh?: string }).access, (rotated as { access: string; refresh?: string }).refresh)
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="tearflex_report_${ctx.params.id}.pdf"`,
    },
  })
}
