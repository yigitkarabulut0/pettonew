"use client";

import { apiRequest, buildListParams, type AdminListEnvelope } from "@/lib/api/client";

export type AdminUserRow = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
  cityLabel?: string | null;
  status: string;
  petsCount?: number;
  postsCount?: number;
  reportsCount?: number;
  lastLoginAt?: string | null;
  createdAt: string;
};

export type ListState = {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  filters?: Record<string, string | string[] | undefined>;
};

export async function listAdminUsers(state: ListState = {}) {
  // Prefer new paginated envelope; fall back to legacy array when backend
  // hasn't been upgraded yet.
  const path = `/users${buildListParams(state)}`;
  const result = await apiRequest<AdminListEnvelope<AdminUserRow> | AdminUserRow[]>(path);
  if (Array.isArray(result)) return { data: result, total: result.length } as AdminListEnvelope<AdminUserRow>;
  return result;
}

export async function getAdminUser(userId: string) {
  return apiRequest<AdminUserRow & {
    bio?: string;
    birthDate?: string | null;
    gender?: string | null;
    banHistory?: Array<{ id: string; reason: string; startsAt: string; endsAt?: string | null }>;
  }>(`/users/${userId}`);
}

export async function updateAdminUser(userId: string, patch: Partial<AdminUserRow> & {
  firstName?: string;
  lastName?: string;
  bio?: string;
  cityLabel?: string;
  gender?: string;
  birthDate?: string;
}) {
  return apiRequest(`/users/${userId}`, { method: "PATCH", body: patch });
}

export async function banAdminUser(
  userId: string,
  payload: { reason: string; durationHours?: number; notes?: string }
) {
  return apiRequest(`/users/${userId}/ban`, { method: "POST", body: payload });
}

export async function unbanAdminUser(userId: string, notes?: string) {
  return apiRequest(`/users/${userId}/unban`, { method: "POST", body: { notes } });
}

export async function deleteAdminUser(userId: string) {
  return apiRequest(`/users/${userId}`, { method: "DELETE" });
}

export async function awardBadgeToUser(userId: string, badgeId: string, notes?: string) {
  return apiRequest(`/users/${userId}/award-badge`, {
    method: "POST",
    body: { badgeId, notes }
  });
}
