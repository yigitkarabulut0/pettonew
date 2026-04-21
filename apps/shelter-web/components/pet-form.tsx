"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  Heart,
  ImagePlus,
  Loader2,
  PawPrint,
  Plus,
  Sparkles,
  Star,
  Stethoscope,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getTaxonomy, uploadFileToR2 } from "@/lib/api";
import type { ShelterPet } from "@petto/contracts";

export type PetFormValues = {
  name: string;
  species: string;            // species slug
  breed: string;              // breed slug (filtered by species)
  sex: string;
  size: string;
  birthDate: string;
  birthDateUnknown: boolean;
  intakeDate: string;
  intakeDateUnknown: boolean;
  ageMonths: string;
  description: string;
  microchipId: string;
  specialNeeds: string;
  isNeutered: boolean;
  isUrgent: boolean;
  status: ShelterPet["status"];
  characterTags: string[];
  vaccines: Array<{ name: string; date: string; notes: string }>;
  photos: string[];
};

const CHARACTER_OPTIONS = [
  "playful",
  "calm",
  "curious",
  "kid-friendly",
  "dog-friendly",
  "cat-friendly",
  "house-trained",
  "shy",
  "energetic",
  "cuddly",
];

// File constraints shown to the user + enforced before upload.
const MAX_PHOTO_MB = 5;
const MAX_PHOTOS = 10;

const STATUS_LABEL: Record<ShelterPet["status"], string> = {
  available: "Available",
  reserved: "Reserved",
  adopted: "Adopted",
  hidden: "Hidden",
};

export function PetForm({
  defaultValues,
  onSubmit,
  submitLabel,
  pending,
}: {
  defaultValues: PetFormValues;
  onSubmit: (values: PetFormValues) => void;
  submitLabel: string;
  pending: boolean;
}) {
  const { register, handleSubmit, watch, setValue, control } = useForm<PetFormValues>({
    defaultValues,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "vaccines" });

  /* ── Taxonomies from admin catalogue ───────────────────────── */
  const { data: speciesList = [] } = useQuery({
    queryKey: ["shelter-taxonomy", "species"],
    queryFn: () => getTaxonomy("species"),
    staleTime: 5 * 60_000,
  });
  const { data: breedsList = [] } = useQuery({
    queryKey: ["shelter-taxonomy", "breeds"],
    queryFn: () => getTaxonomy("breeds"),
    staleTime: 5 * 60_000,
  });

  const speciesSlug = watch("species");
  const selectedSpecies = speciesList.find((s) => s.slug === speciesSlug);
  const breedsForSpecies = selectedSpecies
    ? breedsList.filter((b) => b.speciesId === selectedSpecies.id)
    : breedsList;

  /* ── Controlled fields ─────────────────────────────────────── */
  const birthDateUnknown = watch("birthDateUnknown");
  const intakeDateUnknown = watch("intakeDateUnknown");
  const characterTags = watch("characterTags") ?? [];
  // Strip empty / null URLs so a stale entry can never render <img src="">.
  const photos = (watch("photos") ?? []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );
  const status = watch("status");
  const sex = watch("sex");
  const size = watch("size");
  const isNeutered = watch("isNeutered");
  const isUrgent = watch("isUrgent");
  const name = watch("name");
  const description = watch("description");

  // When the "unknown" toggle is on, clear the date so the form sends "".
  useEffect(() => {
    if (birthDateUnknown) setValue("birthDate", "");
  }, [birthDateUnknown, setValue]);
  useEffect(() => {
    if (intakeDateUnknown) setValue("intakeDate", "");
  }, [intakeDateUnknown, setValue]);

  function toggleTag(tag: string) {
    setValue(
      "characterTags",
      characterTags.includes(tag)
        ? characterTags.filter((t) => t !== tag)
        : [...characterTags, tag]
    );
  }

  function makePrimary(idx: number) {
    if (idx === 0) return;
    const next = [...photos];
    const [picked] = next.splice(idx, 1);
    if (picked) next.unshift(picked);
    setValue("photos", next);
  }

  /* ── R2 photo upload ───────────────────────────────────────── */
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  async function onPhotoFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (photos.length + files.length > MAX_PHOTOS) {
      toast.error(`You can upload up to ${MAX_PHOTOS} photos per pet.`);
      return;
    }
    const accepted: File[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) {
        toast.error(`${f.name} is not an image.`);
        continue;
      }
      if (f.size > MAX_PHOTO_MB * 1024 * 1024) {
        toast.error(`${f.name} is larger than ${MAX_PHOTO_MB} MB.`);
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    const urls: string[] = [];
    for (let i = 0; i < accepted.length; i += 1) {
      try {
        const url = await uploadFileToR2(accepted[i]!, "shelter-pets");
        if (typeof url === "string" && url.trim().length > 0) {
          urls.push(url);
        }
        setUploadProgress(Math.round(((i + 1) / accepted.length) * 100));
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : `Upload failed for ${accepted[i]!.name}`
        );
      }
    }
    setValue("photos", [...photos, ...urls]);
    setUploading(false);
  }

  function submitClean(values: PetFormValues) {
    onSubmit({
      ...values,
      photos: values.photos.filter(
        (u) => typeof u === "string" && u.trim().length > 0
      ),
    });
  }

  return (
    <form onSubmit={handleSubmit(submitClean)} className="space-y-6 pb-28">
      {/* Hero strip */}
      <div className="rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[#f08d6a] p-[1px] shadow-orange">
        <div className="flex items-center justify-between rounded-2xl bg-[var(--background)] px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
              <PawPrint className="size-6" />
            </div>
            <div>
              <p className="eyebrow">Pet profile</p>
              <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                {name?.trim() ? name : "New companion"}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Fill in the basics — adopters will see this on Fetcht.
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <StatusPill value={status} />
          </div>
        </div>
      </div>

      <SectionCard
        icon={<PawPrint className="size-4" />}
        title="Basic info"
        subtitle="Identity, breed, sex, size and key dates."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Name" required>
            <Input
              {...register("name", { required: true })}
              placeholder="e.g. Mango"
              className="h-10"
            />
          </Field>
          <Field label="Status">
            <Select value={status} onValueChange={(v) => setValue("status", v as ShelterPet["status"])}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as ShelterPet["status"][]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {STATUS_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Species">
            <Select
              value={speciesSlug || ""}
              onValueChange={(v) => {
                setValue("species", v);
                setValue("breed", "");
              }}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select a species…" />
              </SelectTrigger>
              <SelectContent>
                {speciesList.map((s) => (
                  <SelectItem key={s.id} value={s.slug}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label={selectedSpecies ? `Breed (${selectedSpecies.label})` : "Breed"}>
            <Select
              value={watch("breed") || ""}
              onValueChange={(v) => setValue("breed", v)}
              disabled={!speciesSlug}
            >
              <SelectTrigger className="h-10">
                <SelectValue
                  placeholder={speciesSlug ? "Select a breed…" : "Pick a species first"}
                />
              </SelectTrigger>
              <SelectContent>
                {breedsForSpecies.map((b) => (
                  <SelectItem key={b.id} value={b.slug}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Sex">
            <Select value={sex || ""} onValueChange={(v) => setValue("sex", v)}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Size">
            <Select value={size || ""} onValueChange={(v) => setValue("size", v)}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Age (months)">
            <Input
              type="number"
              inputMode="numeric"
              placeholder="e.g. 18"
              className="h-10"
              {...register("ageMonths")}
            />
          </Field>
          <div />
        </div>

        {/* Date rows with "I don't know" toggles */}
        <div className="grid gap-5 md:grid-cols-2">
          <DateFieldWithUnknown
            label="Birth date"
            registerId="birthDate"
            register={register}
            unknown={Boolean(birthDateUnknown)}
            onToggleUnknown={(v) => setValue("birthDateUnknown", v)}
          />
          <DateFieldWithUnknown
            label="Intake date"
            registerId="intakeDate"
            register={register}
            unknown={Boolean(intakeDateUnknown)}
            onToggleUnknown={(v) => setValue("intakeDateUnknown", v)}
          />
        </div>

        <Field label="Description">
          <textarea
            rows={5}
            className="w-full rounded-xl border border-[var(--input)] bg-white px-3.5 py-2.5 text-sm shadow-soft outline-none transition focus:border-[var(--primary)] focus:ring-orange"
            placeholder="Short story, personality highlights, living situation…"
            {...register("description")}
          />
          <p className="text-[11px] text-[var(--muted-foreground)]">
            {(description ?? "").length} characters
          </p>
        </Field>
      </SectionCard>

      <SectionCard
        icon={<Sparkles className="size-4" />}
        title="Character"
        subtitle="Pick the traits that adopters should know about."
        right={
          <span className="text-xs text-[var(--muted-foreground)]">
            {characterTags.length} selected
          </span>
        }
      >
        <div className="flex flex-wrap gap-2">
          {CHARACTER_OPTIONS.map((tag) => {
            const active = characterTags.includes(tag);
            return (
              <button
                type="button"
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`group inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? "border-transparent bg-[var(--primary)] text-white shadow-orange"
                    : "border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                }`}
              >
                {active ? <CheckCircle2 className="size-3.5" /> : null}
                {tag}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        icon={<Stethoscope className="size-4" />}
        title="Health"
        subtitle="Microchip, neutering and vaccine record."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Microchip ID">
            <Input
              placeholder="e.g. 985112004523456"
              className="h-10"
              {...register("microchipId")}
            />
          </Field>
          <Field label="Neutered / spayed">
            <button
              type="button"
              onClick={() => setValue("isNeutered", !isNeutered)}
              className={`flex h-10 items-center justify-between rounded-xl border px-3.5 text-sm font-medium transition ${
                isNeutered
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "border-[var(--border)] bg-white text-[var(--muted-foreground)]"
              }`}
            >
              <span className="flex items-center gap-2">
                <Heart className={`size-4 ${isNeutered ? "fill-[var(--primary)]" : ""}`} />
                {isNeutered ? "Yes — already done" : "Not yet"}
              </span>
              <span
                className={`h-5 w-9 rounded-full p-0.5 transition ${
                  isNeutered ? "bg-[var(--primary)]" : "bg-[var(--border)]"
                }`}
              >
                <span
                  className={`block size-4 rounded-full bg-white shadow-soft transition ${
                    isNeutered ? "translate-x-4" : ""
                  }`}
                />
              </span>
            </button>
          </Field>
          <Field label="Mark as urgent">
            <button
              type="button"
              onClick={() => setValue("isUrgent", !isUrgent)}
              className={`flex h-10 items-center justify-between rounded-xl border px-3.5 text-sm font-medium transition ${
                isUrgent
                  ? "border-rose-500 bg-rose-50 text-rose-700"
                  : "border-[var(--border)] bg-white text-[var(--muted-foreground)]"
              }`}
              aria-pressed={isUrgent}
            >
              <span className="flex items-center gap-2">
                <Sparkles className={`size-4 ${isUrgent ? "text-rose-600" : ""}`} />
                {isUrgent ? "Urgent — rehome ASAP" : "Not urgent"}
              </span>
              <span
                className={`h-5 w-9 rounded-full p-0.5 transition ${
                  isUrgent ? "bg-rose-500" : "bg-[var(--border)]"
                }`}
              >
                <span
                  className={`block size-4 rounded-full bg-white shadow-soft transition ${
                    isUrgent ? "translate-x-4" : ""
                  }`}
                />
              </span>
            </button>
          </Field>
          <Field label="Special needs" span>
            <textarea
              rows={3}
              className="w-full rounded-xl border border-[var(--input)] bg-white px-3.5 py-2.5 text-sm shadow-soft outline-none transition focus:border-[var(--primary)] focus:ring-orange"
              placeholder="Medications, allergies, accessibility…"
              {...register("specialNeeds")}
            />
          </Field>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Vaccines</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ name: "", date: "", notes: "" })}
              className="gap-1.5 rounded-full"
            >
              <Plus className="size-3.5" /> Add vaccine
            </Button>
          </div>
          {fields.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)] p-5 text-center text-xs text-[var(--muted-foreground)]">
              No vaccines logged yet. Tap “Add vaccine” when you have one.
            </div>
          ) : (
            <div className="space-y-2">
              {fields.map((f, idx) => (
                <div
                  key={f.id}
                  className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2 rounded-xl border border-[var(--border)] bg-white p-2 shadow-soft"
                >
                  <Input
                    placeholder="Vaccine name"
                    {...register(`vaccines.${idx}.name` as const)}
                  />
                  <Input
                    type="date"
                    {...register(`vaccines.${idx}.date` as const)}
                  />
                  <Input
                    placeholder="Notes"
                    {...register(`vaccines.${idx}.notes` as const)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(idx)}
                    className="text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        icon={<ImagePlus className="size-4" />}
        title="Photos"
        subtitle="The first photo will be the cover. Drag to reorder coming soon."
        right={
          <span className="text-xs text-[var(--muted-foreground)]">
            {photos.length} / {MAX_PHOTOS}
          </span>
        }
      >
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void onPhotoFiles(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
            uploading
              ? "border-[var(--primary)] bg-[var(--primary-soft)]"
              : dragOver
                ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                : "border-[var(--border)] bg-white hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="size-7 animate-spin text-[var(--primary)]" />
              <span className="text-sm font-semibold text-[var(--primary)]">
                Uploading… {uploadProgress}%
              </span>
            </>
          ) : (
            <>
              <div className="flex size-12 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                <UploadCloud className="size-6" />
              </div>
              <span className="text-sm font-semibold text-[var(--foreground)]">
                Drop photos here, or click to browse
              </span>
              <span className="text-[11px] text-[var(--muted-foreground)]">
                JPG · PNG · HEIC up to {MAX_PHOTO_MB}MB · ideally 1200×1200 px
              </span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={uploading || photos.length >= MAX_PHOTOS}
            onChange={(e) => {
              const files = e.target.files;
              void onPhotoFiles(files);
              e.currentTarget.value = "";
            }}
          />
        </label>

        {photos.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {photos.map((url, idx) => (
              <div
                key={`${url}-${idx}`}
                className="group relative aspect-square overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--muted)] shadow-soft"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="size-full object-cover" />
                {idx === 0 ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-orange">
                    <Star className="size-3 fill-white" /> Cover
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makePrimary(idx)}
                    className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground)] opacity-0 shadow-soft transition group-hover:opacity-100"
                  >
                    <Star className="size-3" /> Set cover
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setValue(
                      "photos",
                      photos.filter((_, i) => i !== idx)
                    )
                  }
                  className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
                  aria-label="Remove photo"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {characterTags.length === 0 ? null : (
          <div className="flex flex-wrap gap-1 pt-1">
            {characterTags.map((tag) => (
              <Badge key={tag} tone="info">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-6 py-3">
          <p className="hidden text-xs text-[var(--muted-foreground)] sm:block">
            Changes are saved when you press <span className="font-semibold">{submitLabel}</span>.
          </p>
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => history.back()}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || uploading}
              className="rounded-full px-6 shadow-orange"
            >
              {pending ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

/* ─── Local UI helpers ──────────────────────────────────────── */

function SectionCard({
  icon,
  title,
  subtitle,
  right,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-5 rounded-2xl border-[var(--border)] bg-white p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
            {icon}
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {subtitle ? (
              <p className="text-xs text-[var(--muted-foreground)]">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {right}
      </div>
      <div className="space-y-5">{children}</div>
    </Card>
  );
}

function Field({
  label,
  children,
  span,
  required,
}: {
  label: string;
  children: React.ReactNode;
  span?: boolean;
  required?: boolean;
}) {
  return (
    <div className={`space-y-1.5 ${span ? "md:col-span-2" : ""}`}>
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
        {label}
        {required ? <span className="ml-1 text-[var(--primary)]">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function DateFieldWithUnknown({
  label,
  registerId,
  register,
  unknown,
  onToggleUnknown,
}: {
  label: string;
  registerId: "birthDate" | "intakeDate";
  register: ReturnType<typeof useForm<PetFormValues>>["register"];
  unknown: boolean;
  onToggleUnknown: (value: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5 text-[var(--primary)]" />
            {label}
          </span>
        </Label>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
          <input
            type="checkbox"
            className="size-3.5 accent-[var(--primary)]"
            checked={unknown}
            onChange={(e) => onToggleUnknown(e.target.checked)}
          />
          I don&apos;t know
        </label>
      </div>
      <Input
        type="date"
        disabled={unknown}
        className="h-10"
        {...register(registerId)}
      />
    </div>
  );
}

function StatusPill({ value }: { value: ShelterPet["status"] }) {
  const map: Record<
    ShelterPet["status"],
    { bg: string; text: string; label: string }
  > = {
    available: {
      bg: "bg-[var(--success-soft)]",
      text: "text-[var(--success)]",
      label: "Available",
    },
    reserved: {
      bg: "bg-[var(--warning-soft)]",
      text: "text-[var(--warning)]",
      label: "Reserved",
    },
    adopted: {
      bg: "bg-[var(--info-soft)]",
      text: "text-[var(--info)]",
      label: "Adopted",
    },
    hidden: {
      bg: "bg-[var(--muted)]",
      text: "text-[var(--muted-foreground)]",
      label: "Hidden",
    },
  };
  const v = map[value] ?? map.available;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${v.bg} ${v.text}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {v.label}
    </span>
  );
}
