"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ImageIcon,
  Heart,
  MessageCircle,
  PawPrint,
  Pencil,
  X
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getUserDetail, updateUser } from "@/lib/admin-api";

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-user-detail", params.id],
    queryFn: () => getUserDetail(params.id),
    enabled: Boolean(params.id)
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    bio: "",
    cityLabel: "",
    gender: "",
    birthDate: ""
  });

  const editMutation = useMutation({
    mutationFn: (fields: Parameters<typeof updateUser>[1]) =>
      updateUser(params.id, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-detail", params.id] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setEditing(false);
    }
  });

  function startEditing() {
    if (!data) return;
    setForm({
      firstName: data.user.firstName || "",
      lastName: data.user.lastName || "",
      bio: data.user.bio || "",
      cityLabel: data.user.cityLabel || "",
      gender: data.user.gender || "",
      birthDate: data.user.birthDate
        ? new Date(data.user.birthDate).toISOString().slice(0, 10)
        : ""
    });
    setEditing(true);
  }

  if (isLoading) {
    return (
      <Card>
        <p className="text-[var(--petto-muted)]">Loading user details...</p>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <Link
          href="/users"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--petto-secondary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to users
        </Link>
        <p className="mt-4 text-[var(--petto-muted)]">
          {error?.message || "User not found."}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Link
        href="/users"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--petto-secondary)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back to users
      </Link>

      <Card>
        <div className="flex items-start gap-6">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--petto-border)] bg-white">
            {data.user.avatarUrl ? (
              <img
                src={data.user.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="h-6 w-6 text-[var(--petto-muted)]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            {editing ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  editMutation.mutate({
                    firstName: form.firstName,
                    lastName: form.lastName,
                    bio: form.bio,
                    cityLabel: form.cityLabel,
                    gender: form.gender,
                    birthDate: form.birthDate || undefined
                  });
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="First name"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  />
                  <Input
                    placeholder="Last name"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  />
                  <Input
                    placeholder="City"
                    value={form.cityLabel}
                    onChange={(e) => setForm({ ...form, cityLabel: e.target.value })}
                  />
                  <select
                    className="h-12 w-full rounded-2xl border border-[var(--petto-border)] bg-white px-4 text-sm text-[var(--petto-ink)] outline-none focus:border-[var(--petto-primary)]"
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  >
                    <option value="">Select gender</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                  <Input
                    type="date"
                    placeholder="Birth date"
                    value={form.birthDate}
                    onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                  />
                </div>
                <textarea
                  className="w-full rounded-2xl border border-[var(--petto-border)] bg-white px-4 py-3 text-sm text-[var(--petto-ink)] outline-none placeholder:text-[var(--petto-muted)] focus:border-[var(--petto-primary)]"
                  placeholder="Bio"
                  rows={3}
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                />
                {editMutation.isError && (
                  <p className="text-sm text-rose-600">
                    {editMutation.error?.message || "Failed to save changes."}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" disabled={editMutation.isPending}>
                    {editMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEditing(false)}
                    disabled={editMutation.isPending}
                  >
                    <X className="mr-1 h-4 w-4" /> Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl text-[var(--petto-ink)]">
                    {data.user.firstName || "Unnamed"} {data.user.lastName}
                  </h1>
                  <Badge
                    tone={data.user.status === "active" ? "success" : "warning"}
                  >
                    {data.user.status}
                  </Badge>
                  <button
                    type="button"
                    onClick={startEditing}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--petto-border)] bg-white/60 px-3 py-1.5 text-xs font-semibold text-[var(--petto-secondary)] transition-all hover:bg-white"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                </div>
                <p className="mt-1 text-sm text-[var(--petto-muted)]">
                  {data.user.email}
                </p>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-[var(--petto-secondary)]">
                  {data.user.cityLabel && <span>{data.user.cityLabel}</span>}
                  <span>{data.user.gender}</span>
                  {data.user.birthDate && (
                    <span>
                      Born{" "}
                      {new Date(data.user.birthDate).toLocaleDateString("en-GB")}
                    </span>
                  )}
                </div>
                {data.user.bio && (
                  <p className="mt-3 text-sm leading-6 text-[var(--petto-muted)]">
                    {data.user.bio}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <StatBox
            label="Pets"
            value={String(data.pets.length)}
            icon={<PawPrint className="h-4 w-4" />}
          />
          <StatBox
            label="Matches"
            value={String(data.matches.length)}
            icon={<Heart className="h-4 w-4" />}
          />
          <StatBox
            label="Posts"
            value={String(data.posts.length)}
            icon={<MessageCircle className="h-4 w-4" />}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-[var(--petto-ink)]">
          Pets ({data.pets.length})
        </h2>
        {data.pets.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--petto-muted)]">
            This user has no pets.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.pets.map((pet) => (
              <Link
                key={pet.id}
                href={`/pets/${pet.id}`}
                className="group rounded-[20px] border border-[var(--petto-border)] bg-white/70 p-4 transition-colors hover:bg-white"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--petto-border)] bg-[rgba(255,252,248,0.9)]">
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
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--petto-ink)]">
                      {pet.name}
                    </p>
                    <p className="text-xs text-[var(--petto-secondary)]">
                      {pet.speciesLabel} &middot; {pet.breedLabel}
                    </p>
                  </div>
                  <Badge tone={pet.isHidden ? "warning" : "success"}>
                    {pet.isHidden ? "Hidden" : "Visible"}
                  </Badge>
                </div>
                {pet.bio && (
                  <p className="mt-3 text-xs leading-5 text-[var(--petto-muted)] line-clamp-2">
                    {pet.bio}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-1">
                  <span className="inline-flex rounded-full bg-[var(--petto-primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--petto-secondary)]">
                    {pet.ageYears}y
                  </span>
                  {pet.isNeutered && (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Neutered
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-[var(--petto-ink)]">
          Matches ({data.matches.length})
        </h2>
        {data.matches.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--petto-muted)]">
            No matches yet.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {data.matches.map((match) => {
              const isMyPet = match.pet.ownerId === data.user.id;
              const myPet = isMyPet ? match.pet : match.matchedPet;
              const theirPet = isMyPet ? match.matchedPet : match.pet;
              return (
                <div
                  key={match.id}
                  className="flex items-center gap-4 rounded-[16px] border border-[var(--petto-border)] bg-white/70 p-4"
                >
                  <div className="flex -space-x-3">
                    {myPet.photos[0]?.url && (
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[rgba(255,252,248,0.9)]">
                        <img
                          src={myPet.photos[0].url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    {theirPet.photos[0]?.url && (
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[rgba(255,252,248,0.9)]">
                        <img
                          src={theirPet.photos[0].url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--petto-ink)]">
                      {myPet.name}{" "}
                      <span className="text-[var(--petto-muted)]">&times;</span>{" "}
                      {theirPet.name}
                    </p>
                    <p className="text-xs text-[var(--petto-muted)]">
                      with {match.matchedOwnerName}
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

function StatBox({
  label,
  value,
  icon
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-[var(--petto-border)] bg-white/70 p-4">
      <div className="flex items-center gap-2 text-[var(--petto-muted)]">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-[0.2em]">
          {label}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-[var(--petto-ink)]">{value}</p>
    </div>
  );
}
