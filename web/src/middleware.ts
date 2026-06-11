import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has('tf_refresh')
  const isPublicAuth = req.nextUrl.pathname.startsWith('/login') ||
    req.nextUrl.pathname.startsWith('/register') ||
    req.nextUrl.pathname.startsWith('/forgot-password') ||
    req.nextUrl.pathname.startsWith('/reset-password')

  if (!hasSession && !isPublicAuth) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  if (hasSession && req.nextUrl.pathname.startsWith('/login')) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
