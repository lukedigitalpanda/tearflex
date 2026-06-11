import { NextRequest, NextResponse } from 'next/server'
import { API_BASE, setAuthCookies } from '@/lib/server/cookies'

export async function POST(req: NextRequest) {
  const { token, password } = await req.json()
  const res = await fetch(`${API_BASE}/auth/register/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: 'Registration failed.' }))
    return NextResponse.json(body, { status: res.status })
  }
  let access: string | undefined
  let refresh: string | undefined
  try {
    ;({ access, refresh } = await res.json())
  } catch {
    return NextResponse.json({ detail: 'Unexpected response from server.' }, { status: 502 })
  }
  if (!access) {
    return NextResponse.json({ detail: 'Server did not return a token.' }, { status: 502 })
  }
  setAuthCookies(access, refresh)
  return NextResponse.json({ ok: true })
}
