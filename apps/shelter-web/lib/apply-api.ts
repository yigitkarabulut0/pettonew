"use client";

// Public (unauthenticated) calls into /v1/public/shelter-applications.
// These bypass the /api/proxy wrapper — no bearer token exists yet at
// application time. We hit the API directly using NEXT_PUBLIC_API_BASE_URL
// (CORS is open * on the API).

import type {
  ShelterApplication,
  ShelterApplicationSubmission,
  ShelterApplicationSubmitResult,
  ShelterEntityType
} from "@petto/contracts";

function apiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  return base.replace(/\/+$/, "");
}

async function publicRequest<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const url = `${apiBase()}/v1/public${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...opts.headers
    },
    cache: "no-store"
  });
  let payload: unknown = null;
  if (res.headers.get("content-type")?.includes("json")) {
    try {
      payload = await res.json();
    } catch {
      /* empty body */
    }
  }
  if (!res.ok) {
    const msg =
      (payload as { error?: string } | null)?.error ??
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  if (payload && typeof payload === "object" && "data" in (payload as object)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export async function fetchEntityTypes(
  country: string
): Promise<ShelterEntityType[]> {
  const params = new URLSearchParams({ country });
  return publicRequest<ShelterEntityType[]>(
    `/taxonomies/shelter-entity-types?${params.toString()}`
  );
}

export type PresignedUpload = {
  id: string;
  objectKey: string;
  uploadUrl: string;
  url: string;
};

export async function presignCertificateUpload(
  fileName: string,
  mimeType: string
): Promise<PresignedUpload> {
  return publicRequest<PresignedUpload>(`/shelter-applications/presign`, {
    method: "POST",
    body: JSON.stringify({ fileName, mimeType })
  });
}

// uploadCertificate runs the full presign → PUT dance for a single
// document (PDF/JPG/PNG up to 10MB). Returns the public URL to persist.
export async function uploadCertificate(file: File): Promise<string> {
  const presign = await presignCertificateUpload(file.name, file.type);
  const putRes = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file
  });
  if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
  return presign.url;
}

export async function submitApplication(
  submission: ShelterApplicationSubmission
): Promise<ShelterApplicationSubmitResult> {
  return publicRequest<ShelterApplicationSubmitResult>(
    `/shelter-applications`,
    {
      method: "POST",
      body: JSON.stringify(submission)
    }
  );
}

export async function fetchApplicationStatus(
  accessToken: string
): Promise<ShelterApplication> {
  return publicRequest<ShelterApplication>(
    `/shelter-applications/${encodeURIComponent(accessToken)}`
  );
}
