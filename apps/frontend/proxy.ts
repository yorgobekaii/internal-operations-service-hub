import { NextRequest, NextResponse } from 'next/server';

const ROLE_PICKER_PATH = '/select-role';

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const actorId = request.cookies.get('x-user-id')?.value.trim();
  const hasActor = Boolean(actorId);

  if (!hasActor && pathname !== ROLE_PICKER_PATH) {
    return NextResponse.redirect(new URL(ROLE_PICKER_PATH, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
