import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("shelter_session")?.value;
  if (!raw) {
    return NextResponse.json({ session: null });
  }
  try {
    return NextResponse.json({ session: JSON.parse(raw) });
  } catch {
    return NextResponse.json({ session: null });
  }
}
