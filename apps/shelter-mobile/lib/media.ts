// Shared WebP transcoder + resilient PUT uploader for the shelter-mobile app.
//
// Mirrors apps/mobile/lib/media.ts (same defaults, same retry/HEAD contract).
// Kept as a per-app copy on purpose — packages/ui is web-only, and crossing
// the React Native boundary inside that package would make its web bundles
// pull in expo-image-manipulator.

import type { SaveFormat as SaveFormatType } from "expo-image-manipulator";

export const MEDIA_MAX_DIM = 1920;
export const MEDIA_WEBP_QUALITY = 0.8;

export type EncodedImage = {
  uri: string;
  mimeType: "image/webp" | "image/jpeg";
  extension: ".webp" | ".jpg";
};

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
      // fall through
    }
  }

  const jpeg = await ImageManipulator.manipulateAsync(uri, resize, {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG
  });
  return { uri: jpeg.uri, mimeType: "image/jpeg", extension: ".jpg" };
}

export type UploadProgress = (ratio: number) => void;

const RETRY_DELAYS_MS = [1000, 3000, 7000];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function putWithProgressAndRetry(params: {
  uploadUrl: string;
  publicUrl: string;
  body: Blob;
  contentType: string;
  onProgress?: UploadProgress;
}): Promise<void> {
  let attempt = 0;
  while (true) {
    try {
      await putOnce(params);
      const head = await fetch(params.publicUrl, { method: "HEAD" });
      if (head.ok) return;
      if (head.status >= 500 && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? 1000);
        attempt += 1;
        continue;
      }
      await sleep(500);
      const retry = await fetch(params.publicUrl, { method: "HEAD" });
      if (retry.ok) return;
      throw new Error(`upload verify failed (${retry.status})`);
    } catch (err) {
      if (!isRetriable(err) || attempt >= RETRY_DELAYS_MS.length) throw err;
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

function isRetriable(err: unknown): boolean {
  if (err instanceof Error) {
    const status = (err as Error & { status?: number }).status;
    if (typeof status === "number") return status >= 500;
    return /network|timed out|verify/i.test(err.message);
  }
  return false;
}
