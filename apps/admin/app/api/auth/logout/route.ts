import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("admin_token");
  cookieStore.delete("admin_session");
  cookieStore.delete("petto_admin_session"); // legacy
  return NextResponse.json({ ok: true });
}
