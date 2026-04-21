"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileUp, PawPrint, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listShelterPets } from "@/lib/api";
import { BulkActionBar } from "@/components/listing-actions";

const STATUSES = ["all", "available", "reserved", "adopted", "hidden"] as const;

export default function ShelterPetsPage() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: pets = [], isLoading } = useQuery({
    queryKey: ["shelter-pets", status],
    queryFn: () => listShelterPets(status === "all" ? undefined : status)
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pets;
    return pets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.breed.toLowerCase().includes(q) ||
        p.species.toLowerCase().includes(q)
    );
  }, [pets, search]);

  return (
    <div className="space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Adoptable pets</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Add pets the shelter has available and keep their status up to date.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/pets/import" className="gap-1">
              <FileUp className="size-4" /> Import CSV
            </Link>
          </Button>
          <Button asChild>
            <Link href="/pets/new" className="gap-1">
              <Plus className="size-4" /> Add pet
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or breed…"
            className="w-72 pl-8"
          />
        </div>
        <div className="flex gap-1 rounded-full bg-[var(--muted)] p-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-xs capitalize transition-colors ${
                status === s
                  ? "bg-white text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-[var(--muted-foreground)]">Loading pets…</div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <PawPrint className="size-8 text-[var(--muted-foreground)]" />
          <p className="text-sm text-[var(--muted-foreground)]">
            No pets match the current filter. Add one to get started.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((pet) => {
            const checked = selectedIds.has(pet.id);
            return (
              <Card
                key={pet.id}
                className={`group relative flex flex-col overflow-hidden transition-transform hover:-translate-y-0.5 ${
                  checked ? "ring-2 ring-[var(--primary)]" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleSelect(pet.id)}
                  aria-label={checked ? "Deselect" : "Select"}
                  className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-black/50 text-white shadow-sm transition hover:bg-black/70"
                >
                  {checked ? "✓" : ""}
                </button>
                <Link href={`/pets/${pet.id}`}>
                  <div className="relative aspect-[4/3] w-full bg-[var(--muted)]">
                    {pet.photos?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pet.photos[0]} alt={pet.name} className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-[var(--muted-foreground)]">
                        <PawPrint className="size-8" />
                      </div>
                    )}
                    <div className="absolute left-2 top-2 flex flex-col gap-1">
                      <Badge tone={listingStateTone(pet.listingState)}>{pet.listingState.replace(/_/g, " ")}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold">{pet.name}</div>
                      {pet.ageMonths != null ? (
                        <span className="text-[11px] text-[var(--muted-foreground)]">{formatAge(pet.ageMonths)}</span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-[var(--muted-foreground)]">
                      {[pet.species, pet.breed, pet.sex].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      <BulkActionBar
        selectedIds={Array.from(selectedIds)}
        allPets={filtered}
        onClear={clearSelection}
        onDone={clearSelection}
      />
    </div>
  );
}

function formatAge(months: number): string {
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `${years}y` : `${years}y ${rem}m`;
}

function listingStateTone(
  state: string
): "neutral" | "success" | "warning" | "danger" | "info" {
  switch (state) {
    case "published":
      return "success";
    case "pending_review":
      return "warning";
    case "rejected":
      return "danger";
    case "adopted":
    case "paused":
      return "info";
    case "draft":
    case "archived":
    default:
      return "neutral";
  }
}
