"use client";

// Reads the `role` + `memberId` we stored in the non-HttpOnly
// `shelter_session` cookie at login time. Client-only helper so UI
// can branch without a round-trip — the API is still authoritative on
// every write.

import { useEffect, useState } from "react";
import type { ShelterMemberRole } from "@petto/contracts";

type SessionPayload = {
  id?: string;
  email?: string;
  name?: string;
  mustChangePassword?: boolean;
  verifiedAt?: string | null;
  role?: ShelterMemberRole;
  memberId?: string;
  memberName?: string;
};

function readSessionCookie(): SessionPayload | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split("; ")
    .find((row) => row.startsWith("shelter_session="));
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw.split("=")[1]!)) as SessionPayload;
  } catch {
    return null;
  }
}

export function useShelterSession() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  useEffect(() => {
    setSession(readSessionCookie());
  }, []);
  return session;
}

/** Convenience: read role once at render time. Returns null until
 * hydrated, so UI that gates on role should treat null as "viewer" for
 * the briefest render, then refresh on hydration. */
export function useShelterRole(): ShelterMemberRole | null {
  const session = useShelterSession();
  return session?.role ?? null;
}

export function shelterRoleAllows(
  have: ShelterMemberRole | null | undefined,
  need: ShelterMemberRole
): boolean {
  const weights: Record<ShelterMemberRole, number> = {
    viewer: 1,
    editor: 2,
    admin: 3
  };
  if (!have) return false;
  return weights[have] >= weights[need];
}
