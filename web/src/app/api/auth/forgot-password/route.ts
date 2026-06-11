import { NextRequest, NextResponse } from 'next/server'
import { API_BASE } from '@/lib/server/cookies'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const res = await fetch(`${API_BASE}/auth/password-reset/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
