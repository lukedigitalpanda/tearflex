import { cookies } from 'next/headers'

export const ACCESS_COOKIE = 'tf_access'
export const REFRESH_COOKIE = 'tf_refresh'

const baseOptions = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

export function setAuthCookies(access: string, refresh?: string) {
  const store = cookies()
  store.set(ACCESS_COOKIE, access, { ...baseOptions, maxAge: 60 * 55 })
  if (refresh) store.set(REFRESH_COOKIE, refresh, { ...baseOptions, maxAge: 60 * 60 * 24 * 7 })
}

export function clearAuthCookies() {
  const store = cookies()
  store.delete(ACCESS_COOKIE)
  store.delete(REFRESH_COOKIE)
}

export function readAuthCookies() {
  const store = cookies()
  return {
    access: store.get(ACCESS_COOKIE)?.value,
    refresh: store.get(REFRESH_COOKIE)?.value,
  }
}

export const API_BASE = process.env.API_URL ?? 'http://localhost:8000/api'
