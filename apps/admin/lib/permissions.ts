"use client";

import * as React from "react";

import { apiSession, type AdminSession } from "@/lib/api/client";

export type AdminRole = "superadmin" | "moderator" | "support";

export const ROLE_ORDER: Record<AdminRole, number> = {
  superadmin: 3,
  moderator: 2,
  support: 1
};

export function hasRole(session: AdminSession | null, required: AdminRole) {
  if (!session) return false;
  const role = (session.role ?? "support") as AdminRole;
  return (ROLE_ORDER[role] ?? 0) >= (ROLE_ORDER[required] ?? 0);
}

export function useAdminSession() {
  const [session, setSession] = React.useState<AdminSession | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    apiSession()
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { session, loading };
}
