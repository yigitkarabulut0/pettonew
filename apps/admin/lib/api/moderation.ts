"use client";

import { apiRequest, buildListParams, type AdminListEnvelope } from "@/lib/api/client";
import type { ListState } from "@/lib/api/users";

export type AdminConversation = {
  id: string;
  userAId: string;
  userAName?: string;
  userBId: string;
  userBName?: string;
  lastMessageAt?: string | null;
  messageCount: number;
  muted: boolean;
};

export type AdminMessage = {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderName?: string;
  body: string;
  createdAt: string;
  deletedAt?: string | null;
};

export type AdminMatch = {
  id: string;
  petAId: string;
  petAName?: string;
  petBId: string;
  petBName?: string;
  matchedAt: string;
  lastInteractionAt?: string | null;
};

export type AdminSwipe = {
  id: string;
  actorPetId: string;
  targetPetId: string;
  direction: "like" | "pass" | "super-like";
  createdAt: string;
};

export type AdminBlock = {
  id: string;
  blockerUserId: string;
  blockerName?: string;
  blockedUserId: string;
  blockedName?: string;
  createdAt: string;
};

export async function listAdminConversations(state: ListState = {}) {
  const result = await apiRequest<AdminListEnvelope<AdminConversation> | AdminConversation[]>(
    `/conversations${buildListParams(state)}`
  );
  return Array.isArray(result) ? { data: result, total: result.length } : result;
}

export async function listAdminConversationMessages(conversationId: string, state: ListState = {}) {
  const result = await apiRequest<AdminListEnvelope<AdminMessage> | AdminMessage[]>(
    `/conversations/${conversationId}/messages${buildListParams(state)}`
  );
  return Array.isArray(result) ? { data: result, total: result.length } : result;
}

export async function deleteAdminMessage(conversationId: string, messageId: string) {
  return apiRequest(`/conversations/${conversationId}/messages/${messageId}`, { method: "DELETE" });
}

export async function listAdminMatches(state: ListState = {}) {
  const result = await apiRequest<AdminListEnvelope<AdminMatch> | AdminMatch[]>(
    `/matches${buildListParams(state)}`
  );
  return Array.isArray(result) ? { data: result, total: result.length } : result;
}

export async function deleteAdminMatch(matchId: string, reason?: string) {
  return apiRequest(`/matches/${matchId}`, { method: "DELETE", body: { reason } });
}

export async function listAdminSwipes(state: ListState = {}) {
  const result = await apiRequest<AdminListEnvelope<AdminSwipe> | AdminSwipe[]>(
    `/swipes${buildListParams(state)}`
  );
  return Array.isArray(result) ? { data: result, total: result.length } : result;
}

export async function listAdminBlocks(state: ListState = {}) {
  const result = await apiRequest<AdminListEnvelope<AdminBlock> | AdminBlock[]>(
    `/blocks${buildListParams(state)}`
  );
  return Array.isArray(result) ? { data: result, total: result.length } : result;
}

export async function listAdminVenueCheckIns(state: ListState = {}) {
  return apiRequest<AdminListEnvelope<Record<string, unknown>>>(
    `/venue-check-ins${buildListParams(state)}`
  );
}

export async function deleteAdminVenueCheckIn(id: string) {
  return apiRequest(`/venue-check-ins/${id}`, { method: "DELETE" });
}

export async function listAdminVenueReviews(state: ListState = {}) {
  return apiRequest<AdminListEnvelope<Record<string, unknown>>>(
    `/venue-reviews${buildListParams(state)}`
  );
}

export async function deleteAdminVenueReview(id: string) {
  return apiRequest(`/venue-reviews/${id}`, { method: "DELETE" });
}

export async function listAdminEventRsvps(eventId: string) {
  return apiRequest<AdminListEnvelope<{ userId: string; userName?: string; rsvpAt: string }>>(
    `/events/${eventId}/rsvps`
  );
}

export async function bulkResolveReports(ids: string[], resolution: string, notes?: string) {
  return apiRequest("/reports/bulk-resolve", {
    method: "POST",
    body: { ids, resolution, notes }
  });
}

export async function getReportsStats() {
  return apiRequest<{
    open: number;
    resolved: number;
    dismissed: number;
    byType: Record<string, number>;
    overdue: number;
  }>("/reports/stats");
}
