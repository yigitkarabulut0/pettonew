const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

function getApiBaseUrl() {
  if (!apiBaseUrl) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is not configured.");
  }
  return apiBaseUrl;
}

async function post(path: string, accessToken: string | null, body: unknown) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${path} failed: ${res.status}`);
  }
}

async function del(path: string, accessToken: string | null) {
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`DELETE ${path} failed: ${res.status}`);
  }
}

export async function postStartToken(
  accessToken: string,
  payload: { kind: "playdate"; deviceId: string; token: string },
) {
  return post("/v1/live-activities/start-tokens", accessToken, payload);
}

export async function postActivityToken(
  accessToken: string,
  payload: {
    activityId: string;
    kind: "playdate";
    relatedId: string;
    token: string;
  },
) {
  return post("/v1/live-activities/tokens", accessToken, payload);
}

export async function deleteActivity(accessToken: string, activityId: string) {
  return del(
    `/v1/live-activities/${encodeURIComponent(activityId)}`,
    accessToken,
  );
}
