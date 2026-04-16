import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session")?.value;
  const token = cookieStore.get("admin_token")?.value;

  if (!session || !token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const parsed = JSON.parse(session) as {
      id: string;
      email: string;
      name?: string;
      role?: string;
    };
    return NextResponse.json({ authenticated: true, admin: parsed });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
