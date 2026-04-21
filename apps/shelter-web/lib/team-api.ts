"use client";

// Team management client: authenticated calls go through /api/proxy
// (which server-injects the bearer), public invite-accept endpoints
// hit the API directly since the acceptor has no session yet.

import type {
  ShelterAuditEntry,
  ShelterInviteAcceptSubmission,
  ShelterInviteInfo,
  ShelterInviteSubmission,
  ShelterMember,
  ShelterMemberInvite,
  ShelterMemberRole,
  ShelterSession
} from "@petto/contracts";

// ── Authenticated (hit /api/proxy) ───────────────────────────────

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

async function authedRequest<T>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const url = `/api/proxy${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store"
  });
  let payload: unknown = null;
  if (res.headers.get("content-type")?.includes("json")) {
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
  }
  if (!res.ok) {
    const msg =
      (payload as { error?: string } | null)?.error ??
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  if (payload && typeof payload === "object" && "data" in (payload as object)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export type TeamSnapshot = {
  members: ShelterMember[];
  pendingInvites: ShelterMemberInvite[];
};

export async function fetchTeam(): Promise<TeamSnapshot> {
  return authedRequest<TeamSnapshot>("/members");
}

export type CreateInviteResult = {
  invite: ShelterMemberInvite;
  inviteUrl: string;
};

export async function createInvite(
  submission: ShelterInviteSubmission
): Promise<CreateInviteResult> {
  return authedRequest<CreateInviteResult>("/members/invites", {
    method: "POST",
    body: submission
  });
}

export async function resendInvite(
  inviteId: string
): Promise<CreateInviteResult> {
  return authedRequest<CreateInviteResult>(
    `/members/invites/${inviteId}/resend`,
    { method: "POST" }
  );
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await authedRequest<unknown>(`/members/invites/${inviteId}`, {
    method: "DELETE"
  });
}

export async function updateMemberRole(
  memberId: string,
  role: ShelterMemberRole
): Promise<ShelterMember> {
  return authedRequest<ShelterMember>(`/members/${memberId}`, {
    method: "PATCH",
    body: { role }
  });
}

export async function revokeMember(memberId: string): Promise<void> {
  await authedRequest<unknown>(`/members/${memberId}`, { method: "DELETE" });
}

export async function fetchAuditLog(
  limit: number = 100,
  offset: number = 0
): Promise<ShelterAuditEntry[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset)
  });
  return authedRequest<ShelterAuditEntry[]>(
    `/audit-log?${params.toString()}`
  );
}

// ── Public (direct to API) ───────────────────────────────────────

function apiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  return base.replace(/\/+$/, "");
}

async function publicRequest<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const url = `${apiBase()}/v1/public${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...opts.headers
    },
    cache: "no-store"
  });
  let payload: unknown = null;
  if (res.headers.get("content-type")?.includes("json")) {
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
  }
  if (!res.ok) {
    const msg =
      (payload as { error?: string } | null)?.error ??
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  if (payload && typeof payload === "object" && "data" in (payload as object)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export async function fetchInviteInfo(
  token: string
): Promise<ShelterInviteInfo> {
  return publicRequest<ShelterInviteInfo>(
    `/shelter-invites/${encodeURIComponent(token)}`
  );
}

export async function acceptInvite(
  token: string,
  submission: ShelterInviteAcceptSubmission
): Promise<ShelterSession> {
  return publicRequest<ShelterSession>(
    `/shelter-invites/${encodeURIComponent(token)}/accept`,
    { method: "POST", body: JSON.stringify(submission) }
  );
}

// ── Audit label map ──────────────────────────────────────────────
// Keeps UI copy out of the table itself so translation-friendly.

export const auditActionLabels: Record<string, string> = {
  "member.invite": "invited a new member",
  "member.invite_resend": "resent an invite",
  "member.invite_revoke": "revoked an invite",
  "member.invite_accept": "joined the team",
  "member.role_change": "changed a member role",
  "member.revoke": "revoked a member",
  "member.password_change": "changed password",
  "pet.create": "created a listing",
  "pet.update": "updated a listing",
  "pet.delete": "deleted a listing",
  "pet.status_change": "changed listing status",
  "application.approve": "approved an application",
  "application.reject": "rejected an application",
  "application.complete": "completed an adoption",
  "profile.update": "updated the shelter profile"
};
