"use client";

import { useCallback, useId, useRef, useState } from "react";
import { FileText, Loader2, UploadCloud, X } from "lucide-react";

import { uploadCertificate } from "@/lib/apply-api";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "application/pdf,image/jpeg,image/png";

type CertificateUploadProps = {
  value: string;
  onChange: (url: string) => void;
  error?: string;
};

// Drag-and-drop (+ file picker) zone, single-file only. After a successful
// upload we persist the R2 public URL alongside the original filename so
// the review step can show the applicant something recognisable.

export function CertificateUpload({
  value,
  onChange,
  error
}: CertificateUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const describedBy = useId();

  const handleFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      if (file.size > MAX_BYTES) {
        setUploadError("File is larger than 10MB");
        return;
      }
      const okTypes = [
        "application/pdf",
        "image/jpeg",
        "image/jpg",
        "image/png"
      ];
      if (!okTypes.includes(file.type)) {
        setUploadError("Upload a PDF, JPG, or PNG file");
        return;
      }
      setUploading(true);
      try {
        const url = await uploadCertificate(file);
        onChange(url);
        setFilename(file.name);
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Upload failed — try again"
        );
      } finally {
        setUploading(false);
      }
    },
    [onChange]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  const clear = () => {
    onChange("");
    setFilename("");
    setUploadError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor="certificate-input"
        aria-describedby={describedBy}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={[
          "relative flex cursor-pointer flex-col items-center justify-center rounded-[20px] border-2 border-dashed p-6 md:p-8 transition",
          dragActive
            ? "border-[color:var(--primary)] bg-[color:var(--primary-soft)]"
            : value
              ? "border-[color:var(--primary)]/40 bg-[color:var(--primary-soft)]"
              : "border-[color:var(--border)] hover:border-[color:var(--primary)]/60 hover:bg-[color:var(--muted)]",
          uploading ? "opacity-60 pointer-events-none" : ""
        ].join(" ")}
      >
        <input
          id="certificate-input"
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {value ? (
          <div className="flex w-full items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[color:var(--primary)] text-white">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-[color:var(--foreground)]">
                {filename || "Certificate uploaded"}
              </p>
              <a
                href={value}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[12px] text-[color:var(--primary)] underline underline-offset-2"
              >
                Open file
              </a>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                clear();
              }}
              aria-label="Remove file"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[color:var(--muted-foreground)] hover:text-[color:var(--destructive)] border border-[color:var(--border)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-[color:var(--primary-soft)] text-[color:var(--primary)]">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <UploadCloud className="h-5 w-5" />
              )}
            </div>
            <p className="mt-3 text-[14px] font-semibold text-[color:var(--foreground)]">
              {uploading
                ? "Uploading…"
                : "Drag & drop, or click to upload certificate"}
            </p>
            <p
              id={describedBy}
              className="mt-1 text-[12px] text-[color:var(--muted-foreground)]"
            >
              PDF, JPG, or PNG · 1 file · up to 10MB
            </p>
          </div>
        )}
      </label>
      {(error || uploadError) && (
        <p className="text-[12px] text-[color:var(--destructive)]">
          {uploadError ?? error}
        </p>
      )}
    </div>
  );
}
