import { NextRequest, NextResponse } from 'next/server'
import { API_BASE, setAuthCookies } from '@/lib/server/cookies'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()
  const res = await fetch(`${API_BASE}/auth/login/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    return NextResponse.json({ detail: 'Invalid credentials.' }, { status: res.status })
  }
  let access: string | undefined
  let refresh: string | undefined
  try {
    ;({ access, refresh } = await res.json())
  } catch {
    return NextResponse.json({ detail: 'Unexpected response from authentication server.' }, { status: 502 })
  }
  if (!access) {
    return NextResponse.json({ detail: 'Authentication server did not return a token.' }, { status: 502 })
  }
  setAuthCookies(access, refresh)
  return NextResponse.json({ ok: true })
}
