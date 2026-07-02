import { NextRequest } from 'next/server'
import { proxyJson } from '@/lib/server/proxy'

function buildPath(req: NextRequest, path: string[]) {
  const qs = req.nextUrl.search
  return `${path.join('/')}/${qs}`
}

async function handle(req: NextRequest, path: string[]) {
  const method = req.method
  const hasBody = method !== 'GET' && method !== 'DELETE'
  if (!hasBody) return proxyJson(buildPath(req, path), { method })
  const contentType = req.headers.get('content-type') ?? 'application/json'
  if (contentType.includes('multipart/form-data')) {
    // Binary passthrough: the boundary lives in the original header, and the
    // body must not be text-decoded (image/video bytes are not valid UTF-8).
    // A Blob (not a stream) keeps the body re-sendable if fetchWithRefresh
    // retries after a token refresh.
    return proxyJson(buildPath(req, path), {
      method,
      headers: { 'content-type': contentType },
      body: await req.blob(),
    })
  }
  return proxyJson(buildPath(req, path), {
    method,
    headers: { 'content-type': 'application/json' },
    body: await req.text(),
  })
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return handle(req, ctx.params.path)
}
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return handle(req, ctx.params.path)
}
export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return handle(req, ctx.params.path)
}
export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return handle(req, ctx.params.path)
}
