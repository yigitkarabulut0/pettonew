// Shelter-web API proxy.
//
// The shelter bearer token lives in an HttpOnly cookie named `shelter_token`
// so the browser can never read it. Every client-side request hits
// /api/proxy/<subpath>, which rewrites to the real API under
// /v1/shelter/<subpath> with the bearer attached server-side.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

function apiBase() {
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.SHELTER_API_BASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  return base.replace(/\/+$/, "");
}

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get("shelter_token")?.value;

  const { path } = await context.params;
  const subpath = (path ?? []).join("/");
  const isAuthEndpoint = subpath.startsWith("auth/");

  if (!token && !isAuthEndpoint) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const search = request.nextUrl.search;
  const targetUrl = `${apiBase()}/v1/shelter/${subpath}${search}`;

  const forwardHeaders = new Headers();
  if (token) forwardHeaders.set("Authorization", `Bearer ${token}`);
  const contentType = request.headers.get("content-type");
  if (contentType) forwardHeaders.set("Content-Type", contentType);
  const accept = request.headers.get("accept");
  if (accept) forwardHeaders.set("Accept", accept);

  let body: BodyInit | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > 0) body = buffer;
  }

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: forwardHeaders,
    body,
    cache: "no-store",
    redirect: "manual"
  });

  const resHeaders = new Headers();
  const upstreamContentType = upstream.headers.get("content-type");
  if (upstreamContentType) resHeaders.set("Content-Type", upstreamContentType);
  // Pass through Content-Disposition so CSV/file downloads (analytics
  // export, future reports) carry their `attachment; filename=…` hint.
  const disposition = upstream.headers.get("content-disposition");
  if (disposition) resHeaders.set("Content-Disposition", disposition);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
