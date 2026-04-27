"use client";

import { apiRequest, buildListParams, type AdminListEnvelope } from "@/lib/api/client";
import type { ListState } from "@/lib/api/users";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warn" | "critical";
  startsAt: string;
  endsAt?: string | null;
  targetSegment?: Record<string, unknown> | null;
  createdAt: string;
};

export type FeatureFlag = {
  key: string;
  enabled: boolean;
  description?: string;
  payload?: Record<string, unknown> | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
};

export type AuditLog = {
  id: string;
  actorAdminId: string;
  actorName?: string;
  action: string;
  entityType: string;
  entityId?: string;
  payload?: Record<string, unknown> | null;
  createdAt: string;
};

export type AdminBadge = {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  criteria?: string;
  active: boolean;
  awardedCount?: number;
};

export type AdminAccount = {
  id: string;
  email: string;
  name?: string;
  role: "superadmin" | "moderator" | "support";
  status?: string;
  lastLoginAt?: string | null;
  createdAt: string;
};

export async function listAnnouncements(state: ListState = {}) {
  const result = await apiRequest<AdminListEnvelope<Announcement> | Announcement[]>(
    `/announcements${buildListParams(state)}`
  );
  return Array.isArray(result) ? { data: result, total: result.length } : result;
}

export async function createAnnouncement(input: Omit<Announcement, "id" | "createdAt">) {
  return apiRequest<Announcement>("/announcements", { method: "POST", body: input });
}

export async function updateAnnouncement(id: string, patch: Partial<Announcement>) {
  return apiRequest<Announcement>(`/announcements/${id}`, { method: "PATCH", body: patch });
}

export async function deleteAnnouncement(id: string) {
  return apiRequest(`/announcements/${id}`, { method: "DELETE" });
}

export async function listFeatureFlags() {
  const result = await apiRequest<AdminListEnvelope<FeatureFlag> | FeatureFlag[]>("/feature-flags");
  return Array.isArray(result) ? { data: result, total: result.length } : result;
}

export async function updateFeatureFlag(key: string, patch: Partial<FeatureFlag>) {
  return apiRequest<FeatureFlag>(`/feature-flags/${key}`, { method: "PUT", body: patch });
}

export async function listAuditLogs(state: ListState = {}) {
  const result = await apiRequest<AdminListEnvelope<AuditLog> | AuditLog[]>(
    `/audit-logs${buildListParams(state)}`
  );
  return Array.isArray(result) ? { data: result, total: result.length } : result;
}

export async function listAdmins() {
  const result = await apiRequest<AdminListEnvelope<AdminAccount> | AdminAccount[]>("/admins");
  return Array.isArray(result) ? { data: result, total: result.length } : result;
}

export async function createAdminAccount(input: { email: string; name?: string; password: string; role: AdminAccount["role"] }) {
  return apiRequest<AdminAccount>("/admins", { method: "POST", body: input });
}

export async function updateAdminAccount(id: string, patch: Partial<AdminAccount>) {
  return apiRequest<AdminAccount>(`/admins/${id}`, { method: "PATCH", body: patch });
}

export async function resetAdminPassword(id: string, newPassword: string) {
  return apiRequest(`/admins/${id}/reset-password`, {
    method: "POST",
    body: { password: newPassword }
  });
}

export async function deleteAdminAccount(id: string) {
  return apiRequest(`/admins/${id}`, { method: "DELETE" });
}

export async function listAdminBadges(state: ListState = {}) {
  const result = await apiRequest<AdminListEnvelope<AdminBadge> | AdminBadge[]>(
    `/badges${buildListParams(state)}`
  );
  return Array.isArray(result) ? { data: result, total: result.length } : result;
}

export async function createAdminBadge(input: Omit<AdminBadge, "id" | "awardedCount">) {
  return apiRequest<AdminBadge>("/badges", { method: "POST", body: input });
}

export async function updateAdminBadge(id: string, patch: Partial<AdminBadge>) {
  return apiRequest<AdminBadge>(`/badges/${id}`, { method: "PUT", body: patch });
}

export async function deleteAdminBadge(id: string) {
  return apiRequest(`/badges/${id}`, { method: "DELETE" });
}

export type BroadcastSegment =
  | { audience: "all" }
  | { audience: "pet_type"; petTypes: string[] }
  | { audience: "users"; userIds: string[] };

export async function sendBroadcast(input: {
  title: string;
  body: string;
  segment: BroadcastSegment;
  deepLink?: string;
}) {
  return apiRequest<{ recipientCount: number; deliveredCount: number }>(
    "/broadcast",
    { method: "POST", body: input }
  );
}

export async function getDashboardMetrics() {
  return apiRequest<{
    dau: number;
    wau: number;
    mau: number;
    signupsToday: number;
    pets: number;
    posts24h: number;
    reportsOpen: number;
    reportsOverdue: number;
  }>("/dashboard/metrics");
}
