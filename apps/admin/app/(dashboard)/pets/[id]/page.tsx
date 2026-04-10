"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ImageIcon,
  PawPrint,
  Heart,
  Check,
  MapPin
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPetDetail, getAdminPetHealth, deleteAdminHealthRecord, getAdminPetWeight, getAdminPetFeeding, getAdminPetDiary } from "@/lib/admin-api";

export default function PetDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-pet-detail", params.id],
    queryFn: () => getPetDetail(params.id),
    enabled: Boolean(params.id)
  });

  const { data: healthRecords = [] } = useQuery({
    queryKey: ["admin-pet-health", params.id],
    queryFn: () => getAdminPetHealth(params.id),
    enabled: Boolean(params.id)
  });

  const { data: weightLog = [] } = useQuery({
    queryKey: ["admin-pet-weight", params.id],
    queryFn: () => getAdminPetWeight(params.id),
    enabled: Boolean(params.id)
  });

  const { data: feedingSchedule = [] } = useQuery({
    queryKey: ["admin-pet-feeding", params.id],
    queryFn: () => getAdminPetFeeding(params.id),
    enabled: Boolean(params.id)
  });

  const { data: diaryEntries = [] } = useQuery({
    queryKey: ["admin-pet-diary", params.id],
    queryFn: () => getAdminPetDiary(params.id),
    enabled: Boolean(params.id)
  });

  const deleteHealthMutation = useMutation({
    mutationFn: (recordId: string) => deleteAdminHealthRecord(params.id, recordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pet-health", params.id] });
    }
  });

  if (isLoading) {
    return (
      <Card>
        <p className="text-[var(--petto-muted)]">Loading pet details...</p>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <Link
          href="/pets"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--petto-secondary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to pets
        </Link>
        <p className="mt-4 text-[var(--petto-muted)]">
          {error?.message || "Pet not found."}
        </p>
      </Card>
    );
  }

  const { pet, owner, matches } = data;

  return (
    <div className="space-y-5">
      <Link
        href="/pets"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--petto-secondary)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back to pets
      </Link>

      <Card>
        <div className="flex items-start gap-6">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--petto-border)] bg-white">
            {pet.photos[0]?.url ? (
              <img
                src={pet.photos[0].url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <PawPrint className="h-8 w-8 text-[var(--petto-muted)]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl text-[var(--petto-ink)]">{pet.name}</h1>
              <Badge tone={pet.isHidden ? "warning" : "success"}>
                {pet.isHidden ? "Hidden" : "Visible"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-[var(--petto-secondary)]">
              {pet.speciesLabel} &middot; {pet.breedLabel} &middot;{" "}
              {pet.ageYears} years old
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--petto-muted)]">
              <Link
                href={`/users/${owner.id}`}
                className="text-[var(--petto-primary)] hover:underline"
              >
                Owner: {owner.firstName} {owner.lastName}
              </Link>
              {pet.cityLabel && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {pet.cityLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {pet.bio && (
          <div className="mt-5 rounded-[16px] border border-[var(--petto-border)] bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--petto-muted)]">
              Bio
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--petto-ink)]">
              {pet.bio}
            </p>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          <InfoBox
            label="Activity"
            value={
              (
                [
                  "Very calm",
                  "Relaxed",
                  "Balanced",
                  "Active",
                  "Very active"
                ] as const
              )[pet.activityLevel - 1] ?? "Unknown"
            }
          />
          <InfoBox label="Neutered" value={pet.isNeutered ? "Yes" : "No"} />
          <InfoBox
            label="Hobbies"
            value={
              pet.hobbies.length > 0 ? pet.hobbies.join(", ") : "None listed"
            }
          />
          <InfoBox
            label="Good with"
            value={
              pet.goodWith.length > 0 ? pet.goodWith.join(", ") : "None listed"
            }
          />
        </div>

        {pet.photos.length > 1 && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--petto-muted)]">
              Photos ({pet.photos.length})
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {pet.photos.map((photo) => (
                <div
                  key={photo.id}
                  className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-[var(--petto-border)] bg-white"
                >
                  <img
                    src={photo.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-[var(--petto-ink)]">
          Matches ({matches.length})
        </h2>
        {matches.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--petto-muted)]">
            No matches yet.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {matches.map((match) => {
              const isMyPet = match.pet.id === pet.id;
              const theirPet = isMyPet ? match.matchedPet : match.pet;
              return (
                <div
                  key={match.id}
                  className="flex items-center gap-4 rounded-[16px] border border-[var(--petto-border)] bg-white/70 p-4"
                >
                  <div className="flex -space-x-2">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[rgba(255,252,248,0.9)]">
                      {pet.photos[0]?.url ? (
                        <img
                          src={pet.photos[0].url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <PawPrint className="h-4 w-4 text-[var(--petto-muted)]" />
                      )}
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[rgba(255,252,248,0.9)]">
                      {theirPet.photos[0]?.url ? (
                        <img
                          src={theirPet.photos[0].url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <PawPrint className="h-4 w-4 text-[var(--petto-muted)]" />
                      )}
                    </div>
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--petto-primary)]">
                      <Heart className="h-3 w-3 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--petto-ink)]">
                      {pet.name}{" "}
                      <span className="text-[var(--petto-muted)]">&times;</span>{" "}
                      {theirPet.name}
                    </p>
                    <p className="text-xs text-[var(--petto-muted)]">
                      <Link
                        href={`/users/${match.matchedPet.ownerId === pet.ownerId ? match.pet.ownerId : match.matchedPet.ownerId}`}
                        className="text-[var(--petto-primary)] hover:underline"
                      >
                        {match.matchedOwnerName}
                      </Link>{" "}
                      &middot; {theirPet.speciesLabel} &middot;{" "}
                      {theirPet.breedLabel}
                    </p>
                  </div>
                  <Link
                    href={`/pets/${theirPet.id}`}
                    className="shrink-0 text-xs font-semibold text-[var(--petto-primary)] hover:underline"
                  >
                    View {theirPet.name}
                  </Link>
                  <span className="text-xs text-[var(--petto-muted)]">
                    {new Date(match.createdAt).toLocaleDateString("en-GB")}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Health Records */}
      <Card>
        <h2 className="text-lg font-semibold text-[var(--petto-ink)]">
          Health Records ({healthRecords.length})
        </h2>
        {healthRecords.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--petto-muted)]">
            No health records yet.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {healthRecords.map((record) => (
              <div
                key={record.id}
                className="flex items-center gap-4 rounded-[16px] border border-[var(--petto-border)] bg-white/70 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{record.type}</Badge>
                    <span className="text-sm font-semibold text-[var(--petto-ink)]">{record.title}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--petto-muted)]">{record.notes}</p>
                  <p className="mt-1 text-xs text-[var(--petto-muted)]">
                    {new Date(record.date).toLocaleDateString("en-GB")}
                    {record.nextDueDate && ` • Next due: ${new Date(record.nextDueDate).toLocaleDateString("en-GB")}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="shrink-0 text-rose-700 hover:text-rose-800"
                  onClick={() => deleteHealthMutation.mutate(record.id)}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Weight Log */}
      <Card>
        <h2 className="text-lg font-semibold text-[var(--petto-ink)]">
          Weight Log ({weightLog.length})
        </h2>
        {weightLog.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--petto-muted)]">
            No weight entries yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--petto-border)] text-left text-xs font-semibold uppercase tracking-[0.2em] text-[var(--petto-muted)]">
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Weight</th>
                  <th className="pb-3">Unit</th>
                </tr>
              </thead>
              <tbody>
                {weightLog.map((entry) => (
                  <tr key={entry.id} className="border-b border-[var(--petto-border)] last:border-0">
                    <td className="py-3 pr-4 text-[var(--petto-ink)]">{new Date(entry.date).toLocaleDateString("en-GB")}</td>
                    <td className="py-3 pr-4 font-semibold text-[var(--petto-ink)]">{entry.weight}</td>
                    <td className="py-3 text-[var(--petto-muted)]">{entry.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Feeding Schedule */}
      <Card>
        <h2 className="text-lg font-semibold text-[var(--petto-ink)]">
          Feeding Schedule ({feedingSchedule.length})
        </h2>
        {feedingSchedule.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--petto-muted)]">
            No feeding schedule set.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {feedingSchedule.map((meal) => (
              <div
                key={meal.id}
                className="flex items-center gap-4 rounded-[16px] border border-[var(--petto-border)] bg-white/70 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--petto-ink)]">{meal.mealName}</p>
                  <p className="mt-1 text-sm text-[var(--petto-muted)]">
                    {meal.time} • {meal.foodType} • {meal.amount}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Diary Entries */}
      <Card>
        <h2 className="text-lg font-semibold text-[var(--petto-ink)]">
          Diary Entries ({diaryEntries.length})
        </h2>
        {diaryEntries.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--petto-muted)]">
            No diary entries yet.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {diaryEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-4 rounded-[16px] border border-[var(--petto-border)] bg-white/70 p-4"
              >
                <span className="text-2xl">{moodEmoji(entry.mood)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-6 text-[var(--petto-ink)]">{entry.body}</p>
                  <p className="mt-1 text-xs text-[var(--petto-muted)]">
                    {new Date(entry.createdAt).toLocaleDateString("en-GB")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function moodEmoji(mood: string) {
  switch (mood) {
    case "happy": return "😊";
    case "sad": return "😢";
    case "excited": return "🤩";
    case "calm": return "😌";
    case "anxious": return "😰";
    case "playful": return "🤪";
    case "tired": return "😴";
    case "sick": return "🤒";
    default: return "🐾";
  }
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[var(--petto-border)] bg-white/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--petto-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--petto-ink)]">
        {value}
      </p>
    </div>
  );
}
