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

// Groups
export async function getAdminGroups() {
  return apiRequest<Array<{
    id: string;
    name: string;
    description: string;
    petType: string;
    memberCount: number;
    createdAt: string;
  }>>("/groups");
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

// Adoptions
export async function getAdminAdoptions() {
  return apiRequest<Array<{
    id: string;
    petName: string;
    petAge: number;
    petSpecies: string;
    petBreed: string;
    gender: string;
    description: string;
    location: string;
    imageUrl?: string;
    status: string;
    userId: string;
    userName?: string;
    createdAt: string;
  }>>("/adoptions");
}
export async function updateAdminAdoptionStatus(listingId: string, status: string) {
  return apiRequest(`/adoptions/${listingId}`, { method: "PATCH", body: { status } });
}
export async function deleteAdminAdoption(listingId: string) {
  return apiRequest(`/adoptions/${listingId}`, { method: "DELETE" });
}

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

export const adminCookieName = "admin_token";
