"use client";

// CSV bulk-import wizard for shelter adoption listings. All parsing
// and validation happens client-side against the shelter's jurisdiction
// config; valid rows are posted in one batch to /pets/bulk, which
// re-validates server-side and creates `draft` listings. Photos may
// arrive either as URL columns in the CSV or via a parallel ZIP upload
// matched by `photo_filename`.

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import Papa from "papaparse";
import JSZip from "jszip";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileWarning,
  Loader2,
  UploadCloud,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  bulkCreateShelterPets,
  getListingConfig,
  uploadFileToR2,
  type BulkImportResult,
  type ListingConfig
} from "@/lib/api";
import type { ShelterPet } from "@petto/contracts";

// ── Template ───────────────────────────────────────────────────────
// Order mirrors the spec's field table verbatim so shelters scanning
// headers against docs see the same sequence.
const TEMPLATE_HEADERS = [
  "name",
  "species",
  "breed",
  "age_value",
  "age_unit",
  "sex",
  "size",
  "weight_kg",
  "colour",
  "vaccination_status",
  "neuter_status",
  "microchip_id",
  "special_needs",
  "special_needs_description",
  "description",
  "home_type",
  "other_pets",
  "children",
  "experience_level",
  "other_requirements",
  "photo_filename",
  "photo_url_1",
  "photo_url_2",
  "photo_url_3"
] as const;

const TEMPLATE_EXAMPLE: Record<(typeof TEMPLATE_HEADERS)[number], string> = {
  name: "Luna",
  species: "dog",
  breed: "labrador",
  age_value: "24",
  age_unit: "months",
  sex: "female",
  size: "medium",
  weight_kg: "18.5",
  colour: "golden",
  vaccination_status: "up_to_date",
  neuter_status: "neutered",
  microchip_id: "",
  special_needs: "false",
  special_needs_description: "",
  description:
    "Luna is a gentle two-year-old labrador who loves long walks and quiet evenings on the sofa. Great with children and other dogs.",
  home_type: "house_with_garden",
  other_pets: "good_with_dogs",
  children: "good_with_children",
  experience_level: "first_time_welcome",
  other_requirements: "",
  photo_filename: "luna1.jpg",
  photo_url_1: "",
  photo_url_2: "",
  photo_url_3: ""
};

function buildTemplateCSV(): string {
  return Papa.unparse({
    fields: [...TEMPLATE_HEADERS],
    data: [TEMPLATE_EXAMPLE]
  });
}

// ── Row model ──────────────────────────────────────────────────────

type RawRow = Record<string, string>;
type ValidatedRow = {
  index: number;
  raw: RawRow;
  errors: string[];
  warnings: string[];
  // Normalised payload ready for submit; undefined when errors.length>0.
  payload?: Partial<ShelterPet>;
  // Filenames referenced by this row (may need to be resolved via ZIP).
  referencedFilenames: string[];
};

const ALLOWED_SPECIES = ["dog", "cat", "rabbit", "ferret", "small_mammal"];
const AGE_UNITS = ["weeks", "months", "years"];
const SEX = ["male", "female", "unknown"];
const SIZE = ["small", "medium", "large", "xl"];
const VAX = ["up_to_date", "partial", "not_vaccinated", "unknown"];
const NEUTER = ["neutered", "not_neutered", "unknown"];
const HOME = ["house_with_garden", "apartment", "either"];
const OTHER_PETS = [
  "good_with_dogs",
  "good_with_cats",
  "good_with_both",
  "no_other_pets",
  "unknown"
];
const CHILDREN = ["good_with_children", "no_young_children", "unknown"];
const EXPERIENCE = [
  "first_time_welcome",
  "experienced_preferred",
  "experienced_required"
];

function ageInMonths(valueStr: string, unit: string): number | undefined {
  const n = Number(valueStr);
  if (!valueStr || Number.isNaN(n) || n < 0) return undefined;
  if (unit === "weeks") return Math.floor((n * 7) / 30);
  if (unit === "months") return Math.floor(n);
  if (unit === "years") return Math.floor(n * 12);
  return undefined;
}

function ageInWeeks(valueStr: string, unit: string): number | undefined {
  const n = Number(valueStr);
  if (!valueStr || Number.isNaN(n) || n < 0) return undefined;
  if (unit === "weeks") return Math.floor(n);
  if (unit === "months") return Math.floor(n * 4);
  if (unit === "years") return Math.floor(n * 52);
  return undefined;
}

function isValidUrl(s: string): boolean {
  if (!s) return true;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isImageUrl(s: string): boolean {
  return /\.(jpe?g|png)(\?|#|$)/i.test(s);
}

function validateRow(
  index: number,
  raw: RawRow,
  config: ListingConfig
): ValidatedRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const referencedFilenames: string[] = [];

  const species = (raw.species ?? "").trim().toLowerCase();
  if (!species) errors.push("species is required");
  else if (!ALLOWED_SPECIES.includes(species))
    errors.push(`species "${species}" not allowed`);
  else if (config.prohibitedSpecies.some((p) => species.includes(p)))
    errors.push(`species "${species}" is prohibited`);

  const breed = (raw.breed ?? "").trim();
  if (!breed) errors.push("breed is required");
  else {
    const low = breed.toLowerCase();
    if (!low.includes("mixed") && !low.includes("unknown")) {
      const banned = config.bannedBreeds.find((b) => low.includes(b.toLowerCase()));
      if (banned)
        errors.push(`breed "${breed}" is restricted in ${config.operatingCountry}`);
    }
  }

  const ageValue = (raw.age_value ?? "").trim();
  const ageUnit = (raw.age_unit ?? "").trim().toLowerCase();
  const ageN = Number(ageValue);
  if (!ageValue || Number.isNaN(ageN) || ageN < 0)
    errors.push("age_value must be a non-negative integer");
  if (!AGE_UNITS.includes(ageUnit)) errors.push("age_unit must be weeks/months/years");

  const sex = (raw.sex ?? "").trim().toLowerCase();
  if (!SEX.includes(sex)) errors.push("sex must be male/female/unknown");
  const size = (raw.size ?? "").trim().toLowerCase();
  if (!SIZE.includes(size)) errors.push("size must be small/medium/large/xl");

  const weightStr = (raw.weight_kg ?? "").trim();
  if (weightStr) {
    const w = Number(weightStr);
    if (Number.isNaN(w) || w < 0) errors.push("weight_kg must be a positive decimal");
    if (/\.\d{3,}/.test(weightStr)) errors.push("weight_kg has more than 2 decimals");
  }
  const colour = (raw.colour ?? "").trim();
  if (colour.length > 50) errors.push("colour > 50 chars");

  const vax = (raw.vaccination_status ?? "").trim().toLowerCase();
  if (!VAX.includes(vax))
    errors.push("vaccination_status must be up_to_date/partial/not_vaccinated/unknown");
  const neuter = (raw.neuter_status ?? "").trim().toLowerCase();
  if (!NEUTER.includes(neuter))
    errors.push("neuter_status must be neutered/not_neutered/unknown");

  const microchip = (raw.microchip_id ?? "").trim();
  if (config.microchipMode === "required" && !microchip)
    errors.push("microchip_id is required in this region");
  if (microchip && !/^\d{15}$/.test(microchip))
    errors.push("microchip_id must be 15 digits (ISO 11784)");

  const specialNeedsRaw = (raw.special_needs ?? "").trim().toLowerCase();
  const specialNeeds = specialNeedsRaw === "true" || specialNeedsRaw === "1" || specialNeedsRaw === "yes";
  if (!["true", "false", "1", "0", "yes", "no", ""].includes(specialNeedsRaw))
    errors.push("special_needs must be true/false");
  const specialDesc = (raw.special_needs_description ?? "").trim();
  if (specialNeeds && !specialDesc)
    errors.push("special_needs_description required when special_needs=true");
  if (specialDesc.length > 500) errors.push("special_needs_description > 500 chars");

  const description = (raw.description ?? "").trim();
  if (description.length < 50) errors.push("description must be at least 50 characters");
  if (description.length > 2000) errors.push("description must be at most 2000 characters");

  const homeType = (raw.home_type ?? "").trim().toLowerCase();
  if (homeType && !HOME.includes(homeType)) errors.push("home_type invalid");
  const otherPets = (raw.other_pets ?? "").trim().toLowerCase();
  if (otherPets && !OTHER_PETS.includes(otherPets)) errors.push("other_pets invalid");
  const children = (raw.children ?? "").trim().toLowerCase();
  if (children && !CHILDREN.includes(children)) errors.push("children invalid");
  const experience = (raw.experience_level ?? "").trim().toLowerCase();
  if (experience && !EXPERIENCE.includes(experience))
    errors.push("experience_level invalid");
  const otherReq = (raw.other_requirements ?? "").trim();
  if (otherReq.length > 500) errors.push("other_requirements > 500 chars");

  const photoFilename = (raw.photo_filename ?? "").trim();
  const photoUrls = [raw.photo_url_1, raw.photo_url_2, raw.photo_url_3]
    .map((u) => (u ?? "").trim())
    .filter((u) => u !== "");
  for (const u of photoUrls) {
    if (!isValidUrl(u)) errors.push(`invalid photo URL: ${u}`);
    else if (!isImageUrl(u)) errors.push(`photo URL must be JPG/PNG: ${u}`);
  }
  if (photoFilename) referencedFilenames.push(photoFilename);
  if (!photoFilename && photoUrls.length === 0)
    errors.push("at least one photo (photo_filename via ZIP or photo_url_1) is required");

  // Warnings (flag but don't block).
  const weeks = ageInWeeks(ageValue, ageUnit);
  if (weeks != null && weeks < config.minAgeWeeks)
    warnings.push(`under ${config.minAgeWeeks} weeks — will be held for review on publish`);
  for (const kw of config.pregnancyKeywords) {
    if (description.toLowerCase().includes(kw.toLowerCase())) {
      warnings.push(`mentions "${kw}" — will be held for review on publish`);
      break;
    }
  }

  if (errors.length > 0) {
    return { index, raw, errors, warnings, referencedFilenames };
  }

  const months = ageInMonths(ageValue, ageUnit);
  const characterTags = [
    homeType ? `home:${homeType}` : "",
    otherPets ? `pets:${otherPets}` : "",
    children ? `children:${children}` : "",
    experience ? `xp:${experience}` : "",
    vax ? `vax:${vax}` : "",
    weightStr ? `weight:${weightStr}` : "",
    otherReq ? `req:${otherReq.replace(/\s+/g, "_").slice(0, 80)}` : ""
  ].filter(Boolean);

  const payload: Partial<ShelterPet> = {
    name: (raw.name ?? "").trim(),
    species,
    breed,
    sex,
    size,
    color: colour,
    ageMonths: months,
    description,
    microchipId: microchip,
    specialNeeds: specialNeeds ? specialDesc : "",
    isNeutered: neuter === "neutered",
    characterTags,
    photos: photoUrls,
    vaccines: []
  };

  return { index, raw, errors, warnings, payload, referencedFilenames };
}

// ── Main component ────────────────────────────────────────────────

type Step = "upload" | "review" | "photos" | "result";

export function BulkImport() {
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["listing-config"],
    queryFn: getListingConfig
  });

  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ValidatedRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [photoMap, setPhotoMap] = useState<Record<string, string>>({});
  const [uploadingZip, setUploadingZip] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Stats
  const validRows = useMemo(() => rows.filter((r) => r.errors.length === 0), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => r.errors.length > 0), [rows]);
  const needsPhoto = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.errors.length === 0 &&
          r.referencedFilenames.length > 0 &&
          !r.referencedFilenames.every((fn) => photoMap[fn])
      ),
    [rows, photoMap]
  );
  const unresolvedFilenames = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.errors.length > 0) continue;
      for (const fn of r.referencedFilenames) {
        if (!photoMap[fn]) set.add(fn);
      }
    }
    return Array.from(set);
  }, [rows, photoMap]);

  // Template download
  const downloadTemplate = () => {
    const csv = buildTemplateCSV();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, "petto-listings-template.csv");
  };

  // Parse CSV
  const onCsvSelected = (file: File) => {
    if (!config) return;
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        let all = res.data as RawRow[];
        let ignored = 0;
        if (all.length > 500) {
          ignored = all.length - 500;
          all = all.slice(0, 500);
        }
        const validated = all.map((row, i) => validateRow(i, row, config));
        setRows(validated);
        setSelected(new Set(validated.filter((r) => r.errors.length === 0).map((r) => r.index)));
        setIgnoredCount(ignored);
        setStep("review");
      },
      error: (err) => toast.error(err.message || "CSV parse failed")
    });
  };

  // Handle ZIP
  const onZipSelected = async (file: File) => {
    setUploadingZip(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((f) => !f.dir);
      const map: Record<string, string> = { ...photoMap };
      for (const entry of entries) {
        const name = entry.name.split("/").pop() ?? entry.name;
        if (!/\.(jpe?g|png)$/i.test(name)) continue;
        const blob = await entry.async("blob");
        if (blob.size > 5 * 1024 * 1024) {
          toast.error(`${name} exceeds 5MB — skipped`);
          continue;
        }
        const mime = /\.png$/i.test(name) ? "image/png" : "image/jpeg";
        const f = new File([blob], name, { type: mime });
        try {
          const url = await uploadFileToR2(f, "shelter-pets");
          map[name] = url;
        } catch (e) {
          toast.error(`Upload failed for ${name}: ${(e as Error).message}`);
        }
      }
      setPhotoMap(map);
      toast.success(`Uploaded ${Object.keys(map).length - Object.keys(photoMap).length} photos`);
    } catch (e) {
      toast.error(`ZIP read failed: ${(e as Error).message}`);
    } finally {
      setUploadingZip(false);
    }
  };

  // Fold resolved filenames into row payloads right before import.
  const finalisePayloads = (): Partial<ShelterPet>[] => {
    const out: Partial<ShelterPet>[] = [];
    for (const r of rows) {
      if (r.errors.length > 0 || !selected.has(r.index) || !r.payload) continue;
      const extraPhotos = r.referencedFilenames
        .map((fn) => photoMap[fn])
        .filter((u): u is string => !!u);
      const photos = [...extraPhotos, ...(r.payload.photos ?? [])];
      out.push({ ...r.payload, photos });
    }
    return out;
  };

  const runImport = async () => {
    const payloads = finalisePayloads();
    if (payloads.length === 0) {
      toast.error("Nothing selected to import.");
      return;
    }
    setImporting(true);
    try {
      const res = await bulkCreateShelterPets(payloads);
      setResult({ ...res, ignored: res.ignored + ignoredCount });
      setStep("result");
    } catch (e) {
      toast.error((e as Error).message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const downloadFailedRows = () => {
    if (!result) return;
    const failedIndices = new Set(result.errors.map((e) => e.index));
    const failedRows = rows
      .filter((r) => failedIndices.has(r.index) || r.errors.length > 0)
      .map((r) => {
        const apiErr = result.errors.find((e) => e.index === r.index)?.error ?? "";
        const clientErrs = r.errors.join("; ");
        return { ...r.raw, error: clientErrs || apiErr };
      });
    if (failedRows.length === 0) {
      toast.info("No failed rows to download.");
      return;
    }
    const csv = Papa.unparse(failedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, "petto-import-errors.csv");
  };

  if (configLoading || !config) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === "upload" && (
        <Card className="space-y-5 rounded-2xl border-[var(--border)] bg-white p-6 shadow-card">
          <div>
            <h2 className="text-lg font-semibold">Step 1 — Download the template</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              One listing per row. Keep the header order. The example row shows the
              expected value format.
            </p>
            <Button onClick={downloadTemplate} className="mt-3 gap-1" variant="outline">
              <Download className="h-4 w-4" />
              Download CSV template
            </Button>
          </div>
          <div className="border-t border-[var(--border)] pt-5">
            <h2 className="text-lg font-semibold">Step 2 — Upload your CSV</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Max 500 rows. Rows beyond 500 are ignored. Draft listings only — you'll
              publish each (or bulk-publish) after review.
            </p>
            <label
              htmlFor="bulk-csv"
              className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--muted)] p-8 text-center transition hover:border-[var(--primary)]"
            >
              <UploadCloud className="h-7 w-7 text-[var(--primary)]" />
              <div className="text-sm font-semibold">Click to upload your CSV</div>
              <div className="text-xs text-[var(--muted-foreground)]">
                Jurisdiction:{" "}
                <span className="font-semibold text-[var(--foreground)]">
                  {config.operatingCountry || "—"}
                </span>
                {" · "}Microchip mode:{" "}
                <span className="font-semibold text-[var(--foreground)]">
                  {config.microchipMode}
                </span>
              </div>
              <input
                id="bulk-csv"
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onCsvSelected(e.target.files[0])}
              />
            </label>
          </div>
        </Card>
      )}

      {step === "review" && (
        <ReviewStep
          rows={rows}
          selected={selected}
          setSelected={setSelected}
          validCount={validRows.length}
          invalidCount={invalidRows.length}
          ignoredCount={ignoredCount}
          onNext={() => setStep(needsPhoto.length > 0 ? "photos" : "result")}
          onBack={() => {
            setStep("upload");
            setRows([]);
            setSelected(new Set());
          }}
          goImport={runImport}
          photoMap={photoMap}
          unresolvedFilenames={unresolvedFilenames}
          importing={importing}
          goPhotos={() => setStep("photos")}
        />
      )}

      {step === "photos" && (
        <Card className="space-y-5 rounded-2xl border-[var(--border)] bg-white p-6 shadow-card">
          <div>
            <h2 className="text-lg font-semibold">Step 3 — Photos</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Upload a ZIP containing the filenames referenced by your CSV's
              <code className="mx-1 rounded bg-[var(--muted)] px-1 text-xs">photo_filename</code>
              column. JPG or PNG, max 5MB each.
            </p>
            <label
              htmlFor="bulk-zip"
              className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--muted)] p-8 text-center transition hover:border-[var(--primary)]"
            >
              {uploadingZip ? (
                <Loader2 className="h-7 w-7 animate-spin text-[var(--primary)]" />
              ) : (
                <UploadCloud className="h-7 w-7 text-[var(--primary)]" />
              )}
              <div className="text-sm font-semibold">
                {uploadingZip ? "Uploading…" : "Click to upload ZIP of photos"}
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {Object.keys(photoMap).length} uploaded so far
              </div>
              <input
                id="bulk-zip"
                ref={zipInputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onZipSelected(e.target.files[0])}
              />
            </label>
          </div>
          {unresolvedFilenames.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-semibold">Missing {unresolvedFilenames.length} photo(s):</div>
              <div className="mt-1 break-all text-xs">{unresolvedFilenames.join(", ")}</div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep("review")}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <Button onClick={runImport} disabled={importing}>
              {importing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-1 h-4 w-4" />
              )}
              Import {selected.size} listings
            </Button>
          </div>
        </Card>
      )}

      {step === "result" && result && (
        <ResultStep
          result={result}
          onDownload={downloadFailedRows}
          onReset={() => {
            setStep("upload");
            setRows([]);
            setSelected(new Set());
            setPhotoMap({});
            setResult(null);
            setIgnoredCount(0);
          }}
        />
      )}
    </div>
  );
}

// ── Step: Stepper ──────────────────────────────────────────────────

function Stepper({ step }: { step: Step }) {
  const labels: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "review", label: "Review" },
    { key: "photos", label: "Photos" },
    { key: "result", label: "Result" }
  ];
  const order = labels.findIndex((l) => l.key === step);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {labels.map((l, i) => {
        const active = l.key === step;
        const done = i < order;
        return (
          <div key={l.key} className="flex items-center gap-2">
            <div
              className={[
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                active
                  ? "bg-[var(--primary)] text-white"
                  : done
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-[var(--border)] text-[var(--muted-foreground)]"
              ].join(" ")}
            >
              {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
            </div>
            <span className={active ? "font-semibold" : "text-[var(--muted-foreground)]"}>{l.label}</span>
            {i < labels.length - 1 && <span className="text-[var(--muted-foreground)]">›</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Step: Review ───────────────────────────────────────────────────

function ReviewStep({
  rows,
  selected,
  setSelected,
  validCount,
  invalidCount,
  ignoredCount,
  onNext,
  onBack,
  photoMap,
  unresolvedFilenames,
  importing,
  goImport,
  goPhotos
}: {
  rows: ValidatedRow[];
  selected: Set<number>;
  setSelected: React.Dispatch<React.SetStateAction<Set<number>>>;
  validCount: number;
  invalidCount: number;
  ignoredCount: number;
  onNext: () => void;
  onBack: () => void;
  photoMap: Record<string, string>;
  unresolvedFilenames: string[];
  importing: boolean;
  goImport: () => void;
  goPhotos: () => void;
}) {
  void onNext;
  const toggle = (idx: number) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };
  return (
    <Card className="space-y-5 rounded-2xl border-[var(--border)] bg-white p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Step 2 — Review rows</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {validCount} valid · {invalidCount} with errors
            {ignoredCount > 0 ? ` · ${ignoredCount} ignored (500-row cap)` : ""}
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Re-upload
        </Button>
      </div>

      <div className="rounded-xl border border-[var(--border)]">
        <div className="max-h-[55vh] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--muted)] text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
              <tr>
                <th className="w-10 p-2 text-left"></th>
                <th className="p-2 text-left">#</th>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Species · Breed</th>
                <th className="p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ok = r.errors.length === 0;
                const checked = selected.has(r.index);
                const missingPhoto = r.referencedFilenames.some((fn) => !photoMap[fn]);
                return (
                  <tr
                    key={r.index}
                    className={[
                      "border-t border-[var(--border)] align-top",
                      ok ? "" : "bg-rose-50/50"
                    ].join(" ")}
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        disabled={!ok}
                        checked={checked}
                        onChange={() => toggle(r.index)}
                      />
                    </td>
                    <td className="p-2 text-[var(--muted-foreground)]">{r.index + 1}</td>
                    <td className="p-2 font-medium">{r.raw.name || "—"}</td>
                    <td className="p-2 text-[var(--muted-foreground)]">
                      {r.raw.species || "—"} / {r.raw.breed || "—"}
                    </td>
                    <td className="p-2">
                      {!ok ? (
                        <div className="space-y-1">
                          {r.errors.map((e, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-1 text-xs text-rose-700"
                            >
                              <X className="mt-0.5 h-3 w-3 flex-shrink-0" />
                              {e}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {r.warnings.map((wn, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-1 text-xs text-amber-700"
                            >
                              <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                              {wn}
                            </div>
                          ))}
                          {missingPhoto && (
                            <div className="flex items-start gap-1 text-xs text-amber-700">
                              <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                              needs photo: {r.referencedFilenames.join(", ")}
                            </div>
                          )}
                          {r.errors.length === 0 &&
                            r.warnings.length === 0 &&
                            !missingPhoto && (
                              <div className="flex items-center gap-1 text-xs text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" /> Ready
                              </div>
                            )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="text-sm text-[var(--muted-foreground)]">
          Importing <strong>{selected.size}</strong> listing{selected.size === 1 ? "" : "s"} as drafts.
          {unresolvedFilenames.length > 0 && (
            <span className="ml-2 text-amber-700">
              {unresolvedFilenames.length} missing photo(s) — upload a ZIP to attach them.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unresolvedFilenames.length > 0 ? (
            <Button variant="outline" onClick={goPhotos}>
              Upload photos
            </Button>
          ) : null}
          <Button onClick={goImport} disabled={importing || selected.size === 0}>
            {importing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-1 h-4 w-4" />}
            Import {selected.size} as drafts
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── Step: Result ───────────────────────────────────────────────────

function ResultStep({
  result,
  onDownload,
  onReset
}: {
  result: BulkImportResult;
  onDownload: () => void;
  onReset: () => void;
}) {
  return (
    <Card className="space-y-5 rounded-2xl border-[var(--border)] bg-white p-6 shadow-card">
      <div>
        <h2 className="text-lg font-semibold">Step 4 — Import complete</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          All imported listings are <strong>drafts</strong>. Review each in the pets list
          and publish when ready.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} tone="success" label="Imported" value={result.created.length} />
        <Stat icon={<FileWarning className="h-4 w-4" />} tone="danger" label="Failed" value={result.errors.length} />
        <Stat icon={<FileSpreadsheet className="h-4 w-4" />} tone="muted" label="Ignored (>500)" value={result.ignored} />
      </div>
      {result.errors.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Failed rows</div>
          <div className="max-h-60 overflow-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <tbody>
                {result.errors.map((e) => (
                  <tr key={e.index} className="border-t border-[var(--border)]">
                    <td className="w-16 p-2 text-[var(--muted-foreground)]">#{e.index + 1}</td>
                    <td className="p-2 text-rose-700">{e.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download className="mr-1 h-4 w-4" />
            Download failed rows (CSV)
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href="/pets?status=draft">See my drafts</Link>
        </Button>
        <Button variant="outline" onClick={onReset}>
          Import another CSV
        </Button>
      </div>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "success" | "danger" | "muted";
}) {
  const palette =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "danger"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : "border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]";
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${palette}`}>
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70">
        {icon}
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider opacity-70">
          {label}
        </div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </div>
  );
}

// ── Utility ────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
