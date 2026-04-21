import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ACCESS_COOKIE = "shelter_token";
const SESSION_COOKIE = "shelter_session";
const MAX_AGE = 60 * 60 * 12; // 12h — matches backend shelter token lifetime.

function apiBase() {
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.SHELTER_API_BASE_URL;
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
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  const upstream = await fetch(`${apiBase()}/v1/shelter/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store"
  });

  const payload = (await upstream.json().catch(() => null)) as
    | {
        data?: {
          accessToken: string;
          expiresIn: number;
          mustChangePassword: boolean;
          shelter?: {
            id: string;
            email: string;
            name: string;
            verifiedAt?: string | null;
          };
          member?: {
            id: string;
            email: string;
            name?: string;
            role: "admin" | "editor" | "viewer";
          };
        };
        error?: string;
      }
    | null;

  if (!upstream.ok || !payload?.data?.accessToken) {
    return NextResponse.json(
      { error: payload?.error ?? "Invalid credentials" },
      { status: upstream.status || 401 }
    );
  }

  const { accessToken, shelter, member, mustChangePassword } = payload.data;
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
      id: shelter?.id ?? "",
      email: shelter?.email ?? email,
      name: shelter?.name ?? "",
      mustChangePassword: Boolean(mustChangePassword),
      // verifiedAt drives the dashboard gating UI — absent/null means the
      // shelter still needs to finish verification (shouldn't happen in
      // practice because login only works on verified/approved accounts
      // today, but the gate is here for defence in depth).
      verifiedAt: shelter?.verifiedAt ?? null,
      // v0.15 — team member context. `role` gates UI (Invite button,
      // pet create, audit log); `memberId` lets the client know which
      // member row belongs to the signed-in session so "You" chips
      // render correctly.
      role: member?.role ?? "admin",
      memberId: member?.id ?? "",
      memberName: member?.name ?? ""
    }),
    {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE
    }
  );

  return NextResponse.json({
    ok: true,
    mustChangePassword: Boolean(mustChangePassword)
  });
}
