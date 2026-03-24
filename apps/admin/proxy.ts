import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const cookieName = "petto_admin_session";

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(cookieName)?.value);

  const isAuthRoute = pathname.startsWith("/login");
  const isAssetRoute = pathname.startsWith("/_next") || pathname === "/favicon.ico";

  if (isAssetRoute) {
    return NextResponse.next();
  }

  if (!hasSession && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasSession && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"]
};
