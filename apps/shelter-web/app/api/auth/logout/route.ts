import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("shelter_token");
  cookieStore.delete("shelter_session");
  return NextResponse.json({ ok: true });
}
