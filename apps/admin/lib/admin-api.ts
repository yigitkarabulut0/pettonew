"use client";

import type {
  AdminUserDetail,
  DashboardSnapshot,
  ExploreEvent,
  ExploreVenue,
  HomePost,
  Pet,
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
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
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
  const session = await request<{ accessToken: string; expiresIn: number }>("/v1/admin/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
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

export async function deleteUser(userId: string) {
  return request("/v1/admin/users/" + userId, {
    method: "DELETE"
  });
}

export async function getPets(): Promise<Pet[]> {
  return request<Pet[]>("/v1/admin/pets");
}

export async function getPosts(): Promise<HomePost[]> {
  return request<HomePost[]>("/v1/admin/posts");
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

export async function resolveReport(reportId: string) {
  return request("/v1/admin/reports/" + reportId + "/resolve", {
    method: "POST"
  });
}

export const adminCookieName = cookieName;
