"use client";

// Multi-step guided wizard for shelters to create adoption listings.
// Jurisdiction compliance (blocked species, banned breeds, microchip
// mandate) is enforced per step — the user cannot proceed past a step
// whose content is non-compliant. The final submit hands off to the
// DSA moderation state machine via `submitShelterListing`.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ImagePlus,
  Loader2,
  MapPin,
  PawPrint,
  Sparkles,
  Stethoscope,
  UploadCloud,
  X
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
  SelectValue
} from "@/components/ui/select";
import {
  createShelterPet,
  getListingConfig,
  getMyShelter,
  getTaxonomy,
  submitShelterListing,
  updateShelterPet,
  uploadFileToR2,
  type ListingConfig,
  type TaxonomyItem
} from "@/lib/api";
import type { ShelterPet } from "@petto/contracts";

// ── Wizard state model ─────────────────────────────────────────────
// Kept as a single flat draft object so server-side save at each step
// is a simple PUT of the current working row. Fields mirror the final
// ShelterPet shape plus wizard-only conveniences (ageValue + ageUnit
// are converted to ageMonths on persist).

export type WizardDraft = {
  name: string;
  species: string;
  breed: string;
  breedCustom: string;
  ageValue: string;
  ageUnit: "weeks" | "months" | "years";
  sex: string;
  size: string;
  weightKg: string;
  color: string;
  photos: string[];
  vaccinationStatus: string;
  isNeutered: "neutered" | "not_neutered" | "unknown" | "";
  microchipId: string;
  hasSpecialNeeds: boolean;
  specialNeeds: string;
  description: string;
  homeTypes: string[];
  otherPets: string;
  children: string;
  experience: string;
  otherRequirements: string;
  cityLabel: string;
};

const EMPTY_DRAFT: WizardDraft = {
  name: "",
  species: "",
  breed: "",
  breedCustom: "",
  ageValue: "",
  ageUnit: "months",
  sex: "",
  size: "",
  weightKg: "",
  color: "",
  photos: [],
  vaccinationStatus: "",
  isNeutered: "",
  microchipId: "",
  hasSpecialNeeds: false,
  specialNeeds: "",
  description: "",
  homeTypes: [],
  otherPets: "",
  children: "",
  experience: "",
  otherRequirements: "",
  cityLabel: ""
};

const STEPS = [
  { id: 1, label: "Species", icon: PawPrint },
  { id: 2, label: "Breed", icon: Sparkles },
  { id: 3, label: "Basics", icon: CheckCircle2 },
  { id: 4, label: "Photos", icon: ImagePlus },
  { id: 5, label: "Health", icon: Stethoscope },
  { id: 6, label: "Description", icon: Sparkles },
  { id: 7, label: "Requirements", icon: CheckCircle2 },
  { id: 8, label: "Location", icon: MapPin },
  { id: 9, label: "Review", icon: CheckCircle2 }
] as const;

const HOME_TYPES = [
  { value: "house_garden", label: "House with garden" },
  { value: "apartment", label: "Apartment" },
  { value: "either", label: "Either" }
];

const OTHER_PETS = [
  { value: "dogs", label: "Good with dogs" },
  { value: "cats", label: "Good with cats" },
  { value: "both", label: "Good with both" },
  { value: "none", label: "No other pets" },
  { value: "unknown", label: "Unknown" }
];

const CHILDREN = [
  { value: "good", label: "Good with children" },
  { value: "no_young", label: "No young children" },
  { value: "unknown", label: "Unknown" }
];

const EXPERIENCE = [
  { value: "first_time", label: "First-time welcome" },
  { value: "experienced_preferred", label: "Experienced preferred" },
  { value: "experienced_required", label: "Experienced required" }
];

const SIZES = [
  { value: "small", label: "Small (< 10 kg)" },
  { value: "medium", label: "Medium (10–25 kg)" },
  { value: "large", label: "Large (25–45 kg)" },
  { value: "xl", label: "XL (> 45 kg)" }
];

const VACCINATION = [
  { value: "up_to_date", label: "Up to date" },
  { value: "partial", label: "Partial" },
  { value: "not_vaccinated", label: "Not vaccinated" },
  { value: "unknown", label: "Unknown" }
];

const MAX_PHOTO_MB = 5;
const MIN_PHOTOS = 3;
const MAX_PHOTOS = 10;

// ── Derived helpers ────────────────────────────────────────────────

function ageInMonths(draft: WizardDraft): number | null {
  const n = Number(draft.ageValue);
  if (!draft.ageValue || Number.isNaN(n) || n < 0) return null;
  switch (draft.ageUnit) {
    case "weeks":
      return Math.floor((n * 7) / 30);
    case "months":
      return Math.floor(n);
    case "years":
      return Math.floor(n * 12);
  }
}

function ageInWeeks(draft: WizardDraft): number | null {
  const n = Number(draft.ageValue);
  if (!draft.ageValue || Number.isNaN(n) || n < 0) return null;
  switch (draft.ageUnit) {
    case "weeks":
      return Math.floor(n);
    case "months":
      return Math.floor(n * 4);
    case "years":
      return Math.floor(n * 52);
  }
}

function breedSlug(draft: WizardDraft): string {
  return (draft.breed || draft.breedCustom || "").toLowerCase().trim();
}

function hasBannedBreedMatch(candidate: string, bannedList: string[]): string | null {
  if (!candidate) return null;
  const needle = candidate.toLowerCase();
  for (const b of bannedList) {
    if (!b) continue;
    if (needle.includes(b.toLowerCase())) return b;
  }
  return null;
}

function describePregnancyMatch(text: string, keywords: string[]): string | null {
  const haystack = text.toLowerCase();
  for (const kw of keywords) {
    if (!kw) continue;
    if (haystack.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

// ── Public component ───────────────────────────────────────────────

export function PetWizard({ sourceListing }: { sourceListing?: ShelterPet }) {
  const router = useRouter();

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["listing-config"],
    queryFn: getListingConfig
  });
  const { data: shelter } = useQuery({
    queryKey: ["shelter-me"],
    queryFn: getMyShelter
  });

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<WizardDraft>(() =>
    sourceListing ? draftFromListing(sourceListing) : EMPTY_DRAFT
  );
  const [petId, setPetId] = useState<string | null>(sourceListing?.id ?? null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Pre-fill location on first config load.
  useEffect(() => {
    if (!draft.cityLabel && config?.shelterCityLabel) {
      setDraft((d) => ({ ...d, cityLabel: config.shelterCityLabel }));
    }
  }, [config?.shelterCityLabel, draft.cityLabel]);

  // Save the draft to the server each time a step completes — per
  // spec "on step completion only, not on field change".
  const saveStep = useMutation({
    mutationFn: async () => {
      const payload = draftToPatch(draft);
      if (petId) {
        return updateShelterPet(petId, payload);
      }
      // First save creates the row. Server defaults listing_state to
      // 'draft'; we get an ID back to reuse on subsequent PUTs.
      const created = await createShelterPet(payload);
      setPetId(created.id);
      return created;
    },
    onError: (err: Error) => toast.error(err.message || "Could not save")
  });

  const submit = useMutation({
    mutationFn: async () => {
      // Ensure any pending draft state is persisted before submit.
      await saveStep.mutateAsync();
      if (!petId) throw new Error("No listing to submit");
      return submitShelterListing(petId);
    },
    onSuccess: (res) => {
      if (res.state === "pending_review") {
        toast.success("Submitted — we'll review within 24 hours.");
      } else {
        toast.success("Listing is live!");
      }
      router.push(`/pets/${res.listing.id}`);
    },
    onError: (err: Error) => toast.error(err.message || "Could not submit")
  });

  const verified = (shelter?.verifiedAt ?? config?.shelterVerifiedAt) !== "";

  if (shelter && !verified) {
    return (
      <Card className="border-amber-300 bg-amber-50 p-6 text-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <div className="font-semibold text-amber-900">Shelter not yet verified</div>
            <p className="mt-1 text-amber-900/90">
              Only verified shelters can publish adoption listings. Once your
              verification is approved, this wizard will unlock.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (configLoading || !config) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
      </div>
    );
  }

  // Step gating — each step decides whether user may advance.
  const gate = validateStep(step, draft, config);

  const next = async () => {
    if (gate.error) return;
    await saveStep.mutateAsync().catch(() => undefined);
    setStep((s) => Math.min(STEPS.length, s + 1));
  };
  const prev = () => setStep((s) => Math.max(1, s - 1));

  return (
    <div className="pb-28">
      <Progress step={step} />

      <div className="mx-auto mt-6 max-w-3xl">
        {step === 1 && <StepSpecies draft={draft} setDraft={setDraft} config={config} gate={gate} />}
        {step === 2 && <StepBreed draft={draft} setDraft={setDraft} config={config} gate={gate} />}
        {step === 3 && <StepBasics draft={draft} setDraft={setDraft} config={config} gate={gate} />}
        {step === 4 && (
          <StepPhotos
            draft={draft}
            setDraft={setDraft}
            photoError={photoError}
            setPhotoError={setPhotoError}
          />
        )}
        {step === 5 && <StepHealth draft={draft} setDraft={setDraft} config={config} gate={gate} />}
        {step === 6 && <StepDescription draft={draft} setDraft={setDraft} config={config} gate={gate} />}
        {step === 7 && <StepRequirements draft={draft} setDraft={setDraft} />}
        {step === 8 && <StepLocation draft={draft} setDraft={setDraft} />}
        {step === 9 && (
          <StepReview
            draft={draft}
            config={config}
            jumpTo={setStep}
            onSubmit={() => submit.mutate()}
            submitting={submit.isPending}
          />
        )}
      </div>

      {step < STEPS.length && (
        <StickyNav
          canGoBack={step > 1}
          onBack={prev}
          onNext={next}
          nextLabel="Next"
          blocked={Boolean(gate.error)}
          blockedReason={gate.error ?? null}
          saving={saveStep.isPending}
        />
      )}
    </div>
  );
}

// ── Validation ─────────────────────────────────────────────────────

type StepGate = { error?: string; warning?: string };

function validateStep(step: number, d: WizardDraft, c: ListingConfig): StepGate {
  if (step === 1) {
    if (!d.species) return { error: "Pick a species to continue." };
    const s = d.species.toLowerCase();
    for (const blocked of c.prohibitedSpecies) {
      if (s.includes(blocked)) {
        return {
          error: `We don't accept ${blocked} listings. Species outside dogs, cats, rabbits, ferrets and small mammals are out of scope.`
        };
      }
    }
    return {};
  }
  if (step === 2) {
    const breed = breedSlug(d);
    if (!breed) return { error: "Pick a breed (or 'Mixed breed / unknown') to continue." };
    if (breed.includes("mixed") || breed.includes("unknown")) return {};
    const hit = hasBannedBreedMatch(breed, c.bannedBreeds);
    if (hit) {
      return {
        error: `"${hit}" is restricted in ${c.operatingCountry || "this region"} and cannot be listed for adoption.`
      };
    }
    return {};
  }
  if (step === 3) {
    if (!d.ageValue) return { error: "Enter an age." };
    const n = Number(d.ageValue);
    if (Number.isNaN(n) || n < 0) return { error: "Age must be a non-negative number." };
    if (!d.sex) return { error: "Pick a sex." };
    if (!d.size) return { error: "Pick a size." };
    if (d.weightKg) {
      const w = Number(d.weightKg);
      if (Number.isNaN(w) || w < 0) return { error: "Weight must be a positive number." };
    }
    if (d.color.length > 50) return { error: "Colour is limited to 50 characters." };
    const weeks = ageInWeeks(d);
    if (weeks != null && weeks < c.minAgeWeeks) {
      return {
        warning: `Under ${c.minAgeWeeks} weeks — this listing will be held for moderator review before going live.`
      };
    }
    return {};
  }
  if (step === 4) {
    if (d.photos.length < MIN_PHOTOS) return { error: `Upload at least ${MIN_PHOTOS} photos.` };
    return {};
  }
  if (step === 5) {
    if (!d.vaccinationStatus) return { error: "Pick a vaccination status." };
    if (!d.isNeutered) return { error: "Pick a neuter status." };
    if (c.microchipMode === "required" && !d.microchipId.trim()) {
      return { error: "Microchip ID is required in this region." };
    }
    if (d.microchipId && !/^\d{15}$/.test(d.microchipId.trim())) {
      return { error: "Microchip ID must be 15 digits (ISO 11784)." };
    }
    if (d.hasSpecialNeeds && !d.specialNeeds.trim()) {
      return { error: "Describe the special needs (or toggle the switch off)." };
    }
    if (d.specialNeeds.length > 500) return { error: "Special needs note is limited to 500 characters." };
    return {};
  }
  if (step === 6) {
    const len = d.description.trim().length;
    if (len < 50) return { error: `Write at least 50 characters (you have ${len}).` };
    if (len > 2000) return { error: "Description is limited to 2000 characters." };
    const hit = describePregnancyMatch(d.description, c.pregnancyKeywords);
    if (hit) {
      return {
        warning: `Mentions "${hit}" — pregnant-animal listings are held for moderator review before going live.`
      };
    }
    return {};
  }
  if (step === 7) {
    if (d.otherRequirements.length > 500) return { error: "Requirements note is limited to 500 characters." };
    return {};
  }
  if (step === 8) {
    if (!d.cityLabel.trim()) return { error: "Location is required." };
    if (d.cityLabel.length > 100) return { error: "Location is limited to 100 characters." };
    return {};
  }
  return {};
}

// ── Progress header ────────────────────────────────────────────────

function Progress({ step }: { step: number }) {
  return (
    <div className="sticky top-0 z-20 bg-[var(--background)]/95 px-6 py-4 backdrop-blur-md">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span className="font-medium">
            Step {step} of {STEPS.length} · {STEPS[step - 1]?.label ?? ""}
          </span>
          <span>{Math.round((step / STEPS.length) * 100)}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-all"
            style={{ width: `${(step / STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Shared step scaffold ───────────────────────────────────────────

function StepShell({
  icon: Icon,
  title,
  subtitle,
  gate,
  children
}: {
  icon: (typeof STEPS)[number]["icon"];
  title: string;
  subtitle?: string;
  gate?: StepGate;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-5 rounded-2xl border-[var(--border)] bg-white p-6 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <Icon className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{subtitle}</p>}
        </div>
      </div>
      {children}
      {gate?.error && <Alert tone="error">{gate.error}</Alert>}
      {gate?.warning && !gate?.error && <Alert tone="warn">{gate.warning}</Alert>}
    </Card>
  );
}

function Alert({ tone, children }: { tone: "error" | "warn"; children: React.ReactNode }) {
  const palette =
    tone === "error"
      ? "border-rose-300 bg-rose-50 text-rose-900"
      : "border-amber-300 bg-amber-50 text-amber-900";
  const Icon = tone === "error" ? AlertCircle : AlertTriangle;
  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${palette}`}>
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div>{children}</div>
    </div>
  );
}

// ── Steps ──────────────────────────────────────────────────────────

function StepSpecies({
  draft,
  setDraft,
  config,
  gate
}: {
  draft: WizardDraft;
  setDraft: React.Dispatch<React.SetStateAction<WizardDraft>>;
  config: ListingConfig;
  gate: StepGate;
}) {
  const options = [
    { slug: "dog", label: "Dogs" },
    { slug: "cat", label: "Cats" },
    { slug: "rabbit", label: "Rabbits" },
    { slug: "ferret", label: "Ferrets" },
    { slug: "small_mammal", label: "Small mammals" }
  ];
  return (
    <StepShell icon={PawPrint} title="What species?" subtitle="Only species we support for adoption are shown." gate={gate}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {options.map((o) => {
          const active = draft.species === o.slug;
          return (
            <button
              key={o.slug}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, species: o.slug }))}
              className={[
                "rounded-2xl border px-4 py-5 text-left transition",
                active
                  ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                  : "border-[var(--border)] hover:border-[var(--primary)]"
              ].join(" ")}
            >
              <div className="text-sm font-semibold">{o.label}</div>
              {active && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--primary)]">
                  <CheckCircle2 className="h-3 w-3" /> Selected
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)] p-3 text-xs text-[var(--muted-foreground)]">
        Blocked: reptiles, exotics, farm animals, horses. Operating country:{" "}
        <span className="font-semibold text-[var(--foreground)]">
          {config.operatingCountry || "—"}
        </span>
      </div>
    </StepShell>
  );
}

function StepBreed({
  draft,
  setDraft,
  config,
  gate
}: {
  draft: WizardDraft;
  setDraft: React.Dispatch<React.SetStateAction<WizardDraft>>;
  config: ListingConfig;
  gate: StepGate;
}) {
  const { data: breeds = [] } = useQuery<TaxonomyItem[]>({
    queryKey: ["taxonomy-breeds"],
    queryFn: () => getTaxonomy("breeds")
  });
  const { data: species = [] } = useQuery<TaxonomyItem[]>({
    queryKey: ["taxonomy-species"],
    queryFn: () => getTaxonomy("species")
  });
  const matchedSpecies = species.find(
    (s) => s.slug === draft.species || s.id === draft.species
  );
  const filteredBreeds = breeds.filter(
    (b) => !matchedSpecies || !b.speciesId || b.speciesId === matchedSpecies.id
  );
  return (
    <StepShell
      icon={Sparkles}
      title="What breed?"
      subtitle="Pick from the list or type a custom breed. 'Mixed breed / unknown' is always allowed."
      gate={gate}
    >
      <div className="space-y-3">
        <div>
          <Label>Breed</Label>
          <Select
            value={draft.breed}
            onValueChange={(v) => setDraft((d) => ({ ...d, breed: v, breedCustom: "" }))}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Search breeds…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mixed">Mixed breed / unknown</SelectItem>
              {filteredBreeds.map((b) => (
                <SelectItem key={b.id} value={b.slug}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-[var(--muted-foreground)]">Or type a custom breed:</div>
        <Input
          value={draft.breedCustom}
          onChange={(e) => setDraft((d) => ({ ...d, breedCustom: e.target.value, breed: "" }))}
          placeholder="e.g. Kangal, Turkish Van…"
        />
        {config.bannedBreeds.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>Restricted in {config.operatingCountry}:</strong>{" "}
            {config.bannedBreeds.join(", ")}.
          </div>
        )}
      </div>
    </StepShell>
  );
}

function StepBasics({
  draft,
  setDraft,
  gate
}: {
  draft: WizardDraft;
  setDraft: React.Dispatch<React.SetStateAction<WizardDraft>>;
  config: ListingConfig;
  gate: StepGate;
}) {
  return (
    <StepShell icon={CheckCircle2} title="Basic details" gate={gate}>
      <div>
        <Label>Name</Label>
        <Input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="e.g. Luna"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
        <div>
          <Label>Age</Label>
          <Input
            type="number"
            min={0}
            value={draft.ageValue}
            onChange={(e) => setDraft((d) => ({ ...d, ageValue: e.target.value }))}
          />
        </div>
        <div>
          <Label>Unit</Label>
          <Select
            value={draft.ageUnit}
            onValueChange={(v) => setDraft((d) => ({ ...d, ageUnit: v as WizardDraft["ageUnit"] }))}
          >
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weeks">Weeks</SelectItem>
              <SelectItem value="months">Months</SelectItem>
              <SelectItem value="years">Years</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Sex</Label>
          <Select value={draft.sex} onValueChange={(v) => setDraft((d) => ({ ...d, sex: v }))}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Pick…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Size</Label>
          <Select value={draft.size} onValueChange={(v) => setDraft((d) => ({ ...d, size: v }))}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Pick…" />
            </SelectTrigger>
            <SelectContent>
              {SIZES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Weight (kg, optional)</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={draft.weightKg}
            onChange={(e) => setDraft((d) => ({ ...d, weightKg: e.target.value }))}
          />
        </div>
        <div>
          <Label>Colour (optional)</Label>
          <Input
            value={draft.color}
            maxLength={50}
            onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
            placeholder="e.g. black and tan"
          />
        </div>
      </div>
    </StepShell>
  );
}

function StepPhotos({
  draft,
  setDraft,
  photoError,
  setPhotoError
}: {
  draft: WizardDraft;
  setDraft: React.Dispatch<React.SetStateAction<WizardDraft>>;
  photoError: string | null;
  setPhotoError: (e: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const onFiles = async (files: FileList | File[]) => {
    setPhotoError(null);
    const arr = Array.from(files);
    const accepted: File[] = [];
    for (const f of arr) {
      if (!/image\/(jpeg|png)/.test(f.type)) {
        setPhotoError("Only JPG or PNG files are allowed.");
        continue;
      }
      if (f.size > MAX_PHOTO_MB * 1024 * 1024) {
        setPhotoError(`Each photo must be ≤ ${MAX_PHOTO_MB}MB.`);
        continue;
      }
      accepted.push(f);
    }
    if (!accepted.length) return;
    if (draft.photos.length + accepted.length > MAX_PHOTOS) {
      setPhotoError(`Max ${MAX_PHOTOS} photos per listing.`);
      return;
    }
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of accepted) {
        const url = await uploadFileToR2(f, "shelter-pets");
        urls.push(url);
      }
      setDraft((d) => ({ ...d, photos: [...d.photos, ...urls] }));
    } catch (e) {
      setPhotoError((e as Error).message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = (i: number) =>
    setDraft((d) => ({ ...d, photos: d.photos.filter((_, idx) => idx !== i) }));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.photos.length) return;
    setDraft((d) => {
      const copy = [...d.photos];
      const [m] = copy.splice(from, 1);
      if (m) copy.splice(to, 0, m);
      return { ...d, photos: copy };
    });
  };

  return (
    <StepShell
      icon={ImagePlus}
      title="Photos"
      subtitle={`Upload ${MIN_PHOTOS}–${MAX_PHOTOS} photos. The first one becomes the card image.`}
      gate={photoError ? { error: photoError } : undefined}
    >
      <label
        htmlFor="photos-input"
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--muted)] p-8 text-center transition hover:border-[var(--primary)]"
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
        ) : (
          <UploadCloud className="h-7 w-7 text-[var(--primary)]" />
        )}
        <div className="text-sm font-semibold">
          {uploading ? "Uploading…" : "Click or drop to upload"}
        </div>
        <div className="text-xs text-[var(--muted-foreground)]">
          JPG or PNG · up to {MAX_PHOTO_MB}MB each · {draft.photos.length} / {MAX_PHOTOS} added
        </div>
        <input
          id="photos-input"
          type="file"
          multiple
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => e.target.files && onFiles(e.target.files)}
        />
      </label>
      {draft.photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {draft.photos.map((url, i) => (
            <div key={url + i} className="group relative overflow-hidden rounded-xl border bg-[var(--muted)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="aspect-square w-full object-cover" />
              {i === 0 && (
                <div className="absolute left-2 top-2 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-semibold text-white">
                  Card
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7"
                    onClick={() => move(i, i - 1)}
                  >
                    ←
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7"
                    onClick={() => move(i, i + 1)}
                  >
                    →
                  </Button>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-7 w-7"
                  onClick={() => remove(i)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </StepShell>
  );
}

function StepHealth({
  draft,
  setDraft,
  config,
  gate
}: {
  draft: WizardDraft;
  setDraft: React.Dispatch<React.SetStateAction<WizardDraft>>;
  config: ListingConfig;
  gate: StepGate;
}) {
  const microchipLabel =
    config.microchipMode === "required"
      ? "Microchip ID (required in this region)"
      : config.microchipMode === "advisory"
        ? "Microchip ID (advisory — upcoming mandate)"
        : "Microchip ID (optional)";
  return (
    <StepShell icon={Stethoscope} title="Health" gate={gate}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Vaccination status</Label>
          <Select
            value={draft.vaccinationStatus}
            onValueChange={(v) => setDraft((d) => ({ ...d, vaccinationStatus: v }))}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Pick…" />
            </SelectTrigger>
            <SelectContent>
              {VACCINATION.map((v) => (
                <SelectItem key={v.value} value={v.value}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Neuter status</Label>
          <Select
            value={draft.isNeutered}
            onValueChange={(v) =>
              setDraft((d) => ({ ...d, isNeutered: v as WizardDraft["isNeutered"] }))
            }
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Pick…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="neutered">Neutered</SelectItem>
              <SelectItem value="not_neutered">Not neutered</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>{microchipLabel}</Label>
        <Input
          value={draft.microchipId}
          onChange={(e) => setDraft((d) => ({ ...d, microchipId: e.target.value }))}
          placeholder="15-digit ISO 11784 ID"
          maxLength={15}
        />
        {config.microchipMode === "advisory" && (
          <p className="mt-1 text-xs text-amber-700">
            Your region is phasing in mandatory microchipping. Not required yet, but strongly recommended.
          </p>
        )}
      </div>
      <div className="flex items-center justify-between rounded-xl border border-[var(--border)] p-3">
        <div>
          <div className="text-sm font-semibold">Special needs</div>
          <div className="text-xs text-[var(--muted-foreground)]">
            Tick if this animal needs ongoing medical or behavioural care.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDraft((d) => ({ ...d, hasSpecialNeeds: !d.hasSpecialNeeds }))}
          className={[
            "relative h-6 w-11 rounded-full transition",
            draft.hasSpecialNeeds ? "bg-[var(--primary)]" : "bg-[var(--border)]"
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-0.5 h-5 w-5 rounded-full bg-white transition",
              draft.hasSpecialNeeds ? "left-[22px]" : "left-0.5"
            ].join(" ")}
          />
        </button>
      </div>
      {draft.hasSpecialNeeds && (
        <div>
          <Label>Describe the special needs (≤500)</Label>
          <textarea
            className="min-h-[96px] w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
            value={draft.specialNeeds}
            onChange={(e) => setDraft((d) => ({ ...d, specialNeeds: e.target.value }))}
            maxLength={500}
          />
          <div className="mt-1 text-right text-[11px] text-[var(--muted-foreground)]">
            {draft.specialNeeds.length} / 500
          </div>
        </div>
      )}
    </StepShell>
  );
}

function StepDescription({
  draft,
  setDraft,
  gate
}: {
  draft: WizardDraft;
  setDraft: React.Dispatch<React.SetStateAction<WizardDraft>>;
  config: ListingConfig;
  gate: StepGate;
}) {
  return (
    <StepShell
      icon={Sparkles}
      title="Description"
      subtitle="Tell adopters who this animal is. 50–2000 characters."
      gate={gate}
    >
      <textarea
        className="min-h-[180px] w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
        value={draft.description}
        onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
        maxLength={2000}
        placeholder="Personality, backstory, what life with them looks like…"
      />
      <div className="text-right text-[11px] text-[var(--muted-foreground)]">
        {draft.description.length} / 2000
      </div>
    </StepShell>
  );
}

function StepRequirements({
  draft,
  setDraft
}: {
  draft: WizardDraft;
  setDraft: React.Dispatch<React.SetStateAction<WizardDraft>>;
}) {
  return (
    <StepShell icon={CheckCircle2} title="Adoption requirements" subtitle="Optional — helps match the right home.">
      <div>
        <Label>Home type</Label>
        <div className="flex flex-wrap gap-2">
          {HOME_TYPES.map((h) => {
            const active = draft.homeTypes.includes(h.value);
            return (
              <button
                key={h.value}
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    homeTypes: active ? d.homeTypes.filter((x) => x !== h.value) : [...d.homeTypes, h.value]
                  }))
                }
                className={[
                  "rounded-full border px-3.5 py-1.5 text-sm transition",
                  active
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                    : "border-[var(--border)] hover:border-[var(--primary)]"
                ].join(" ")}
              >
                {h.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Other pets</Label>
          <Select
            value={draft.otherPets}
            onValueChange={(v) => setDraft((d) => ({ ...d, otherPets: v }))}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Pick…" />
            </SelectTrigger>
            <SelectContent>
              {OTHER_PETS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Children</Label>
          <Select
            value={draft.children}
            onValueChange={(v) => setDraft((d) => ({ ...d, children: v }))}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Pick…" />
            </SelectTrigger>
            <SelectContent>
              {CHILDREN.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Experience level</Label>
        <Select
          value={draft.experience}
          onValueChange={(v) => setDraft((d) => ({ ...d, experience: v }))}
        >
          <SelectTrigger className="h-10">
            <SelectValue placeholder="Pick…" />
          </SelectTrigger>
          <SelectContent>
            {EXPERIENCE.map((e) => (
              <SelectItem key={e.value} value={e.value}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Other requirements (≤500)</Label>
        <textarea
          className="min-h-[80px] w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
          value={draft.otherRequirements}
          onChange={(e) => setDraft((d) => ({ ...d, otherRequirements: e.target.value }))}
          maxLength={500}
        />
      </div>
    </StepShell>
  );
}

function StepLocation({
  draft,
  setDraft
}: {
  draft: WizardDraft;
  setDraft: React.Dispatch<React.SetStateAction<WizardDraft>>;
}) {
  return (
    <StepShell icon={MapPin} title="Location" subtitle="City-level only. Pre-filled from your shelter profile — edit if different.">
      <div>
        <Label>City</Label>
        <Input
          value={draft.cityLabel}
          onChange={(e) => setDraft((d) => ({ ...d, cityLabel: e.target.value }))}
          maxLength={100}
          placeholder="e.g. Istanbul"
        />
      </div>
    </StepShell>
  );
}

function StepReview({
  draft,
  config,
  jumpTo,
  onSubmit,
  submitting
}: {
  draft: WizardDraft;
  config: ListingConfig;
  jumpTo: (step: number) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const weeks = ageInWeeks(draft) ?? 0;
  const willReview =
    (weeks > 0 && weeks < config.minAgeWeeks) ||
    Boolean(describePregnancyMatch(draft.description, config.pregnancyKeywords));

  return (
    <Card className="space-y-5 rounded-2xl border-[var(--border)] bg-white p-6 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <CheckCircle2 className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Review &amp; publish</h2>
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
            Final check. Jump back to any step to edit.
          </p>
        </div>
      </div>

      {willReview && (
        <Alert tone="warn">
          This listing will enter <strong>pending review</strong> on submit — a moderator will publish it within 24 hours.
        </Alert>
      )}

      <ReviewRow label="Species" value={draft.species} onEdit={() => jumpTo(1)} />
      <ReviewRow
        label="Breed"
        value={draft.breed || draft.breedCustom}
        onEdit={() => jumpTo(2)}
      />
      <ReviewRow
        label="Basics"
        value={[
          draft.name,
          draft.ageValue ? `${draft.ageValue} ${draft.ageUnit}` : "",
          draft.sex,
          draft.size,
          draft.weightKg ? `${draft.weightKg}kg` : "",
          draft.color
        ]
          .filter(Boolean)
          .join(" · ")}
        onEdit={() => jumpTo(3)}
      />
      <ReviewRow
        label="Photos"
        value={`${draft.photos.length} uploaded`}
        onEdit={() => jumpTo(4)}
      />
      <ReviewRow
        label="Health"
        value={[
          draft.vaccinationStatus.replace(/_/g, " "),
          draft.isNeutered.replace(/_/g, " "),
          draft.microchipId ? `chip ${draft.microchipId}` : "",
          draft.hasSpecialNeeds ? "special needs" : ""
        ]
          .filter(Boolean)
          .join(" · ")}
        onEdit={() => jumpTo(5)}
      />
      <ReviewRow
        label="Description"
        value={`${draft.description.slice(0, 120)}${draft.description.length > 120 ? "…" : ""}`}
        onEdit={() => jumpTo(6)}
      />
      <ReviewRow
        label="Requirements"
        value={[
          draft.homeTypes.join(", "),
          draft.otherPets,
          draft.children,
          draft.experience
        ]
          .filter(Boolean)
          .join(" · ") || "No specific preferences"}
        onEdit={() => jumpTo(7)}
      />
      <ReviewRow label="Location" value={draft.cityLabel} onEdit={() => jumpTo(8)} />

      <div className="pt-3">
        <Button onClick={onSubmit} disabled={submitting} className="w-full">
          {submitting ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Submitting…
            </>
          ) : (
            "Submit listing"
          )}
        </Button>
      </div>
    </Card>
  );
}

function ReviewRow({
  label,
  value,
  onEdit
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] p-3">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {label}
        </div>
        <div className="mt-0.5 break-words text-sm">{value || "—"}</div>
      </div>
      <Button variant="outline" size="sm" onClick={onEdit}>
        Edit
      </Button>
    </div>
  );
}

// ── Sticky nav ─────────────────────────────────────────────────────

function StickyNav({
  canGoBack,
  onBack,
  onNext,
  nextLabel,
  blocked,
  blockedReason,
  saving
}: {
  canGoBack: boolean;
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  blocked: boolean;
  blockedReason: string | null;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 py-3">
        <Button variant="outline" onClick={onBack} disabled={!canGoBack || saving}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {blocked && blockedReason && (
            <span className="hidden text-xs text-rose-700 sm:inline">{blockedReason}</span>
          )}
          <Button onClick={onNext} disabled={blocked || saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-1 h-4 w-4" />}
            {nextLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Conversions ────────────────────────────────────────────────────

function draftToPatch(draft: WizardDraft): Partial<ShelterPet> {
  const months = ageInMonths(draft);
  return {
    name: draft.name.trim(),
    species: draft.species,
    breed: (draft.breed || draft.breedCustom || "").trim(),
    sex: draft.sex,
    size: draft.size,
    color: draft.color.trim(),
    ageMonths: months ?? undefined,
    description: draft.description.trim(),
    microchipId: draft.microchipId.trim(),
    specialNeeds: draft.hasSpecialNeeds ? draft.specialNeeds.trim() : "",
    isNeutered: draft.isNeutered === "neutered",
    status: "available",
    characterTags: [
      ...(draft.homeTypes.map((h) => `home:${h}`) ?? []),
      draft.otherPets ? `pets:${draft.otherPets}` : "",
      draft.children ? `children:${draft.children}` : "",
      draft.experience ? `xp:${draft.experience}` : "",
      draft.vaccinationStatus ? `vax:${draft.vaccinationStatus}` : "",
      draft.weightKg ? `weight:${draft.weightKg}` : "",
      draft.otherRequirements ? `req:${draft.otherRequirements.replace(/\s+/g, "_").slice(0, 80)}` : "",
      draft.cityLabel ? `city:${draft.cityLabel.replace(/\s+/g, "_").slice(0, 80)}` : ""
    ].filter(Boolean),
    photos: draft.photos,
    vaccines: []
  };
}

function draftFromListing(pet: ShelterPet): WizardDraft {
  const tagMap: Record<string, string> = {};
  const homes: string[] = [];
  for (const tag of pet.characterTags ?? []) {
    const [k, v] = tag.split(":");
    if (!k || !v) continue;
    if (k === "home") homes.push(v);
    else tagMap[k] = v;
  }
  return {
    name: pet.name ?? "",
    species: pet.species ?? "",
    breed: pet.breed ?? "",
    breedCustom: "",
    ageValue: pet.ageMonths != null ? String(pet.ageMonths) : "",
    ageUnit: "months",
    sex: pet.sex ?? "",
    size: pet.size ?? "",
    weightKg: tagMap.weight ?? "",
    color: pet.color ?? "",
    photos: pet.photos ?? [],
    vaccinationStatus: tagMap.vax ?? "",
    isNeutered: pet.isNeutered ? "neutered" : "",
    microchipId: pet.microchipId ?? "",
    hasSpecialNeeds: !!pet.specialNeeds,
    specialNeeds: pet.specialNeeds ?? "",
    description: pet.description ?? "",
    homeTypes: homes,
    otherPets: tagMap.pets ?? "",
    children: tagMap.children ?? "",
    experience: tagMap.xp ?? "",
    otherRequirements: (tagMap.req ?? "").replace(/_/g, " "),
    cityLabel: pet.shelterCity ?? ""
  };
}
