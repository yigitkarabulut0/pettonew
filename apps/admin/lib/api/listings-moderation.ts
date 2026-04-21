"use client";

import { apiRequest, type AdminListEnvelope } from "./client";
import type {
  ListingReport,
  ListingReportResolution,
  ListingRejectionCode,
  ListingState,
  ListingStateTransition,
  ListingStatementOfReasons,
  ListingStrikeSummary,
  ShelterPet
} from "@petto/contracts";

export type ListingQueueTab =
  | "pending_review"
  | "published"
  | "paused"
  | "adopted"
  | "archived"
  | "rejected"
  | "all";

export type ListingReportTab = "open" | "trusted" | "all" | "dismissed" | "warned" | "removed" | "suspended";

export type AdminListingDetail = {
  listing: ShelterPet;
  transitions: ListingStateTransition[];
  statementsOfReasons: ListingStatementOfReasons[];
};

export async function listAdminListings(state: ListingQueueTab = "pending_review", limit = 50, offset = 0) {
  const stateParam = state === "all" ? "all" : state;
  const params = new URLSearchParams({
    state: stateParam,
    limit: String(limit),
    offset: String(offset)
  });
  // Backend returns { data, total, state } — not wrapped in "data" twice.
  // We bypass the default unwrap by hitting the envelope directly.
  const res = await fetch(`/api/proxy/listings?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load listings queue (${res.status})`);
  return (await res.json()) as { data: ShelterPet[]; total: number; state: ListingState };
}

export async function getAdminListingDetail(listingId: string) {
  return apiRequest<AdminListingDetail>(`/listings/${listingId}`);
}

export async function approveAdminListing(listingId: string) {
  return apiRequest<ShelterPet>(`/listings/${listingId}/approve`, { method: "POST" });
}

export async function rejectAdminListing(
  listingId: string,
  reasonCode: ListingRejectionCode,
  noteToShelter: string,
  internalNote: string
) {
  return apiRequest<ShelterPet>(`/listings/${listingId}/reject`, {
    method: "POST",
    body: { reasonCode, noteToShelter, internalNote }
  });
}

export async function listAdminListingReports(tab: ListingReportTab = "open", limit = 50, offset = 0) {
  const params = new URLSearchParams();
  if (tab === "trusted") {
    params.set("status", "open");
    params.set("trusted", "1");
  } else if (tab === "all") {
    params.set("status", "all");
  } else {
    params.set("status", tab);
  }
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  const res = await fetch(`/api/proxy/listing-reports?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load listing reports (${res.status})`);
  return (await res.json()) as { data: ListingReport[]; total: number };
}

export async function resolveAdminListingReport(
  reportId: string,
  resolution: ListingReportResolution,
  note: string
) {
  return apiRequest<{ ok: true }>(`/listing-reports/${reportId}/resolve`, {
    method: "POST",
    body: { resolution, note }
  });
}

export async function getShelterStrikes(shelterId: string) {
  return apiRequest<ListingStrikeSummary>(`/shelters/${shelterId}/strikes`);
}

export async function suspendShelter(shelterId: string, reason: string) {
  return apiRequest<{ ok: true }>(`/shelters/${shelterId}/suspend`, {
    method: "POST",
    body: { reason }
  });
}

export const REJECTION_CODES: { value: ListingRejectionCode; label: string; hint: string }[] = [
  { value: "banned_breed", label: "Banned breed", hint: "Breed is restricted in the shelter's jurisdiction." },
  { value: "prohibited_species", label: "Prohibited species", hint: "Reptile / exotic / farm / equine — out of scope." },
  { value: "under_age", label: "Under 8 weeks", hint: "Animal is too young to be separated from parent." },
  { value: "welfare_concern", label: "Animal welfare concern", hint: "Evidence of neglect, illness, or mistreatment." },
  { value: "inaccurate_info", label: "False or misleading info", hint: "Description or breed doesn't match the animal." },
  { value: "fraud_suspected", label: "Suspected fraud", hint: "Shelter or listing appears to be a scam." },
  { value: "duplicate", label: "Duplicate listing", hint: "Same animal is already listed elsewhere." },
  { value: "policy_violation", label: "Other policy violation", hint: "Use the note to explain." }
];

export const STATE_LABELS: Record<ListingState, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  published: "Published",
  paused: "Paused",
  adopted: "Adopted",
  archived: "Archived",
  rejected: "Rejected"
};

export const STATE_TONES: Record<ListingState, "neutral" | "warning" | "success" | "info" | "danger" | "muted"> = {
  draft: "muted",
  pending_review: "warning",
  published: "success",
  paused: "info",
  adopted: "info",
  archived: "muted",
  rejected: "danger"
};

export const AUTO_FLAG_LABELS: Record<string, string> = {
  banned_breed: "Banned breed (jurisdiction)",
  prohibited_species: "Prohibited species",
  under_age: "Under 8 weeks",
  banned_breed_keyword: "Breed keyword in text",
  pregnancy_keyword: "Pregnancy keyword"
};

export const RESOLUTION_LABELS: Record<ListingReportResolution, string> = {
  dismiss: "Dismiss",
  warn: "Warn shelter",
  remove: "Remove listing",
  suspend: "Suspend shelter"
};
