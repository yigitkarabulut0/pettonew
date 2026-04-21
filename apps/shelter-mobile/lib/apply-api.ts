// Public shelter onboarding API — no bearer token required.
// Mobile mirrors shelter-web's apply-api.ts but reads the API base from
// EXPO_PUBLIC_API_BASE_URL (the same var the authenticated client uses).

import type {
  ShelterApplication,
  ShelterApplicationSubmission,
  ShelterApplicationSubmitResult,
  ShelterEntityType
} from "@petto/contracts";

function apiBase(): string {
  const base = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base) throw new Error("EXPO_PUBLIC_API_BASE_URL is not configured");
  return base;
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
    }
  });
  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json")) {
    try {
      payload = await res.json();
    } catch {
      /* empty */
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

// Upload a local file URI (image picker / document picker) to R2 via the
// presign flow. The URI is fetched to a Blob so React Native's Fetch
// API can PUT it upstream without us touching native modules.
export async function uploadCertificateFromUri(params: {
  uri: string;
  fileName: string;
  mimeType: string;
}): Promise<string> {
  const presign = await presignCertificateUpload(params.fileName, params.mimeType);
  const local = await fetch(params.uri);
  const blob = await local.blob();
  const put = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": params.mimeType },
    body: blob
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
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
