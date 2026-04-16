"use client";

import { apiRequest, buildListParams, type AdminListEnvelope } from "@/lib/api/client";
import type { ListState } from "@/lib/api/users";

export async function listAdminPetAlbums(petId: string) {
  const res = await apiRequest<AdminListEnvelope<any> | any[]>(`/pets/${petId}/albums`);
  return Array.isArray(res) ? { data: res, total: res.length } : res;
}
export async function listAdminPetMilestones(petId: string) {
  const res = await apiRequest<AdminListEnvelope<any> | any[]>(`/pets/${petId}/milestones`);
  return Array.isArray(res) ? { data: res, total: res.length } : res;
}
export async function deleteAdminPetAlbum(albumId: string) {
  return apiRequest(`/pet-albums/${albumId}`, { method: "DELETE" });
}

export async function updateAdminVetClinic(clinicId: string, patch: Record<string, unknown>) {
  return apiRequest(`/vet-clinics/${clinicId}`, { method: "PUT", body: patch });
}
export async function updateAdminPetSitter(sitterId: string, patch: Record<string, unknown>) {
  return apiRequest(`/pet-sitters/${sitterId}`, { method: "PUT", body: patch });
}
export async function updateAdminWalkRoute(routeId: string, patch: Record<string, unknown>) {
  return apiRequest(`/walk-routes/${routeId}`, { method: "PUT", body: patch });
}

export async function updateAdminGroup(groupId: string, patch: Record<string, unknown>) {
  return apiRequest(`/groups/${groupId}`, { method: "PUT", body: patch });
}
export async function listAdminGroupMembers(groupId: string, state: ListState = {}) {
  const res = await apiRequest<AdminListEnvelope<any> | any[]>(
    `/groups/${groupId}/members${buildListParams(state)}`
  );
  return Array.isArray(res) ? { data: res, total: res.length } : res;
}
export async function kickAdminGroupMember(groupId: string, userId: string) {
  return apiRequest(`/groups/${groupId}/members/${userId}`, { method: "DELETE" });
}

export async function updateAdminPlaydate(playdateId: string, patch: Record<string, unknown>) {
  return apiRequest(`/playdates/${playdateId}`, { method: "PATCH", body: patch });
}
export async function cancelAdminPlaydate(playdateId: string, reason: string) {
  return apiRequest(`/playdates/${playdateId}/cancel`, {
    method: "POST",
    body: { reason }
  });
}
