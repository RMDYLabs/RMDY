import { NextResponse, type NextRequest } from 'next/server';
import { securityHeaders } from './security-headers';

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  for (const header of securityHeaders) response.headers.set(header.key, header.value);
  if (request.nextUrl.pathname.endsWith('.tgz')) {
    response.headers.set('Content-Type', 'application/gzip');
    response.headers.set('Content-Disposition', 'attachment; filename="rmdy-0.6.0.tgz"');
  }
  return response;
}

export const config = {
  matcher: '/:path*',
};
