// Bridges the invite-accept flow into the same cookie shape the normal
// login route uses, so the rest of the app doesn't have to know there
// are two ways to acquire a session. The client calls the upstream API
// directly with the token + password, then posts the resulting session
// object to this handler to have cookies persisted server-side.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ACCESS_COOKIE = "shelter_token";
const SESSION_COOKIE = "shelter_session";
const MAX_AGE = 60 * 60 * 12;

type AcceptedSession = {
  accessToken?: string;
  mustChangePassword?: boolean;
  shelter?: {
    id?: string;
    email?: string;
    name?: string;
    verifiedAt?: string | null;
  };
  member?: {
    id?: string;
    email?: string;
    name?: string;
    role?: "admin" | "editor" | "viewer";
  };
};

export async function POST(request: Request) {
  let body: AcceptedSession;
  try {
    body = (await request.json()) as AcceptedSession;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.accessToken) {
    return NextResponse.json({ error: "Missing accessToken" }, { status: 400 });
  }
  const cookieStore = await cookies();
  cookieStore.set(ACCESS_COOKIE, body.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE
  });
  cookieStore.set(
    SESSION_COOKIE,
    JSON.stringify({
      id: body.shelter?.id ?? "",
      email: body.shelter?.email ?? body.member?.email ?? "",
      name: body.shelter?.name ?? "",
      mustChangePassword: Boolean(body.mustChangePassword),
      verifiedAt: body.shelter?.verifiedAt ?? null,
      role: body.member?.role ?? "viewer",
      memberId: body.member?.id ?? "",
      memberName: body.member?.name ?? ""
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
