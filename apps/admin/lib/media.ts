// Browser-side WebP transcoder + resilient PUT uploader for the admin panel.
// Kept in sync with apps/shelter-web/lib/media.ts — same defaults, same
// retry/HEAD-verify contract. Admin uses it for venue covers, events, and
// shelter branding, so R2 objects land with a consistent format.

export const MEDIA_MAX_DIM = 1920;
export const MEDIA_WEBP_QUALITY = 0.8;

export type EncodedImage = {
  blob: Blob;
  mimeType: "image/webp" | "image/jpeg";
  extension: ".webp" | ".jpg";
};

export async function encodeFileToWebP(file: File): Promise<EncodedImage> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    return {
      blob: file,
      mimeType: (file.type === "image/webp" ? "image/webp" : "image/jpeg") as
        | "image/webp"
        | "image/jpeg",
      extension: file.type === "image/webp" ? ".webp" : ".jpg"
    };
  }

  const { width, height } = scaleDown(bitmap.width, bitmap.height, MEDIA_MAX_DIM);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const webp = await canvasToBlob(canvas, "image/webp", MEDIA_WEBP_QUALITY);
  if (webp && webp.type === "image/webp") {
    return { blob: webp, mimeType: "image/webp", extension: ".webp" };
  }
  const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.85);
  if (!jpeg) throw new Error("failed to encode image");
  return { blob: jpeg, mimeType: "image/jpeg", extension: ".jpg" };
}

function scaleDown(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  if (w >= h) return { width: max, height: Math.round((h * max) / w) };
  return { width: Math.round((w * max) / h), height: max };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
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

export async function uploadImageFile(
  file: File,
  folder: string,
  onProgress?: UploadProgress
): Promise<string> {
  const { adminPresignUpload } = await import("./admin-api");
  const encoded = await encodeFileToWebP(file);
  const base = file.name.replace(/\.[^.]+$/, "") || "upload";
  const canonicalName = `${base}${encoded.extension}`;

  const presign = (await adminPresignUpload(
    canonicalName,
    encoded.mimeType,
    folder
  )) as {
    objectKey: string;
    uploadUrl: string;
    publicUrl?: string;
    url?: string;
  };
  const publicUrl = presign.publicUrl ?? presign.url;
  if (!publicUrl) throw new Error("Upload succeeded but no public URL returned");

  await putWithProgressAndRetry({
    uploadUrl: presign.uploadUrl,
    publicUrl,
    body: encoded.blob,
    contentType: encoded.mimeType,
    onProgress
  });
  return publicUrl;
}
