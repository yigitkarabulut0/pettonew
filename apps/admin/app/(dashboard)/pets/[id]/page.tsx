"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Eye,
  EyeOff,
  Heart,
  Image as ImageIcon,
  MapPin,
  PawPrint,
  Syringe,
  Utensils,
  Weight
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { UserCell } from "@/components/common/UserCell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, type AdminListEnvelope } from "@/lib/api/client";
import {
  getAdminPetDiary,
  getAdminPetFeeding,
  getAdminPetHealth,
  getAdminPetWeight,
  getPetDetail,
  updatePetVisibility
} from "@/lib/admin-api";
import { fmtDate } from "@/lib/format";

export default function PetDetailPage() {
  const params = useParams<{ id: string }>();
  const petID = params?.id ?? "";
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["admin-pet-detail", petID],
    queryFn: () => getPetDetail(petID),
    enabled: Boolean(petID)
  });
  const photosQ = useQuery({
    queryKey: ["admin-pet-photos", petID],
    queryFn: () => apiRequest<AdminListEnvelope<any>>(`/pets/${petID}/photos`),
    enabled: Boolean(petID)
  });
  const albumsQ = useQuery({
    queryKey: ["admin-pet-albums", petID],
    queryFn: () => apiRequest<AdminListEnvelope<any>>(`/pets/${petID}/albums`),
    enabled: Boolean(petID)
  });
  const milestonesQ = useQuery({
    queryKey: ["admin-pet-milestones", petID],
    queryFn: () => apiRequest<AdminListEnvelope<any>>(`/pets/${petID}/milestones`),
    enabled: Boolean(petID)
  });
  const healthQ = useQuery({
    queryKey: ["admin-pet-health", petID],
    queryFn: () => getAdminPetHealth(petID),
    enabled: Boolean(petID)
  });
  const weightQ = useQuery({
    queryKey: ["admin-pet-weight", petID],
    queryFn: () => getAdminPetWeight(petID),
    enabled: Boolean(petID)
  });
  const feedingQ = useQuery({
    queryKey: ["admin-pet-feeding", petID],
    queryFn: () => getAdminPetFeeding(petID),
    enabled: Boolean(petID)
  });
  const diaryQ = useQuery({
    queryKey: ["admin-pet-diary", petID],
    queryFn: () => getAdminPetDiary(petID),
    enabled: Boolean(petID)
  });
  const playdatesQ = useQuery({
    queryKey: ["admin-pet-playdates", petID],
    queryFn: () => apiRequest<AdminListEnvelope<any>>(`/pets/${petID}/playdates`),
    enabled: Boolean(petID)
  });

  const visibilityMut = useMutation({
    mutationFn: (hidden: boolean) => updatePetVisibility(petID, hidden),
    onSuccess: () => {
      toast.success("Visibility updated");
      qc.invalidateQueries({ queryKey: ["admin-pet-detail", petID] });
      qc.invalidateQueries({ queryKey: ["admin-pets"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  if (detailQ.isLoading) {
    return <div className="py-6 text-sm text-[var(--muted-foreground)]">Loading…</div>;
  }
  if (detailQ.error || !detailQ.data) {
    return (
      <div className="flex flex-col gap-3">
        <Link href="/pets" className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
          <ArrowLeft className="h-3 w-3" /> Pets
        </Link>
        <EmptyState title="Pet not found" />
      </div>
    );
  }

  const { pet, owner, matches } = detailQ.data;
  const photos = photosQ.data?.data ?? [];
  const albums = albumsQ.data?.data ?? [];
  const milestones = milestonesQ.data?.data ?? [];
  const health = healthQ.data ?? [];
  const weights = weightQ.data ?? [];
  const feeding = feedingQ.data ?? [];
  const diary = diaryQ.data ?? [];
  const playdates = playdatesQ.data?.data ?? [];
  const primaryPhoto = photos.find((p: any) => p.isPrimary) ?? photos[0];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={pet.name}
        description={`${pet.speciesLabel ?? ""} · ${pet.breedLabel || "mixed"}`}
        breadcrumbs={
          <Link href="/pets" className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            <ArrowLeft className="h-3 w-3" /> Pets
          </Link>
        }
        actions={
          <Button variant="outline" onClick={() => visibilityMut.mutate(!pet.isHidden)}>
            {pet.isHidden ? (
              <>
                <Eye className="h-3.5 w-3.5" /> Show in discovery
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5" /> Hide from discovery
              </>
            )}
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]">
            {primaryPhoto?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={primaryPhoto.url} alt={pet.name} className="h-full w-full object-cover" />
            ) : (
              <PawPrint className="h-8 w-8 text-[var(--muted-foreground)]" />
            )}
          </div>
          <div className="grid flex-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Species">{pet.speciesLabel || "—"}</Field>
            <Field label="Breed">{pet.breedLabel || "mixed"}</Field>
            <Field label="Age">{pet.ageYears != null ? `${pet.ageYears}y` : "—"}</Field>
            <Field label="Gender">{pet.gender || "—"}</Field>
            <Field label="Activity level">{pet.activityLevel ?? "—"}/5</Field>
            <Field label="Neutered">{pet.isNeutered ? "Yes" : "No"}</Field>
            <Field label="Visibility">
              <StatusBadge status={pet.isHidden ? "hidden" : "active"} />
            </Field>
            <Field label="City">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {pet.cityLabel || "—"}
              </span>
            </Field>
            <Field label="Pet ID">
              <code className="truncate text-xs">{pet.id}</code>
            </Field>
            <div className="col-span-full">
              <p className="text-[11px] font-medium text-[var(--muted-foreground)]">Bio</p>
              <p className="whitespace-pre-wrap text-sm">{pet.bio || "—"}</p>
            </div>
            <div className="col-span-full">
              <p className="text-[11px] font-medium text-[var(--muted-foreground)]">Tags</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {(pet.hobbies ?? []).map((t: string) => (
                  <Badge key={`h-${t}`} tone="neutral">
                    {t}
                  </Badge>
                ))}
                {(pet.characters ?? []).map((t: string) => (
                  <Badge key={`c-${t}`} tone="info">
                    {t}
                  </Badge>
                ))}
                {(pet.goodWith ?? []).map((t: string) => (
                  <Badge key={`g-${t}`} tone="success">
                    good with {t}
                  </Badge>
                ))}
                {(pet.hobbies ?? []).length === 0 &&
                (pet.characters ?? []).length === 0 &&
                (pet.goodWith ?? []).length === 0 ? (
                  <span className="text-xs text-[var(--muted-foreground)]">no tags</span>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Owner</CardTitle>
        </CardHeader>
        <CardContent>
          <UserCell
            id={owner.id}
            name={`${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim()}
            email={owner.email}
            avatarUrl={owner.avatarUrl}
            subtitle={owner.cityLabel || owner.email}
          />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Photos" value={photos.length} icon={ImageIcon} />
        <StatCard label="Matches" value={matches.length} icon={Heart} />
        <StatCard label="Health records" value={health.length} icon={Syringe} />
        <StatCard label="Weight entries" value={weights.length} icon={Weight} />
        <StatCard label="Playdates" value={playdates.length} icon={Calendar} />
      </div>

      <Tabs defaultValue="photos">
        <TabsList className="flex-wrap">
          <TabsTrigger value="photos">Photos ({photos.length})</TabsTrigger>
          <TabsTrigger value="albums">Albums ({albums.length})</TabsTrigger>
          <TabsTrigger value="milestones">Milestones ({milestones.length})</TabsTrigger>
          <TabsTrigger value="health">Health ({health.length})</TabsTrigger>
          <TabsTrigger value="weight">Weight ({weights.length})</TabsTrigger>
          <TabsTrigger value="feeding">Feeding ({feeding.length})</TabsTrigger>
          <TabsTrigger value="diary">Diary ({diary.length})</TabsTrigger>
          <TabsTrigger value="matches">Matches ({matches.length})</TabsTrigger>
          <TabsTrigger value="playdates">Playdates ({playdates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="photos">
          {photos.length === 0 ? (
            <EmptyState icon={ImageIcon} title="No photos" />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {photos.map((ph: any) => (
                <div
                  key={ph.id}
                  className="relative aspect-square overflow-hidden rounded-md border border-[var(--border)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ph.url} alt="" className="h-full w-full object-cover" />
                  {ph.isPrimary ? (
                    <span className="absolute left-1 top-1">
                      <Badge tone="info">primary</Badge>
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="albums">
          {albums.length === 0 ? (
            <EmptyState icon={ImageIcon} title="No albums" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {albums.map((a: any) => (
                <Card key={a.id} className="p-3">
                  <div className="font-medium text-sm">{a.title}</div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    <RelativeTime value={a.createdAt} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="milestones">
          {milestones.length === 0 ? (
            <EmptyState title="No milestones" />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {milestones.map((m: any) => (
                <li key={m.id} className="flex items-start justify-between rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{m.title || m.type}</div>
                    {m.description ? (
                      <div className="text-xs text-[var(--muted-foreground)]">{m.description}</div>
                    ) : null}
                  </div>
                  <RelativeTime value={m.achievedAt} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="health">
          {health.length === 0 ? (
            <EmptyState icon={Syringe} title="No health records" />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {health.map((h) => (
                <li key={h.id} className="flex items-start justify-between rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">
                      <Badge tone="neutral" className="mr-2">
                        {h.type}
                      </Badge>
                      {h.title}
                    </div>
                    {h.notes ? <div className="text-xs text-[var(--muted-foreground)]">{h.notes}</div> : null}
                    <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                      {fmtDate(h.date)}
                      {h.nextDueDate ? ` · next: ${fmtDate(h.nextDueDate)}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="weight">
          {weights.length === 0 ? (
            <EmptyState icon={Weight} title="No weight entries" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                  <th className="py-1.5 text-left">Date</th>
                  <th className="py-1.5 text-right">Weight</th>
                </tr>
              </thead>
              <tbody>
                {weights.map((w) => (
                  <tr key={w.id} className="border-b border-[var(--border)]">
                    <td className="py-1.5">{fmtDate(w.date)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {w.weight} {w.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        <TabsContent value="feeding">
          {feeding.length === 0 ? (
            <EmptyState icon={Utensils} title="No feeding schedule" />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {feeding.map((f) => (
                <li key={f.id} className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
                  <span>
                    <strong>{f.mealName}</strong> — {f.amount} {f.foodType}
                  </span>
                  <span className="font-mono text-xs">{f.time}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="diary">
          {diary.length === 0 ? (
            <EmptyState title="No diary entries" />
          ) : (
            <div className="flex flex-col gap-2">
              {diary.map((d) => (
                <Card key={d.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge tone="neutral">{d.mood || "neutral"}</Badge>
                      <p className="mt-1 text-sm">{d.body}</p>
                    </div>
                    <RelativeTime value={d.createdAt} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="matches">
          {matches.length === 0 ? (
            <EmptyState icon={Heart} title="No matches" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {matches.map((m) => (
                <Card key={m.id} className="p-3">
                  <div className="text-sm font-medium">
                    {m.pet?.name} ↔ {m.matchedPet?.name}
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    <RelativeTime value={m.createdAt} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="playdates">
          {playdates.length === 0 ? (
            <EmptyState icon={Calendar} title="No playdates" />
          ) : (
            <div className="flex flex-col gap-1.5">
              {playdates.map((p: any) => (
                <Link
                  key={p.id}
                  href={`/playdates/${p.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 hover:bg-[var(--muted)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.title}</div>
                    <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                      {p.location} · {fmtDate(p.date)}
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-[var(--muted-foreground)]">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
