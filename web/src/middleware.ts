import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has('tf_refresh')
  const isLogin = req.nextUrl.pathname.startsWith('/login')

  if (!hasSession && !isLogin) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  if (hasSession && isLogin) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
