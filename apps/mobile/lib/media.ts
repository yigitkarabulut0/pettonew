// Client-side WebP transcoder + presigned R2 upload helper.
//
// Two responsibilities worth keeping together:
//
//   1. encodeToWebP — re-encodes whatever the picker produced (HEIC from iPhone,
//      PNG/JPEG from gallery) into WebP at a bounded dimension. WebP is handled
//      natively by expo-image on iOS + Android (SDK 50+), cuts R2 payload
//      ~50-70% vs. JPEG q=0.85, and dodges the HEIC-on-Android crash that
//      plagued Fetcht before this change.
//
//   2. putWithProgressAndRetry — PUTs the blob to R2 using XMLHttpRequest
//      (needed for progress events — `fetch` doesn't expose upload progress in
//      React Native) with exponential-backoff retries on network/5xx, then
//      does a HEAD on the public URL to catch CDN propagation gaps before the
//      caller claims success.

import type { SaveFormat as SaveFormatType } from "expo-image-manipulator";

export const MEDIA_MAX_DIM = 1920;
export const MEDIA_WEBP_QUALITY = 0.8;

export type EncodedImage = {
  uri: string;
  mimeType: "image/webp" | "image/jpeg";
  extension: ".webp" | ".jpg";
};

/**
 * Re-encode a picker result to WebP, downscaling so the long edge is at most
 * MEDIA_MAX_DIM. Falls back to JPEG if the platform runtime rejects WebP —
 * expo-image-manipulator has supported WEBP since v13 and we're on v55, so
 * this fallback is a belt-and-braces for exotic Android OEMs.
 */
export async function encodeToWebP(uri: string): Promise<EncodedImage> {
  const ImageManipulator = await import("expo-image-manipulator");

  const probe = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG
  });
  const longEdge = Math.max(probe.width, probe.height);
  const resize =
    longEdge > MEDIA_MAX_DIM
      ? [
          {
            resize:
              probe.width >= probe.height
                ? { width: MEDIA_MAX_DIM }
                : { height: MEDIA_MAX_DIM }
          }
        ]
      : [];

  const WEBP = (ImageManipulator.SaveFormat as Record<string, SaveFormatType>)
    .WEBP;
  if (WEBP) {
    try {
      const result = await ImageManipulator.manipulateAsync(uri, resize, {
        compress: MEDIA_WEBP_QUALITY,
        format: WEBP
      });
      return {
        uri: result.uri,
        mimeType: "image/webp",
        extension: ".webp"
      };
    } catch {
      // drop through to JPEG fallback
    }
  }

  const jpeg = await ImageManipulator.manipulateAsync(uri, resize, {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG
  });
  return {
    uri: jpeg.uri,
    mimeType: "image/jpeg",
    extension: ".jpg"
  };
}

export type UploadProgress = (ratio: number) => void;

export type PutOptions = {
  uploadUrl: string;
  publicUrl: string;
  body: Blob;
  contentType: string;
  onProgress?: UploadProgress;
};

const RETRY_DELAYS_MS = [1000, 3000, 7000];

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * PUT to R2 with upload progress + retry + HEAD verify.
 *
 * Retry only fires on network errors or 5xx — presigned-URL 4xx is fatal
 * (expired signature, bad payload) and retrying just wastes the user's time.
 */
export async function putWithProgressAndRetry({
  uploadUrl,
  publicUrl,
  body,
  contentType,
  onProgress
}: PutOptions): Promise<void> {
  let attempt = 0;
  while (true) {
    try {
      await putOnce({ uploadUrl, body, contentType, onProgress });
      // CDN read-after-write is usually instant on R2, but we've observed a
      // handful of 404s within ~1s of PUT during load spikes; a cheap HEAD
      // lets us retry before the user sees a broken image in the feed.
      const head = await fetch(publicUrl, { method: "HEAD" });
      if (head.ok) return;
      if (head.status >= 500 && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? 1000);
        attempt += 1;
        continue;
      }
      // 404/403 after PUT-200: likely eventual consistency. One short wait.
      await sleep(500);
      const retry = await fetch(publicUrl, { method: "HEAD" });
      if (retry.ok) return;
      throw new Error(`upload verify failed (${retry.status})`);
    } catch (err) {
      const retriable = isRetriableError(err);
      if (!retriable || attempt >= RETRY_DELAYS_MS.length) throw err;
      await sleep(RETRY_DELAYS_MS[attempt] ?? 1000);
      attempt += 1;
    }
  }
}

function putOnce({
  uploadUrl,
  body,
  contentType,
  onProgress
}: {
  uploadUrl: string;
  body: Blob;
  contentType: string;
  onProgress?: UploadProgress;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      if (!event.lengthComputable || event.total === 0) {
        onProgress(0);
        return;
      }
      onProgress(Math.min(1, event.loaded / event.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
        return;
      }
      const error = new Error(`R2 PUT failed (${xhr.status})`);
      (error as Error & { status?: number }).status = xhr.status;
      reject(error);
    };
    xhr.onerror = () => reject(new Error("R2 PUT network error"));
    xhr.ontimeout = () => reject(new Error("R2 PUT timed out"));
    xhr.send(body);
  });
}

function isRetriableError(err: unknown): boolean {
  if (err instanceof Error) {
    const status = (err as Error & { status?: number }).status;
    if (typeof status === "number") return status >= 500;
    // network/timeout/verify errors → retry
    return /network|timed out|verify/i.test(err.message);
  }
  return false;
}
