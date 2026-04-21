import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const TOKEN_COOKIE = "shelter_token";

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAssetRoute =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth/login") ||
    pathname === "/favicon.ico" ||
    /\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/.test(pathname);

  if (isAssetRoute) return NextResponse.next();

  const hasSession = Boolean(request.cookies.get(TOKEN_COOKIE)?.value);
  // `/apply` is the public shelter onboarding wizard — applicants don't
  // have accounts yet. `/invite/*` is the team-member accept flow —
  // invitees likewise have no session. Both must be reachable without
  // auth.
  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/apply" ||
    pathname.startsWith("/apply/") ||
    pathname === "/invite" ||
    pathname.startsWith("/invite/");

  if (!hasSession && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // Signed-in shelters visiting /login bounce to the dashboard; /apply
  // stays reachable regardless so they can share it with others.
  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/proxy|api/auth|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?)$).*)"
  ]
};
