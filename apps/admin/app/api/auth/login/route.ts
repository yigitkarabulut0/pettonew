import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ACCESS_COOKIE = "admin_token";
const SESSION_COOKIE = "admin_session";
const MAX_AGE = 60 * 60 * 8; // 8h — matches backend admin token lifetime

function apiBase() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.ADMIN_API_BASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  return base.replace(/\/+$/, "");
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const upstream = await fetch(`${apiBase()}/v1/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store"
  });

  const payload = (await upstream.json().catch(() => null)) as
    | { data?: { accessToken: string; expiresIn: number; admin?: { id: string; email: string; name?: string; role?: string } }; error?: string }
    | null;

  if (!upstream.ok || !payload?.data?.accessToken) {
    return NextResponse.json(
      { error: payload?.error ?? "Invalid credentials" },
      { status: upstream.status || 401 }
    );
  }

  const { accessToken, admin } = payload.data;
  const cookieStore = await cookies();

  cookieStore.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE
  });

  cookieStore.set(
    SESSION_COOKIE,
    JSON.stringify({
      id: admin?.id ?? "",
      email: admin?.email ?? email,
      name: admin?.name ?? "",
      role: admin?.role ?? "superadmin"
    }),
    {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE
    }
  );

  return NextResponse.json({ ok: true });
}
