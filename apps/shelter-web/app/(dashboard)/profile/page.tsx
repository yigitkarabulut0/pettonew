"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ImagePlus, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMyShelter, updateMyShelter, uploadFileToR2 } from "@/lib/api";
import { WeekHoursPicker, formatWeeklyHours, parseWeeklyHours } from "@/components/hours-picker";
import type { Shelter } from "@petto/contracts";

const MAX_IMAGE_MB = 3;

type FormValues = {
  name: string;
  about: string;
  phone: string;
  website: string;
  address: string;
  cityLabel: string;
  latitude: string;
  longitude: string;
  adoptionProcess: string;
  donationUrl: string;
  showRecentlyAdopted: boolean;
};

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { data: shelter, isLoading } = useQuery({
    queryKey: ["shelter-me"],
    queryFn: getMyShelter
  });

  const form = useForm<FormValues>({
    defaultValues: {
      name: "",
      about: "",
      phone: "",
      website: "",
      address: "",
      cityLabel: "",
      latitude: "",
      longitude: "",
      adoptionProcess: "",
      donationUrl: "",
      showRecentlyAdopted: false
    }
  });

  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [heroUrl, setHeroUrl] = useState<string | undefined>(undefined);
  const [hoursState, setHoursState] = useState(parseWeeklyHours(""));
  const [uploading, setUploading] = useState<"logo" | "hero" | null>(null);

  useEffect(() => {
    if (shelter) {
      form.reset({
        name: shelter.name,
        about: shelter.about,
        phone: shelter.phone,
        website: shelter.website,
        address: shelter.address,
        cityLabel: shelter.cityLabel,
        latitude: String(shelter.latitude ?? ""),
        longitude: String(shelter.longitude ?? ""),
        adoptionProcess: shelter.adoptionProcess ?? "",
        donationUrl: shelter.donationUrl ?? "",
        showRecentlyAdopted: !!shelter.showRecentlyAdopted
      });
      setLogoUrl(shelter.logoUrl ?? undefined);
      setHeroUrl(shelter.heroUrl ?? undefined);
      setHoursState(parseWeeklyHours(shelter.hours ?? ""));
    }
  }, [shelter, form]);

  const mutation = useMutation({
    mutationFn: (patch: Partial<Shelter>) => updateMyShelter(patch),
    onSuccess: () => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["shelter-me"] });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  async function onUpload(kind: "logo" | "hero", file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("That file is not an image.");
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      toast.error(`Image is larger than ${MAX_IMAGE_MB} MB.`);
      return;
    }
    setUploading(kind);
    try {
      const url = await uploadFileToR2(file, `shelters/${kind}`);
      if (kind === "logo") setLogoUrl(url);
      else setHeroUrl(url);
      toast.success(`${kind === "logo" ? "Logo" : "Hero"} uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  const onSubmit = form.handleSubmit((values) => {
    if (values.donationUrl && !/^https?:\/\//i.test(values.donationUrl.trim())) {
      toast.error("Donation URL must start with http:// or https://");
      return;
    }
    if ((values.about ?? "").length > 1000) {
      toast.error("Mission / about is limited to 1000 characters.");
      return;
    }
    if ((values.adoptionProcess ?? "").length > 1000) {
      toast.error("Adoption process is limited to 1000 characters.");
      return;
    }
    mutation.mutate({
      name: values.name,
      about: values.about,
      phone: values.phone,
      website: values.website,
      address: values.address,
      cityLabel: values.cityLabel,
      latitude: values.latitude ? Number(values.latitude) : 0,
      longitude: values.longitude ? Number(values.longitude) : 0,
      hours: formatWeeklyHours(hoursState),
      logoUrl: logoUrl || undefined,
      heroUrl: heroUrl || undefined,
      adoptionProcess: values.adoptionProcess,
      donationUrl: values.donationUrl,
      showRecentlyAdopted: values.showRecentlyAdopted
    });
  });

  if (isLoading || !shelter) {
    return (
      <div className="flex items-center justify-center p-12 text-[var(--muted-foreground)]">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Shelter profile</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Shown to users when they browse shelters and adoptable pets.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* ── Identity ─────────────────────────────────────── */}
        <Card className="space-y-4 p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="size-full object-cover" />
              ) : (
                <Building2 className="size-6" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold">{shelter.name}</div>
              <div className="text-xs text-[var(--muted-foreground)]">{shelter.email}</div>
            </div>
          </div>

          <Field label="Name">
            <Input {...form.register("name", { required: true })} />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Phone (internal)">
              <Input {...form.register("phone")} />
            </Field>
            <Field label="Website (internal)">
              <Input {...form.register("website")} />
            </Field>
          </div>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Phone and website stay on your dashboard — they&apos;re never shown on the
            public profile. Public visitors contact you via in-app messaging.
          </p>
        </Card>

        {/* ── Branding ─────────────────────────────────────── */}
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-semibold">Branding</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Logo is shown as a square avatar everywhere; hero is the banner on
            your shelter profile page. Both must be under {MAX_IMAGE_MB} MB.
          </p>

          <ImageUpload
            label="Logo"
            hint="Square, at least 256×256 px. PNG with transparency looks best."
            url={logoUrl}
            onUpload={(f) => onUpload("logo", f)}
            onClear={() => setLogoUrl(undefined)}
            uploading={uploading === "logo"}
            aspect="square"
          />

          <ImageUpload
            label="Hero image"
            hint="Wide banner, at least 1600×720 px. JPG is fine."
            url={heroUrl}
            onUpload={(f) => onUpload("hero", f)}
            onClear={() => setHeroUrl(undefined)}
            uploading={uploading === "hero"}
            aspect="banner"
          />
        </Card>

        {/* ── Location ─────────────────────────────────────── */}
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-semibold">Location</h2>
          <Field label="Address">
            <Input {...form.register("address")} />
          </Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="City">
              <Input {...form.register("cityLabel")} />
            </Field>
            <Field label="Latitude">
              <Input type="number" step="any" {...form.register("latitude")} />
            </Field>
            <Field label="Longitude">
              <Input type="number" step="any" {...form.register("longitude")} />
            </Field>
          </div>
        </Card>

        {/* ── Hours ────────────────────────────────────────── */}
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold">Opening hours</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Tick the days you&apos;re open and set the times for each.
            </p>
          </div>
          <WeekHoursPicker value={hoursState} onChange={setHoursState} />
        </Card>

        {/* ── Public profile ──────────────────────────────── */}
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold">Public profile</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              This is the page everyone sees at your shareable shelter URL. It&apos;s
              only live once your account is verified.
            </p>
          </div>
          {shelter.slug ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3 text-xs">
              <div className="font-medium">Your public URL</div>
              <div className="mt-0.5 flex items-center gap-2">
                <code className="truncate text-[11px]">{publicShareUrl(shelter.slug)}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(publicShareUrl(shelter.slug!));
                    toast.success("Copied to clipboard");
                  }}
                >
                  Copy
                </Button>
                <a
                  className="text-[11px] font-semibold text-[var(--primary)] hover:underline"
                  href={`/s/${shelter.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open ↗
                </a>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              Your shelter isn&apos;t verified yet — the public profile URL is
              assigned on approval.
            </div>
          )}
          <Field label="Mission / about (≤1000)">
            <textarea
              rows={4}
              maxLength={1000}
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
              {...form.register("about")}
            />
          </Field>
          <Field label="Adoption process (≤1000)">
            <textarea
              rows={5}
              maxLength={1000}
              placeholder="Walk adopters through how you rehome — application, home check, fee, follow-up…"
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
              {...form.register("adoptionProcess")}
            />
          </Field>
          <Field label="Donation URL (optional)">
            <Input
              type="url"
              placeholder="https://yourshelter.org/donate"
              {...form.register("donationUrl")}
            />
          </Field>
          <label className="flex items-center justify-between rounded-xl border border-[var(--border)] p-3">
            <div>
              <div className="text-sm font-semibold">Show &ldquo;Recently adopted&rdquo; section</div>
              <div className="text-xs text-[var(--muted-foreground)]">
                Displays your last 10 adopted animals on the public profile. Off by default.
              </div>
            </div>
            <input
              type="checkbox"
              className="size-5 accent-[var(--primary)]"
              {...form.register("showRecentlyAdopted")}
            />
          </label>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending || Boolean(uploading)}>
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function publicShareUrl(slug: string): string {
  if (typeof window === "undefined") return `/s/${slug}`;
  return `${window.location.origin}/s/${slug}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-[var(--muted-foreground)]">{label}</Label>
      {children}
    </div>
  );
}

function ImageUpload({
  label,
  hint,
  url,
  onUpload,
  onClear,
  uploading,
  aspect
}: {
  label: string;
  hint: string;
  url?: string;
  onUpload: (file: File | null) => void;
  onClear: () => void;
  uploading: boolean;
  aspect: "square" | "banner";
}) {
  const aspectClass = aspect === "square" ? "aspect-square size-32" : "aspect-[21/9] w-full";
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-[var(--muted-foreground)]">{label}</Label>
      <div className="flex items-start gap-4">
        <div
          className={`${aspectClass} overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]`}
        >
          {uploading ? (
            <div className="flex size-full items-center justify-center">
              <Loader2 className="size-5 animate-spin text-[var(--primary)]" />
            </div>
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-[var(--muted-foreground)]">
              <ImagePlus className="size-6" />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-[11px] text-[var(--muted-foreground)]">{hint}</p>
          <div className="flex flex-wrap gap-2">
            <label>
              <Button type="button" variant="outline" size="sm" asChild>
                <span className="cursor-pointer">
                  {url ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      onUpload(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </span>
              </Button>
            </label>
            {url ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="gap-1 text-[var(--destructive)] hover:text-[var(--destructive)]"
              >
                <Trash2 className="size-3" /> Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
