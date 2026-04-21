// Shelter mobile API client. Hits /v1/shelter/* endpoints with the
// bearer token stored in the zustand session store.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  AdoptionApplication,
  Conversation,
  Message,
  Shelter,
  ShelterPet,
  ShelterStats
} from "@petto/contracts";

export const TOKEN_KEY = "shelter_token";
export const SESSION_KEY = "shelter_session";

function apiBase(): string {
  const base = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base) throw new Error("EXPO_PUBLIC_API_BASE_URL is not configured");
  return base;
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body) headers["Content-Type"] = "application/json";
  if (opts.auth !== false) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${apiBase()}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const err = (payload as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new Error(err);
  }

  if (payload && typeof payload === "object" && "data" in (payload as object)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

// ── Auth ──────────────────────────────────────────────────────
export async function shelterLogin(email: string, password: string) {
  return request<{
    shelter: Shelter;
    member?: import("@petto/contracts").ShelterMember;
    accessToken: string;
    expiresIn: number;
    mustChangePassword: boolean;
  }>("/v1/shelter/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false
  });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return request<{ updated: boolean }>("/v1/shelter/me/password", {
    method: "POST",
    body: { currentPassword, newPassword }
  });
}

// ── Profile ───────────────────────────────────────────────────
export const getMyShelter = () => request<Shelter>("/v1/shelter/me");
export const updateMyShelter = (patch: Partial<Shelter>) =>
  request<Shelter>("/v1/shelter/me", { method: "PUT", body: patch });
export const getShelterStats = () => request<ShelterStats>("/v1/shelter/stats");

// ── Pets ──────────────────────────────────────────────────────
export const listShelterPets = (status?: string) =>
  request<ShelterPet[]>(status ? `/v1/shelter/pets?status=${status}` : "/v1/shelter/pets");

export const getShelterPet = (id: string) =>
  request<ShelterPet>(`/v1/shelter/pets/${id}`);

export const createShelterPet = (input: Partial<ShelterPet>) =>
  request<ShelterPet>("/v1/shelter/pets", { method: "POST", body: input });

export const updateShelterPet = (id: string, input: Partial<ShelterPet>) =>
  request<ShelterPet>(`/v1/shelter/pets/${id}`, { method: "PUT", body: input });

export const updateShelterPetStatus = (id: string, status: string) =>
  request<{ status: string }>(`/v1/shelter/pets/${id}/status`, {
    method: "PATCH",
    body: { status }
  });

export const deleteShelterPet = (id: string) =>
  request<{ deleted: boolean }>(`/v1/shelter/pets/${id}`, { method: "DELETE" });

// ── Listing lifecycle & moderation (v0.17+) ───────────────────
// Listing-state transitions, wizard support, bulk ops, restore.
// Mirrors the shelter-web API client so operators have parity
// between desktop and phone.

export type SubmitListingResult = {
  listing: ShelterPet;
  autoFlagReasons: string[];
  state: "published" | "pending_review";
};

export const submitShelterListing = (id: string) =>
  request<SubmitListingResult>(`/v1/shelter/pets/${id}/submit`, { method: "POST" });

export type ListingTransitionAction =
  | "pause"
  | "publish"
  | "mark_adopted"
  | "archive"
  | "restart";

export type AdoptionOutcome = {
  adopterName?: string;
  adoptionDate?: string;
  adoptionNotes?: string;
};

export const transitionShelterListing = (
  id: string,
  action: ListingTransitionAction,
  opts: { note?: string } & AdoptionOutcome = {}
) =>
  request<ShelterPet>(`/v1/shelter/pets/${id}/transition`, {
    method: "POST",
    body: { action, ...opts }
  });

export const duplicateShelterListing = (id: string) =>
  request<ShelterPet>(`/v1/shelter/pets/${id}/duplicate`, { method: "POST" });

export const restoreShelterListing = (id: string) =>
  request<{ ok: true }>(`/v1/shelter/pets/${id}/restore`, { method: "POST" });

export type BulkActionVerb = "pause" | "mark_adopted" | "archive" | "delete";

export type BulkActionResult = {
  id: string;
  ok: boolean;
  error?: string;
};

export const bulkShelterAction = (action: BulkActionVerb, ids: string[]) =>
  request<BulkActionResult[]>(`/v1/shelter/pets/bulk-action`, {
    method: "POST",
    body: { action, ids }
  });

// Wizard + jurisdiction config powered by the backend.
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

export const getListingConfig = () =>
  request<ListingConfig>("/v1/shelter/listing-config");

// ── Analytics (v0.22) ────────────────────────────────────────
export type AnalyticsRange = "30d" | "90d" | "12m" | "all";

export type ListingPerformanceRow = {
  listingId: string;
  name: string;
  species: string;
  listingState: string;
  views: number;
  saves: number;
  applications: number;
  adoptions: number;
  daysListed: number;
};

export type ApplicationFunnel = {
  submitted: number;
  underReview: number;
  approved: number;
  adopted: number;
};

export type AnalyticsOverview = {
  range: AnalyticsRange;
  activeListings: number;
  adoptionsThisMonth: number;
  adoptionsThisYear: number;
  avgDaysToAdoption: number;
  avgSampleSize: number;
  topListing?: {
    id: string;
    name: string;
    applicationCount: number;
  } | null;
};

export const getAnalyticsOverview = (range: AnalyticsRange = "30d") =>
  request<AnalyticsOverview>(`/v1/shelter/analytics/overview?range=${range}`);

export const getAnalyticsListings = (range: AnalyticsRange = "30d") =>
  request<ListingPerformanceRow[]>(`/v1/shelter/analytics/listings?range=${range}`);

export const getAnalyticsFunnel = (range: AnalyticsRange = "30d") =>
  request<ApplicationFunnel>(`/v1/shelter/analytics/funnel?range=${range}`);

// ── Applications ──────────────────────────────────────────────
export const listShelterApplications = (status?: string) =>
  request<AdoptionApplication[]>(
    status ? `/v1/shelter/applications?status=${status}` : "/v1/shelter/applications"
  );

export const getShelterApplication = (id: string) =>
  request<AdoptionApplication>(`/v1/shelter/applications/${id}`);

export const approveApplication = (id: string) =>
  request<AdoptionApplication>(`/v1/shelter/applications/${id}/approve`, { method: "POST" });

export const rejectApplication = (id: string, reason: string) =>
  request<AdoptionApplication>(`/v1/shelter/applications/${id}/reject`, {
    method: "POST",
    body: { reason }
  });

export const completeAdoption = (id: string) =>
  request<AdoptionApplication>(`/v1/shelter/applications/${id}/complete`, { method: "POST" });

// ── Messaging (reuses core /conversations + /messages under shelter auth) ──
export const listShelterConversations = () =>
  request<Conversation[]>("/v1/shelter/conversations");

export const listMessages = (conversationId: string, limit = 50, before?: string) => {
  const params = new URLSearchParams({ conversationId, limit: String(limit) });
  if (before) params.set("before", before);
  return request<Message[]>(`/v1/shelter/messages?${params.toString()}`);
};

export const sendMessage = (
  conversationId: string,
  body: string,
  extra: { type?: string; imageUrl?: string; metadata?: Record<string, unknown> } = {}
) =>
  request<Message>("/v1/shelter/messages", {
    method: "POST",
    body: {
      conversationId,
      type: extra.type ?? "text",
      body,
      imageUrl: extra.imageUrl ?? "",
      metadata: extra.metadata ?? null
    }
  });

export const markMessagesRead = (conversationId: string) =>
  request<{ ok: boolean }>("/v1/shelter/messages/read", {
    method: "POST",
    body: { conversationId }
  });

// ── Shared catalogue + media upload ───────────────────────────
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
  request<TaxonomyItem[]>(`/v1/shelter/taxonomies/${encodeURIComponent(kind)}`);

type PresignResult = { objectKey: string; uploadUrl: string; publicUrl: string };

export const shelterPresignUpload = (fileName: string, mimeType: string, folder: string) =>
  request<PresignResult>("/v1/shelter/media/presign", {
    method: "POST",
    body: { fileName, mimeType, folder }
  });

/**
 * Upload a local file URI (from expo-image-picker) to R2 via the presigned
 * PUT. Returns the publicly hosted URL the backend should persist.
 */
export async function uploadImageUriToR2(params: {
  uri: string;
  fileName: string;
  mimeType: string;
  folder: string;
}): Promise<string> {
  const presign = await shelterPresignUpload(
    params.fileName,
    params.mimeType,
    params.folder
  );
  // React Native's fetch accepts blobs via URI when constructed this way.
  const fetchRes = await fetch(params.uri);
  const blob = await fetchRes.blob();
  const put = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": params.mimeType },
    body: blob
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return presign.publicUrl;
}
