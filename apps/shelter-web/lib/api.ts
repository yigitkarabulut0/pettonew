"use client";

// Shelter-web client-side API. Every method hits /api/proxy/* which adds
// the Bearer token server-side from the HttpOnly cookie.

import type {
  AdoptionApplication,
  AnalyticsOverview,
  AnalyticsRange,
  ApplicationFunnel,
  ListingPerformanceRow,
  Shelter,
  ShelterPet,
  ShelterStats
} from "@petto/contracts";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `/api/proxy${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers ?? {})
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
    const err =
      (payload as { error?: string } | null)?.error ??
      `Request failed with ${res.status}`;
    throw new Error(err);
  }

  if (payload && typeof payload === "object" && "data" in (payload as object)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export async function apiLogin(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? "Invalid credentials");
  }
  return (await res.json()) as { ok: true; mustChangePassword: boolean };
}

export async function apiLogout() {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function getMySession() {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as {
    session:
      | { id: string; email: string; name: string; mustChangePassword: boolean }
      | null;
  };
}

// ── Shelter profile ───────────────────────────────────────────
export const getMyShelter = () => apiRequest<Shelter>("/me");

export const updateMyShelter = (patch: Partial<Shelter>) =>
  apiRequest<Shelter>("/me", { method: "PUT", body: patch });

export const changeMyPassword = (input: {
  currentPassword: string;
  newPassword: string;
}) => apiRequest<{ updated: boolean }>("/me/password", { method: "POST", body: input });

export const getShelterStats = () => apiRequest<ShelterStats>("/stats");

// ── Pets ──────────────────────────────────────────────────────
export const listShelterPets = (status?: string) =>
  apiRequest<ShelterPet[]>(status ? `/pets?status=${status}` : "/pets");

export const getShelterPet = (id: string) => apiRequest<ShelterPet>(`/pets/${id}`);

export const createShelterPet = (input: Partial<ShelterPet>) =>
  apiRequest<ShelterPet>("/pets", { method: "POST", body: input });

export const updateShelterPet = (id: string, input: Partial<ShelterPet>) =>
  apiRequest<ShelterPet>(`/pets/${id}`, { method: "PUT", body: input });

export const updateShelterPetStatus = (id: string, status: string) =>
  apiRequest<{ status: string }>(`/pets/${id}/status`, {
    method: "PATCH",
    body: { status }
  });

export const deleteShelterPet = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/pets/${id}`, { method: "DELETE" });

// ── Listing wizard / DSA moderation (v0.18) ──────────────────
// The wizard loads `listingConfig` on mount to drive per-step
// validation (blocked species, banned breeds, microchip mode) and
// calls `submitShelterListing` at the end to enter the moderation
// state machine.

export type ListingConfig = {
  operatingCountry: string;
  allowedSpecies: string[];
  prohibitedSpecies: string[];
  bannedBreeds: string[];
  microchipMode: "none" | "advisory" | "required";
  minAgeWeeks: number;
  pregnancyKeywords: string[];
  shelterCityLabel: string;
  shelterLatitude: number;
  shelterLongitude: number;
  shelterVerifiedAt: string;
};

export const getListingConfig = () => apiRequest<ListingConfig>("/listing-config");

export type SubmitListingResult = {
  listing: ShelterPet;
  autoFlagReasons: string[];
  state: "published" | "pending_review";
};

export const submitShelterListing = (id: string) =>
  apiRequest<SubmitListingResult>(`/pets/${id}/submit`, { method: "POST" });

export type AdoptionOutcome = {
  adopterName?: string;
  adoptionDate?: string;
  adoptionNotes?: string;
};

export const transitionShelterListing = (
  id: string,
  action: "pause" | "publish" | "mark_adopted" | "archive" | "restart",
  opts: { note?: string } & AdoptionOutcome = {}
) =>
  apiRequest<ShelterPet>(`/pets/${id}/transition`, {
    method: "POST",
    body: { action, ...opts }
  });

export type BulkActionVerb = "pause" | "mark_adopted" | "archive" | "delete";

export type BulkActionResult = {
  id: string;
  ok: boolean;
  error?: string;
};

export const bulkShelterAction = (action: BulkActionVerb, ids: string[]) =>
  apiRequest<BulkActionResult[]>("/pets/bulk-action", {
    method: "POST",
    body: { action, ids }
  });

export const restoreShelterListing = (id: string) =>
  apiRequest<{ ok: true }>(`/pets/${id}/restore`, { method: "POST" });

// Public shelter profile + listing detail clients removed — that
// surface belongs in the fetcht mobile app (apps/mobile), not in the
// shelter operator tool. The underlying `/v1/public/*` backend
// endpoints remain for that client.

// ── Shelter analytics (v0.22) ─────────────────────────────────────
// Editor+ only; backend enforces. Page renders a gate for viewer role.

export const getAnalyticsOverview = (range: AnalyticsRange) =>
  apiRequest<AnalyticsOverview>(`/analytics/overview?range=${range}`);

export const getAnalyticsListings = (range: AnalyticsRange) =>
  apiRequest<ListingPerformanceRow[]>(`/analytics/listings?range=${range}`);

export const getAnalyticsFunnel = (range: AnalyticsRange) =>
  apiRequest<ApplicationFunnel>(`/analytics/funnel?range=${range}`);

// Export URL is built client-side so the browser downloads directly
// via <a download>; the shelter_token cookie is picked up by the
// Next.js /api/proxy route that fronts the analytics endpoints.
export function buildAnalyticsExportUrl(range: AnalyticsRange): string {
  return `/api/proxy/analytics/export.csv?range=${encodeURIComponent(range)}`;
}

export const duplicateShelterListing = (id: string) =>
  apiRequest<ShelterPet>(`/pets/${id}/duplicate`, { method: "POST" });

// ── Bulk CSV import (v0.19) ──────────────────────────────────
// The client parses + validates CSV rows, then hands them to the
// server in one POST. The server re-validates each row and creates
// drafts for anything that passes; the rest come back in `errors`.

export type BulkImportRowResult = {
  index: number;
  id?: string;
  error?: string;
  flagged?: string[];
  listing?: ShelterPet;
};

export type BulkImportResult = {
  created: BulkImportRowResult[];
  errors: BulkImportRowResult[];
  ignored: number;
};

export const bulkCreateShelterPets = (pets: Partial<ShelterPet>[]) =>
  apiRequest<BulkImportResult>("/pets/bulk", { method: "POST", body: { pets } });

// ── Applications ──────────────────────────────────────────────
export const listShelterApplications = (status?: string) =>
  apiRequest<AdoptionApplication[]>(
    status ? `/applications?status=${status}` : "/applications"
  );

export const getShelterApplication = (id: string) =>
  apiRequest<AdoptionApplication>(`/applications/${id}`);

export const approveApplication = (id: string) =>
  apiRequest<AdoptionApplication>(`/applications/${id}/approve`, { method: "POST" });

export const rejectApplication = (id: string, reason: string) =>
  apiRequest<AdoptionApplication>(`/applications/${id}/reject`, {
    method: "POST",
    body: { reason }
  });

export const completeAdoption = (id: string) =>
  apiRequest<AdoptionApplication>(`/applications/${id}/complete`, { method: "POST" });

// ── Messaging (reuses existing conversation routes via shelter proxy) ──
export const listShelterConversations = () => apiRequest<unknown[]>("/conversations");

// ── Shared catalogue ───────────────────────────────────────────
export type TaxonomyItem = {
  id: string;
  label: string;
  slug: string;
  speciesId?: string;
  isActive: boolean;
  icon?: string;
  color?: string;
};

export const getTaxonomy = (kind: string) =>
  apiRequest<TaxonomyItem[]>(`/taxonomies/${encodeURIComponent(kind)}`);

// ── R2 presign + direct browser upload ───────────────────────────
// Identical flow to the admin panel: ask for a one-shot pre-signed PUT,
// upload the raw bytes from the browser, then store the returned publicUrl.

// Backend (apps/api/internal/server/media_presign.go) returns the public URL
// in the `url` field, not `publicUrl`. The older `publicUrl` alias is kept
// optional so any past response shape still works.
type PresignResult = {
  objectKey: string;
  uploadUrl: string;
  url?: string;
  publicUrl?: string;
};

export const shelterPresignUpload = (fileName: string, mimeType: string, folder: string) =>
  apiRequest<PresignResult>("/media/presign", {
    method: "POST",
    body: { fileName, mimeType, folder }
  });

export async function uploadFileToR2(
  file: File,
  folder: string,
  opts: { onProgress?: (ratio: number) => void } = {}
): Promise<string> {
  const { encodeFileToWebP, putWithProgressAndRetry } = await import("./media");
  const encoded = await encodeFileToWebP(file);
  const base = file.name.replace(/\.[^.]+$/, "") || "upload";
  const canonicalName = `${base}${encoded.extension}`;

  const presign = await shelterPresignUpload(
    canonicalName,
    encoded.mimeType,
    folder
  );
  const publicUrl = presign.url ?? presign.publicUrl;
  if (!publicUrl) throw new Error("Upload succeeded but no public URL returned");

  await putWithProgressAndRetry({
    uploadUrl: presign.uploadUrl,
    publicUrl,
    body: encoded.blob,
    contentType: encoded.mimeType,
    onProgress: opts.onProgress
  });
  return publicUrl;
}
