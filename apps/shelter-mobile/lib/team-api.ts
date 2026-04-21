// Mobile team API — authenticated + public surfaces for member
// management. The authed paths reuse the shelter session token; the
// public paths (invite info + accept) go direct to the API since
// invitees have no session yet.

import AsyncStorage from "@react-native-async-storage/async-storage";
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

import { TOKEN_KEY } from "@/lib/api";

function apiBase(): string {
  const base = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base) throw new Error("EXPO_PUBLIC_API_BASE_URL is not configured");
  return base;
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

async function authedRequest<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${apiBase()}/v1/shelter${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.body ? { "Content-Type": "application/json" } : {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
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

async function publicRequest<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${apiBase()}/v1/public${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
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

// ── Authenticated ───────────────────────────────────────────────

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
  await authedRequest(`/members/invites/${inviteId}`, { method: "DELETE" });
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
  await authedRequest(`/members/${memberId}`, { method: "DELETE" });
}

export async function fetchAuditLog(
  limit: number = 100,
  offset: number = 0
): Promise<ShelterAuditEntry[]> {
  return authedRequest<ShelterAuditEntry[]>(
    `/audit-log?limit=${limit}&offset=${offset}`
  );
}

// ── Public ──────────────────────────────────────────────────────

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
    { method: "POST", body: submission }
  );
}

// ── Audit label map (parity with web) ──────────────────────────

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
