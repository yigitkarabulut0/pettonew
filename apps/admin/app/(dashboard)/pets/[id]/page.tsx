"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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
import { getPetDetail } from "@/lib/admin-api";

export default function PetDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-pet-detail", params.id],
    queryFn: () => getPetDetail(params.id),
    enabled: Boolean(params.id)
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
    </div>
  );
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
