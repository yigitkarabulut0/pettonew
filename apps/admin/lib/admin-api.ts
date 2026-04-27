"use client";

// Legacy shim. New code should import from `@/lib/api/*`.
// Routes every call through `/api/proxy/...` which attaches the admin bearer
// token from the HttpOnly cookie on the server. The browser never sees the token.

import type {
  AdminPetDetail,
  AdminUserDetail,
  DashboardSnapshot,
  ExploreEvent,
  ExploreVenue,
  HomePost,
  Pet,
  ReportDetail,
  ReportSummary,
  TaxonomyItem,
  TaxonomyKind,
  UserProfile
} from "@petto/contracts";

import { apiRequest, apiLogin, apiLogout } from "@/lib/api/client";

export const adminLogin = async (email: string, password: string) => apiLogin(email, password);
export const adminLogout = () => {
  void apiLogout();
};

export async function getDashboard() {
  return apiRequest<DashboardSnapshot>("/dashboard");
}

export async function getUsers() {
  return apiRequest<UserProfile[]>("/users");
}

export async function updateUserStatus(userId: string, status: string) {
  return apiRequest(`/users/${userId}`, { method: "PATCH", body: { status } });
}

export async function getUserDetail(userId: string) {
  return apiRequest<AdminUserDetail>(`/users/${userId}`);
}

export async function updateUser(
  userId: string,
  fields: {
    firstName?: string;
    lastName?: string;
    bio?: string;
    cityLabel?: string;
    gender?: string;
    birthDate?: string;
  }
) {
  return apiRequest(`/users/${userId}`, { method: "PATCH", body: fields });
}

export async function deleteUser(userId: string) {
  return apiRequest(`/users/${userId}`, { method: "DELETE" });
}

export async function getPets() {
  return apiRequest<Pet[]>("/pets");
}

export async function getPetDetail(petId: string) {
  return apiRequest<AdminPetDetail>(`/pets/${petId}`);
}

export async function getPosts() {
  return apiRequest<HomePost[]>("/posts");
}

export async function deletePost(postId: string) {
  return apiRequest(`/posts/${postId}`, { method: "DELETE" });
}

export async function getVenues() {
  return apiRequest<ExploreVenue[]>("/venues");
}

export async function createVenue(payload: {
  name: string;
  category: string;
  description: string;
  cityLabel: string;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl?: string;
  hours?: string;
}) {
  return apiRequest<ExploreVenue>("/venues", { method: "POST", body: payload });
}

export async function updateVenue(
  venueId: string,
  payload: {
    name: string;
    category: string;
    description: string;
    cityLabel: string;
    address: string;
    latitude: number;
    longitude: number;
    imageUrl?: string;
    hours?: string;
  }
) {
  return apiRequest<ExploreVenue>(`/venues/${venueId}`, { method: "PUT", body: payload });
}

export async function deleteVenue(venueId: string) {
  return apiRequest(`/venues/${venueId}`, { method: "DELETE" });
}

/* ── Venue photo gallery management (v0.13.7) ─────────────────── */

export type VenuePhotoEntry = {
  url: string;
  kind: "cover" | "admin" | "post";
  /** Present when kind="admin" — used by DELETE. */
  id?: string;
  /** Present when kind="post" — used by PATCH hidden flag. */
  postId?: string;
  hidden?: boolean;
};

export async function getVenuePhotosManage(venueId: string) {
  return apiRequest<VenuePhotoEntry[]>(`/venues/${venueId}/photos`);
}

export async function addVenuePhoto(venueId: string, url: string) {
  return apiRequest<VenuePhotoEntry>(`/venues/${venueId}/photos`, {
    method: "POST",
    body: { url }
  });
}

export async function deleteVenuePhoto(venueId: string, photoId: string) {
  return apiRequest(`/venues/${venueId}/photos/${photoId}`, { method: "DELETE" });
}

export async function setVenuePostPhotoHidden(
  venueId: string,
  postId: string,
  hidden: boolean
) {
  return apiRequest(`/venues/${venueId}/post-photos/${postId}`, {
    method: "PATCH",
    body: { hidden }
  });
}

export async function getEvents() {
  return apiRequest<ExploreEvent[]>("/events");
}

export async function createEvent(payload: {
  title: string;
  description: string;
  cityLabel: string;
  venueId?: string;
  startsAt: string;
  endsAt?: string;
  audience: string;
  petFocus: string;
}) {
  return apiRequest<ExploreEvent>("/events", { method: "POST", body: payload });
}

export async function deleteEvent(eventId: string) {
  return apiRequest(`/events/${eventId}`, { method: "DELETE" });
}

export async function updatePetVisibility(petId: string, hidden: boolean) {
  return apiRequest(`/pets/${petId}`, { method: "PATCH", body: { hidden } });
}

export async function getTaxonomy(kind: TaxonomyKind) {
  return apiRequest<TaxonomyItem[]>(`/taxonomies/${kind}`);
}

export async function upsertTaxonomy(kind: TaxonomyKind, item: TaxonomyItem) {
  return apiRequest<TaxonomyItem>(`/taxonomies/${kind}`, { method: "POST", body: item });
}

export async function deleteTaxonomy(kind: TaxonomyKind, itemId: string) {
  return apiRequest(`/taxonomies/${kind}/${itemId}`, { method: "DELETE" });
}

export async function getReports() {
  return apiRequest<ReportSummary[]>("/reports");
}

export async function getReportDetail(reportId: string) {
  return apiRequest<ReportDetail>(`/reports/${reportId}`);
}

export async function resolveReport(reportId: string, notes = "") {
  return apiRequest(`/reports/${reportId}/resolve`, { method: "POST", body: { notes } });
}

export async function sendNotification(title: string, body: string, target: string) {
  return apiRequest<{ id: string }>("/notifications/send", {
    method: "POST",
    body: { title, body, target }
  });
}

export async function getNotifications() {
  return apiRequest<
    Array<{
      id: string;
      title: string;
      body: string;
      target: string;
      sentAt: string;
      sentBy: string;
    }>
  >("/notifications");
}

// Scheduled (recurring) pushes — admin-defined cron-lite. The per-minute
// scheduler on the API fires each row when its `nextRunAt` arrives.
export type ScheduledPushAudience = "all" | "pet_type" | "users";

export interface ScheduledPush {
  id: string;
  title: string;
  body: string;
  deepLink?: string;
  audience: ScheduledPushAudience;
  petTypes: string[];
  userIds: string[];
  countryFilter?: string;
  cityFilter?: string;
  daysOfWeek: number[]; // Sunday=0 … Saturday=6
  timeOfDay: string; // "HH:MM"
  timezone: string;
  enabled: boolean;
  lastRunAt?: string | null;
  nextRunAt: string;
  createdAt: string;
  createdBy?: string;
}

export interface ScheduledPushInput {
  title: string;
  body: string;
  deepLink?: string;
  audience: ScheduledPushAudience;
  petTypes?: string[];
  userIds?: string[];
  countryFilter?: string;
  cityFilter?: string;
  daysOfWeek: number[];
  timeOfDay: string;
  timezone?: string;
  enabled?: boolean;
}

// Curated country / city / timezone catalogue. The same data drives the
// scheduler's resolver on the backend, so a city picked here is
// guaranteed to match exactly what the resolver looks for.
export interface AdminCountry {
  code: string;
  name: string;
  cities: string[];
}
export async function getAdminLocations() {
  return apiRequest<{ countries: AdminCountry[]; timezones: string[] }>("/locations");
}

export async function listScheduledPushes() {
  return apiRequest<ScheduledPush[]>("/scheduled-pushes");
}

export async function createScheduledPush(input: ScheduledPushInput) {
  return apiRequest<{ id: string }>("/scheduled-pushes", {
    method: "POST",
    body: input
  });
}

export async function updateScheduledPush(id: string, patch: Partial<ScheduledPushInput>) {
  return apiRequest(`/scheduled-pushes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch
  });
}

export async function deleteScheduledPush(id: string) {
  return apiRequest(`/scheduled-pushes/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

// Pet care data
export async function getAdminPetHealth(petId: string) {
  return apiRequest<
    Array<{
      id: string;
      petId: string;
      type: string;
      title: string;
      date: string;
      notes: string;
      nextDueDate?: string;
      createdAt: string;
    }>
  >(`/pets/${petId}/health`);
}
export async function deleteAdminHealthRecord(petId: string, recordId: string) {
  return apiRequest(`/pets/${petId}/health/${recordId}`, { method: "DELETE" });
}
export async function getAdminPetWeight(petId: string) {
  return apiRequest<
    Array<{ id: string; petId: string; weight: number; unit: string; date: string }>
  >(`/pets/${petId}/weight`);
}
export async function getAdminPetFeeding(petId: string) {
  return apiRequest<
    Array<{ id: string; petId: string; mealName: string; time: string; foodType: string; amount: string }>
  >(`/pets/${petId}/feeding`);
}
export async function getAdminPetDiary(petId: string) {
  return apiRequest<
    Array<{ id: string; petId: string; body: string; mood: string; createdAt: string }>
  >(`/pets/${petId}/diary`);
}

// Training tips
export async function getAdminTrainingTips() {
  return apiRequest<
    Array<{ id: string; title: string; body: string; category: string; petType: string; difficulty: string }>
  >("/training-tips");
}
export async function createAdminTrainingTip(tip: {
  title: string;
  body: string;
  summary: string;
  category: string;
  petType: string;
  difficulty: string;
  steps: Array<{ order: number; title: string; description: string; videoUrl?: string }>;
  videoUrl?: string;
}) {
  return apiRequest("/training-tips", { method: "POST", body: tip });
}
export async function deleteAdminTrainingTip(tipId: string) {
  return apiRequest(`/training-tips/${tipId}`, { method: "DELETE" });
}
export async function updateAdminTrainingTip(
  tipId: string,
  tip: {
    title: string;
    summary: string;
    body: string;
    category: string;
    petType: string;
    difficulty: string;
    steps: Array<{ order: number; title: string; description: string; videoUrl?: string }>;
    videoUrl?: string;
  }
) {
  return apiRequest(`/training-tips/${tipId}`, { method: "PUT", body: tip });
}

// Breed care guides (Care v0.14.3)
// Per-locale override for the editorial fields. Empty fields keep the
// base English value; partial translations are valid (translator can
// land `title` first and finish `body` later).
export type BreedCareGuideTranslation = {
  title?: string;
  summary?: string;
  body?: string;
};
export type AdminBreedCareGuide = {
  id: string;
  speciesId: string;
  speciesLabel: string;
  breedId?: string;
  breedLabel?: string;
  title: string;
  summary?: string;
  body: string;
  heroImageUrl?: string;
  // BCP-47 locale → fields the locale wants to override (e.g. "tr",
  // "pt-BR"). Base English lives in the top-level title/summary/body.
  translations?: Record<string, BreedCareGuideTranslation>;
  createdAt: string;
  updatedAt: string;
};

export async function getAdminBreedCareGuides() {
  return apiRequest<AdminBreedCareGuide[]>("/breed-care-guides");
}
export async function createAdminBreedCareGuide(g: {
  speciesId: string;
  speciesLabel: string;
  breedId?: string;
  breedLabel?: string;
  title: string;
  summary?: string;
  body: string;
  heroImageUrl?: string;
  translations?: Record<string, BreedCareGuideTranslation>;
}) {
  return apiRequest<AdminBreedCareGuide>("/breed-care-guides", { method: "POST", body: g });
}
export async function updateAdminBreedCareGuide(guideId: string, g: Partial<AdminBreedCareGuide>) {
  return apiRequest<AdminBreedCareGuide>(`/breed-care-guides/${guideId}`, { method: "PATCH", body: g });
}
export async function deleteAdminBreedCareGuide(guideId: string) {
  return apiRequest(`/breed-care-guides/${guideId}`, { method: "DELETE" });
}

// Food items (Calorie Counter database)
export type AdminFoodItem = {
  id: string;
  name: string;
  brand?: string;
  kind: "dry" | "wet" | "treat" | "other";
  speciesLabel?: string;
  kcalPer100g: number;
  isPublic: boolean;
  createdByUser?: string;
  createdAt: string;
};

export async function getAdminFoodItems(params: { search?: string; species?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.species) qs.set("species", params.species);
  const q = qs.toString();
  return apiRequest<AdminFoodItem[]>(`/food-items${q ? `?${q}` : ""}`);
}
export async function createAdminFoodItem(item: {
  name: string;
  brand?: string;
  kind: AdminFoodItem["kind"];
  speciesLabel?: string;
  kcalPer100g: number;
  isPublic: boolean;
}) {
  return apiRequest<AdminFoodItem>("/food-items", { method: "POST", body: item });
}
export async function updateAdminFoodItem(itemId: string, item: Partial<AdminFoodItem>) {
  return apiRequest<AdminFoodItem>(`/food-items/${itemId}`, { method: "PATCH", body: item });
}
export async function deleteAdminFoodItem(itemId: string) {
  return apiRequest(`/food-items/${itemId}`, { method: "DELETE" });
}

// First-aid topics
export type AdminFirstAidTopic = {
  id: string;
  slug: string;
  title: string;
  severity: "emergency" | "urgent" | "info";
  summary?: string;
  body: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export async function getAdminFirstAidTopics() {
  return apiRequest<AdminFirstAidTopic[]>("/first-aid-topics");
}
export async function createAdminFirstAidTopic(t: {
  title: string;
  severity: AdminFirstAidTopic["severity"];
  summary?: string;
  body: string;
  displayOrder?: number;
  slug?: string;
}) {
  return apiRequest<AdminFirstAidTopic>("/first-aid-topics", { method: "POST", body: t });
}
export async function updateAdminFirstAidTopic(topicId: string, t: Partial<AdminFirstAidTopic>) {
  return apiRequest<AdminFirstAidTopic>(`/first-aid-topics/${topicId}`, { method: "PATCH", body: t });
}
export async function deleteAdminFirstAidTopic(topicId: string) {
  return apiRequest(`/first-aid-topics/${topicId}`, { method: "DELETE" });
}

// Pet sitters
export async function getAdminPetSitters() {
  const data = await apiRequest<Array<{
    id: string;
    name: string;
    bio: string;
    hourlyRate: number;
    cityLabel: string;
    services: string[];
  }> | null>("/pet-sitters");
  return data ?? [];
}

// Playdates
export async function getAdminPlaydates() {
  return apiRequest<Array<{
    id: string;
    title: string;
    description: string;
    date: string;
    location: string;
    maxPets: number;
    attendees: string[];
    createdAt: string;
  }>>("/playdates");
}

export type AdminPlaydateMemberPet = { id: string; name: string; photoUrl?: string };
export type AdminPlaydateAttendee = {
  userId: string;
  firstName: string;
  avatarUrl?: string;
  pets: AdminPlaydateMemberPet[];
};
export type AdminPlaydateHost = {
  userId: string;
  firstName: string;
  avatarUrl?: string;
  isVerified: boolean;
};
export type AdminPlaydateDetail = {
  id: string;
  organizerId: string;
  title: string;
  description: string;
  date: string;
  location: string;
  maxPets: number;
  attendees: string[];
  createdAt: string;
  latitude?: number;
  longitude?: number;
  cityLabel?: string;
  venueId?: string;
  coverImageUrl?: string;
  rules?: string[];
  status: string;
  cancelledAt?: string;
  conversationId?: string;
  waitlist?: string[];
  attendeesInfo?: AdminPlaydateAttendee[];
  hostInfo?: AdminPlaydateHost;
  visibility: string;
  shareToken?: string;
  joinCode?: string;
  slotsUsed?: number;
  pendingInvites?: number;
  locked?: boolean;
};
export async function getAdminPlaydateDetail(id: string) {
  return apiRequest<AdminPlaydateDetail>(`/playdates/${encodeURIComponent(id)}`);
}

// Conversation messages — used by the playdate / group live chat pane.
export type AdminConversationMessage = {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderName?: string;
  senderAvatarUrl?: string;
  body: string;
  type?: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  deletedAt?: string | null;
};
export async function getAdminConversationMessages(
  conversationId: string,
  options: { limit?: number; offset?: number } = {}
) {
  const sp = new URLSearchParams();
  sp.set("limit", String(options.limit ?? 200));
  sp.set("offset", String(options.offset ?? 0));
  // The admin handler wraps its response in the paginated `writeAdminList`
  // envelope (`{data:{data:[...],total:N}}`). The Next proxy strips the outer
  // `data`, leaving the inner envelope here — pluck `.data` so the chat pane
  // gets a plain array regardless of which admin list shape the backend uses.
  const envelope = await apiRequest<
    AdminConversationMessage[] | { data: AdminConversationMessage[]; total?: number }
  >(`/conversations/${encodeURIComponent(conversationId)}/messages?${sp.toString()}`);
  if (Array.isArray(envelope)) return envelope;
  return envelope?.data ?? [];
}

export async function deleteAdminConversationMessage(conversationId: string, messageId: string) {
  return apiRequest(
    `/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    { method: "DELETE" }
  );
}

// Mints a short-lived HMAC ticket the browser can attach to the read-only
// admin chat WebSocket. The ticket itself is the only secret on the wire —
// the admin JWT never leaves the HttpOnly cookie.
export async function getAdminConversationWsTicket(conversationId: string) {
  return apiRequest<{ ticket: string; expiresAt: number }>(
    `/conversations/${encodeURIComponent(conversationId)}/ws-ticket`
  );
}

// Groups
export type AdminGroupListItem = {
  id: string;
  name: string;
  description: string;
  petType: string;
  category?: string;
  memberCount: number;
  imageUrl?: string;
  conversationId?: string;
  cityLabel?: string;
  isPrivate?: boolean;
  code?: string;
  hashtags?: string[];
  rules?: string[];
  createdAt: string;
};
export async function getAdminGroups() {
  return apiRequest<AdminGroupListItem[]>("/groups");
}

export type AdminGroupMemberPet = { id: string; name: string; photoUrl?: string };
export type AdminGroupMember = {
  userId: string;
  firstName: string;
  avatarUrl?: string;
  pets: AdminGroupMemberPet[];
  isMuted?: boolean;
  mutedUntil?: string | null;
};
export type AdminGroupDetail = AdminGroupListItem & {
  members: AdminGroupMember[];
  ownerUserId?: string;
  adminUserIds?: string[];
  latitude?: number;
  longitude?: number;
};
export async function getAdminGroupDetail(id: string) {
  return apiRequest<AdminGroupDetail>(`/groups/${encodeURIComponent(id)}`);
}

export async function createAdminGroup(group: {
  name: string;
  description: string;
  petType: string;
  cityLabel?: string;
  latitude?: number;
  longitude?: number;
  code?: string;
  isPrivate?: boolean;
}) {
  return apiRequest("/groups", { method: "POST", body: group });
}

export async function deleteAdminGroup(id: string) {
  return apiRequest(`/groups/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Lost pets
export async function getAdminLostPets() {
  return apiRequest<Array<{
    id: string;
    petId: string;
    description: string;
    lastSeenLocation: string;
    lastSeenDate: string;
    status: string;
    contactPhone: string;
    createdAt: string;
  }>>("/lost-pets");
}
export async function updateAdminLostPetStatus(alertId: string, status: string) {
  return apiRequest(`/lost-pets/${alertId}`, { method: "PATCH", body: { status } });
}

// Adoptions (v0.13) — legacy user-listing endpoints removed. Adoption
// management now lives in apps/shelter-web + /admin/shelters.

// Vet Clinics
export async function getAdminVetClinics() {
  const data = await apiRequest<Array<{
    id: string;
    name: string;
    phone: string;
    address: string;
    latitude: number;
    longitude: number;
    city: string;
    isEmergency: boolean;
    website?: string;
    hours?: string;
  }> | null>("/vet-clinics");
  return data ?? [];
}
export async function createAdminVetClinic(clinic: {
  name: string;
  phone: string;
  address: string;
  city: string;
  isEmergency: boolean;
  website?: string;
  hours?: string;
  latitude?: number;
  longitude?: number;
}) {
  return apiRequest("/vet-clinics", { method: "POST", body: clinic });
}
export async function updateAdminVetClinic(
  clinicId: string,
  clinic: {
    name: string;
    phone: string;
    address: string;
    city: string;
    isEmergency: boolean;
    website?: string;
    hours?: string;
    latitude?: number;
    longitude?: number;
  }
) {
  return apiRequest(`/vet-clinics/${clinicId}`, { method: "PUT", body: clinic });
}
export async function deleteAdminVetClinic(clinicId: string) {
  return apiRequest(`/vet-clinics/${clinicId}`, { method: "DELETE" });
}

// Admin presign upload
export async function adminPresignUpload(fileName: string, mimeType: string, folder: string) {
  return apiRequest<{ objectKey: string; uploadUrl: string; publicUrl: string }>("/media/presign", {
    method: "POST",
    body: { fileName, mimeType, folder }
  });
}

// ── Shelters (v0.13) ──────────────────────────────────────────────
// Admin-only. Temp password is returned once on create/reset; the UI
// must surface it immediately because it cannot be recovered.

export type AdminShelter = {
  id: string;
  email: string;
  name: string;
  about: string;
  phone: string;
  website: string;
  logoUrl?: string;
  heroUrl?: string;
  address: string;
  cityLabel: string;
  latitude: number;
  longitude: number;
  hours: string;
  status: string;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt?: string;
  verifiedAt?: string | null;
  operatingCountry?: string;
  isFeatured?: boolean;
};

export type AdminShelterStats = {
  totalPets: number;
  availablePets: number;
  reservedPets: number;
  adoptedPets: number;
  pendingApplications: number;
  activeChats: number;
  totalApplications: number;
};

export type CreateShelterInput = {
  name: string;
  email: string;
  phone?: string;
  about?: string;
  address?: string;
  cityLabel?: string;
  latitude?: number;
  longitude?: number;
  logoUrl?: string;
  hours?: string;
  website?: string;
};

export type CreateShelterResult = {
  shelter: AdminShelter;
  tempPassword: string;
  passwordNotice: string;
};

export async function listAdminShelters() {
  return apiRequest<AdminShelter[]>("/shelters");
}

export async function createAdminShelter(input: CreateShelterInput) {
  return apiRequest<CreateShelterResult>("/shelters", {
    method: "POST",
    body: input
  });
}

export async function getAdminShelter(shelterId: string) {
  return apiRequest<{ shelter: AdminShelter; stats: AdminShelterStats }>(
    `/shelters/${shelterId}`
  );
}

export async function resetAdminShelterPassword(shelterId: string) {
  return apiRequest<{ tempPassword: string; passwordNotice: string }>(
    `/shelters/${shelterId}/reset-password`,
    { method: "POST" }
  );
}

export async function deleteAdminShelter(shelterId: string) {
  return apiRequest(`/shelters/${shelterId}`, { method: "DELETE" });
}

// v0.24 — Featured-on-discovery toggle. Powers the rail on the
// fetcht adopter home; server caps the public list at 10 so multiple
// shelters can be flagged without hurting performance.
export async function setAdminShelterFeatured(
  shelterId: string,
  featured: boolean
) {
  return apiRequest<{ ok: true; featured: boolean }>(
    `/shelters/${shelterId}/featured`,
    { method: "POST", body: { featured } }
  );
}

// ── Shelter teams & audit (v0.15) ────────────────────────────────

export type AdminShelterMember = {
  id: string;
  shelterId: string;
  email: string;
  name?: string;
  role: "admin" | "editor" | "viewer";
  status: "active" | "pending" | "revoked";
  mustChangePassword: boolean;
  invitedByMemberId?: string;
  invitedAt?: string;
  joinedAt: string;
  lastLoginAt?: string;
};

export type AdminShelterInvite = {
  id: string;
  shelterId: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  acceptedMemberId?: string;
  revokedAt?: string;
};

export type AdminShelterTeam = {
  members: AdminShelterMember[];
  pendingInvites: AdminShelterInvite[];
};

export type AdminShelterAuditEntry = {
  id: string;
  shelterId: string;
  actorMemberId?: string;
  actorName: string;
  actorEmail: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export async function listShelterMembers(shelterId: string) {
  return apiRequest<AdminShelterTeam>(`/shelters/${shelterId}/members`);
}

export async function listShelterAuditLog(
  shelterId: string,
  limit: number = 200,
  offset: number = 0
) {
  return apiRequest<AdminShelterAuditEntry[]>(
    `/shelters/${shelterId}/audit-log?limit=${limit}&offset=${offset}`
  );
}

export async function transferShelterAdmin(
  shelterId: string,
  memberId: string
) {
  return apiRequest(`/shelters/${shelterId}/transfer-admin`, {
    method: "POST",
    body: { memberId }
  });
}

// ── Shelter onboarding applications (v0.14) ──────────────────────────
// The review queue created by the public /apply wizard.

export type ShelterApplicationStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected";

export type ShelterApplicationRejectionCode =
  | "invalid_registration"
  | "documents_unclear"
  | "jurisdiction_mismatch"
  | "duplicate"
  | "out_of_scope"
  | "other";

export type AdminShelterApplication = {
  id: string;
  status: ShelterApplicationStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  slaDeadline: string;
  entityType: string;
  country: string;
  registrationNumber: string;
  registrationCertificateUrl: string;
  orgName: string;
  orgAddress?: string;
  operatingRegionCountry: string;
  operatingRegionCity: string;
  speciesFocus: string[];
  donationUrl?: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;
  rejectionReasonCode?: ShelterApplicationRejectionCode | "";
  rejectionReasonNote?: string;
  createdShelterId?: string;
};

export type ApproveShelterApplicationResult = {
  shelter: AdminShelter;
  application: AdminShelterApplication;
  tempPassword: string;
  passwordNotice: string;
};

export async function listShelterApplications(status?: ShelterApplicationStatus) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiRequest<AdminShelterApplication[]>(`/shelter-applications${qs}`);
}

export async function getShelterApplication(appId: string) {
  return apiRequest<AdminShelterApplication>(`/shelter-applications/${appId}`);
}

export async function approveShelterApplication(appId: string) {
  return apiRequest<ApproveShelterApplicationResult>(
    `/shelter-applications/${appId}/approve`,
    { method: "POST" }
  );
}

export async function rejectShelterApplication(
  appId: string,
  reasonCode: ShelterApplicationRejectionCode,
  reasonNote: string
) {
  return apiRequest<AdminShelterApplication>(
    `/shelter-applications/${appId}/reject`,
    { method: "POST", body: { reasonCode, reasonNote } }
  );
}

export const adminCookieName = "admin_token";
