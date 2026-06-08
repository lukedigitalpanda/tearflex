import { NextResponse } from 'next/server'
import { clearAuthCookies } from '@/lib/server/cookies'

export async function POST() {
  clearAuthCookies()
  return NextResponse.json({ ok: true })
}
