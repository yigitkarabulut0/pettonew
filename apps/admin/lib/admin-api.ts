"use client";

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

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const cookieName = "petto_admin_session";

function getApiBaseUrl() {
  if (!apiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
  }

  return apiBaseUrl;
}

function getToken() {
  if (typeof document === "undefined") {
    return "";
  }

  const cookie = document.cookie
    .split("; ")
    .find((chunk) => chunk.startsWith(`${cookieName}=`));
  return cookie?.split("=")[1] ?? "";
}

async function parseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return payload?.error ?? "Request failed";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = (await response.json()) as { data: T };
  return payload.data;
}

export async function adminLogin(email: string, password: string) {
  const session = await request<{ accessToken: string; expiresIn: number }>(
    "/v1/admin/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    }
  );
  document.cookie = `${cookieName}=${session.accessToken}; path=/; max-age=28800`;
  return session;
}

export function adminLogout() {
  document.cookie = `${cookieName}=; path=/; max-age=0`;
}

export async function getDashboard(): Promise<DashboardSnapshot> {
  return request<DashboardSnapshot>("/v1/admin/dashboard");
}

export async function getUsers(): Promise<UserProfile[]> {
  return request<UserProfile[]>("/v1/admin/users");
}

export async function updateUserStatus(userId: string, status: string) {
  return request("/v1/admin/users/" + userId, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status })
  });
}

export async function getUserDetail(userId: string) {
  return request<AdminUserDetail>("/v1/admin/users/" + userId);
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
  return request("/v1/admin/users/" + userId, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(fields)
  });
}

export async function deleteUser(userId: string) {
  return request("/v1/admin/users/" + userId, {
    method: "DELETE"
  });
}

export async function getPets(): Promise<Pet[]> {
  return request<Pet[]>("/v1/admin/pets");
}

export async function getPetDetail(petId: string) {
  return request<AdminPetDetail>("/v1/admin/pets/" + petId);
}

export async function getPosts(): Promise<HomePost[]> {
  return request<HomePost[]>("/v1/admin/posts");
}

export async function deletePost(postId: string) {
  return request("/v1/admin/posts/" + postId, {
    method: "DELETE"
  });
}

export async function getVenues(): Promise<ExploreVenue[]> {
  return request<ExploreVenue[]>("/v1/admin/venues");
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
}) {
  return request<ExploreVenue>("/v1/admin/venues", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function updateVenue(venueId: string, payload: {
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
  return request<ExploreVenue>("/v1/admin/venues/" + venueId, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function deleteVenue(venueId: string) {
  return request("/v1/admin/venues/" + venueId, {
    method: "DELETE"
  });
}

export async function getEvents(): Promise<ExploreEvent[]> {
  return request<ExploreEvent[]>("/v1/admin/events");
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
  return request<ExploreEvent>("/v1/admin/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function deleteEvent(eventId: string) {
  return request("/v1/admin/events/" + eventId, {
    method: "DELETE"
  });
}

export async function updatePetVisibility(petId: string, hidden: boolean) {
  return request("/v1/admin/pets/" + petId, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ hidden })
  });
}

export async function getTaxonomy(kind: TaxonomyKind) {
  return request<TaxonomyItem[]>("/v1/admin/taxonomies/" + kind);
}

export async function upsertTaxonomy(kind: TaxonomyKind, item: TaxonomyItem) {
  return request<TaxonomyItem>("/v1/admin/taxonomies/" + kind, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(item)
  });
}

export async function deleteTaxonomy(kind: TaxonomyKind, itemId: string) {
  return request("/v1/admin/taxonomies/" + kind + "/" + itemId, {
    method: "DELETE"
  });
}

export async function getReports() {
  return request<ReportSummary[]>("/v1/admin/reports");
}

export async function getReportDetail(reportId: string) {
  return request<ReportDetail>("/v1/admin/reports/" + reportId);
}

export async function resolveReport(reportId: string, notes = "") {
  return request("/v1/admin/reports/" + reportId + "/resolve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ notes })
  });
}

export async function sendNotification(title: string, body: string, target: string) {
  return request<{ id: string }>("/v1/admin/notifications/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body, target })
  });
}

export async function getNotifications() {
  return request<
    Array<{
      id: string;
      title: string;
      body: string;
      target: string;
      sentAt: string;
      sentBy: string;
    }>
  >("/v1/admin/notifications");
}

// Pet care data
export async function getAdminPetHealth(petId: string) {
  return request<Array<{ id: string; petId: string; type: string; title: string; date: string; notes: string; nextDueDate?: string; createdAt: string }>>("/v1/admin/pets/" + petId + "/health");
}
export async function deleteAdminHealthRecord(petId: string, recordId: string) {
  return request("/v1/admin/pets/" + petId + "/health/" + recordId, { method: "DELETE" });
}
export async function getAdminPetWeight(petId: string) {
  return request<Array<{ id: string; petId: string; weight: number; unit: string; date: string }>>("/v1/admin/pets/" + petId + "/weight");
}
export async function getAdminPetFeeding(petId: string) {
  return request<Array<{ id: string; petId: string; mealName: string; time: string; foodType: string; amount: string }>>("/v1/admin/pets/" + petId + "/feeding");
}
export async function getAdminPetDiary(petId: string) {
  return request<Array<{ id: string; petId: string; body: string; mood: string; createdAt: string }>>("/v1/admin/pets/" + petId + "/diary");
}

// Training tips
export async function getAdminTrainingTips() {
  return request<Array<{ id: string; title: string; body: string; category: string; petType: string; difficulty: string }>>("/v1/admin/training-tips");
}
export async function createAdminTrainingTip(tip: { title: string; body: string; summary: string; category: string; petType: string; difficulty: string; steps: Array<{ order: number; title: string; description: string; videoUrl?: string }>; videoUrl?: string }) {
  return request("/v1/admin/training-tips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tip) });
}
export async function deleteAdminTrainingTip(tipId: string) {
  return request("/v1/admin/training-tips/" + tipId, { method: "DELETE" });
}

// Pet sitters
export async function getAdminPetSitters() {
  const data = await request<Array<{ id: string; name: string; bio: string; hourlyRate: number; cityLabel: string; services: string[] }> | null>("/v1/admin/pet-sitters");
  return data ?? [];
}

// Playdates
export async function getAdminPlaydates() {
  return request<Array<{ id: string; title: string; description: string; date: string; location: string; maxPets: number; attendees: string[]; createdAt: string }>>("/v1/admin/playdates");
}

// Groups
export async function getAdminGroups() {
  return request<Array<{ id: string; name: string; description: string; petType: string; memberCount: number; createdAt: string }>>("/v1/admin/groups");
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
  return request("/v1/admin/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(group) });
}

// Lost pets
export async function getAdminLostPets() {
  return request<Array<{ id: string; petId: string; description: string; lastSeenLocation: string; lastSeenDate: string; status: string; contactPhone: string; createdAt: string }>>("/v1/admin/lost-pets");
}
export async function updateAdminLostPetStatus(alertId: string, status: string) {
  return request("/v1/admin/lost-pets/" + alertId, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
}

// Adoptions
export async function getAdminAdoptions() {
  return request<Array<{ id: string; petName: string; petAge: number; petSpecies: string; petBreed: string; gender: string; description: string; location: string; imageUrl?: string; status: string; userId: string; userName?: string; createdAt: string }>>("/v1/admin/adoptions");
}
export async function updateAdminAdoptionStatus(listingId: string, status: string) {
  return request("/v1/admin/adoptions/" + listingId, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
}
export async function deleteAdminAdoption(listingId: string) {
  return request("/v1/admin/adoptions/" + listingId, { method: "DELETE" });
}

// Vet Clinics
export async function getAdminVetClinics() {
  const data = await request<Array<{ id: string; name: string; phone: string; address: string; latitude: number; longitude: number; city: string; isEmergency: boolean; website?: string; hours?: string }> | null>("/v1/admin/vet-clinics");
  return data ?? [];
}
export async function createAdminVetClinic(clinic: { name: string; phone: string; address: string; city: string; isEmergency: boolean; website?: string; hours?: string; latitude?: number; longitude?: number }) {
  return request("/v1/admin/vet-clinics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(clinic) });
}
export async function deleteAdminVetClinic(clinicId: string) {
  return request("/v1/admin/vet-clinics/" + clinicId, { method: "DELETE" });
}

// Training tip update (rich content)
export async function updateAdminTrainingTip(tipId: string, tip: { title: string; summary: string; body: string; category: string; petType: string; difficulty: string; steps: Array<{ order: number; title: string; description: string; videoUrl?: string }>; videoUrl?: string }) {
  return request("/v1/admin/training-tips/" + tipId, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tip) });
}

// Admin presign upload
export async function adminPresignUpload(fileName: string, mimeType: string, folder: string) {
  return request<{ objectKey: string; uploadUrl: string; publicUrl: string }>("/v1/admin/media/presign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName, mimeType, folder }) });
}

export const adminCookieName = cookieName;
