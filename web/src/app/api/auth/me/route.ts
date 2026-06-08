import { proxyJson } from '@/lib/server/proxy'

export async function GET() {
  return proxyJson('auth/me/', { method: 'GET' })
}
