"use client";

export type AdminListEnvelope<T> = {
  data: T[];
  total?: number;
  nextCursor?: string | null;
};

export type AdminSession = {
  id: string;
  email: string;
  name?: string;
  role?: "superadmin" | "moderator" | "support" | string;
};

async function parseError(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return payload?.error ?? response.statusText ?? "Request failed";
  }
  return response.statusText || "Request failed";
}

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const init: RequestInit = { ...rest, headers: { ...(headers ?? {}) } };

  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
    } else {
      (init.headers as Record<string, string>)["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
  }

  // Route every call through Next.js server proxy — token is injected server-side
  // so it never reaches the browser.
  const url = path.startsWith("/api/") ? path : `/api/proxy${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, init);

  if (response.status === 401) {
    // Session expired — bounce to login
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Unauthenticated");
  }

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | { data: T }
    | T
    | null;
  if (payload && typeof payload === "object" && "data" in (payload as object)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export async function apiLogin(email: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Invalid credentials");
  }
}

export async function apiLogout() {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function apiSession(): Promise<AdminSession | null> {
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  if (!response.ok) return null;
  const payload = (await response.json()) as { authenticated: boolean; admin?: AdminSession };
  return payload.authenticated && payload.admin ? payload.admin : null;
}

export function buildListParams(state: {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  filters?: Record<string, string | string[] | undefined>;
}) {
  const sp = new URLSearchParams();
  const pageSize = state.pageSize ?? 20;
  const page = state.page ?? 1;
  sp.set("limit", String(pageSize));
  sp.set("offset", String((page - 1) * pageSize));
  if (state.search) sp.set("q", state.search);
  if (state.sort) sp.set("sort", state.sort);
  for (const [key, value] of Object.entries(state.filters ?? {})) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length > 0) sp.set(key, value.join(","));
    } else {
      sp.set(key, value);
    }
  }
  const str = sp.toString();
  return str ? `?${str}` : "";
}
