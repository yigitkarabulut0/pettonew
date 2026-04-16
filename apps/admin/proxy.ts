import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const TOKEN_COOKIE = "admin_token";
const LEGACY_COOKIE = "petto_admin_session";

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAssetRoute =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth/login") ||
    pathname === "/favicon.ico" ||
    /\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/.test(pathname);

  if (isAssetRoute) return NextResponse.next();

  const hasSession =
    Boolean(request.cookies.get(TOKEN_COOKIE)?.value) ||
    Boolean(request.cookies.get(LEGACY_COOKIE)?.value);

  const isAuthRoute = pathname.startsWith("/login");

  if (!hasSession && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasSession && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/proxy|api/auth|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?)$).*)"]
};
