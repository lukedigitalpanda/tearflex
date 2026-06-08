import { NextRequest } from 'next/server'
import { proxyJson } from '@/lib/server/proxy'

function buildPath(req: NextRequest, path: string[]) {
  const qs = req.nextUrl.search
  return `${path.join('/')}/${qs}`
}

async function handle(req: NextRequest, path: string[]) {
  const method = req.method
  const hasBody = method !== 'GET' && method !== 'DELETE'
  return proxyJson(buildPath(req, path), {
    method,
    headers: hasBody ? { 'content-type': 'application/json' } : undefined,
    body: hasBody ? await req.text() : undefined,
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
