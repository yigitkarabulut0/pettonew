"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { deleteTaxonomy, getTaxonomy, upsertTaxonomy } from "@/lib/admin-api";

const KINDS = ["species", "breeds", "hobbies", "compatibility", "characters"] as const;
type Kind = (typeof KINDS)[number];

const TAB_META: Record<Kind, { label: string; description: string; placeholder: string }> = {
  species: { label: "Species", description: "Core pet types — powers the first choice in pet creation.", placeholder: "e.g. Dog, Cat, Bird" },
  breeds: { label: "Breeds", description: "Every breed belongs to a species. Select species first, then add breeds.", placeholder: "e.g. Golden Retriever, Siamese" },
  hobbies: { label: "Hobbies", description: "Multi-select hobbies shown during pet creation.", placeholder: "e.g. Fetch, Swimming, Cuddling" },
  compatibility: { label: "Good With", description: "Tags like children, dogs, cats to describe social fit.", placeholder: "e.g. Kids, Dogs, Cats" },
  characters: { label: "Characters", description: "Personality traits shown as bubbles during pet creation.", placeholder: "e.g. Playful, Calm, Energetic" }
};

function confirmDelete(fn: () => void, label: string) {
  if (window.confirm(`Delete "${label}"? This cannot be undone.`)) fn();
}

export default function TaxonomiesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Kind>("species");

  const results = useQueries({
    queries: KINDS.map((kind) => ({
      queryKey: ["taxonomy", kind],
      queryFn: () => getTaxonomy(kind)
    }))
  });

  const dataMap: Record<Kind, any[]> = {
    species: results[0]?.data ?? [],
    breeds: results[1]?.data ?? [],
    hobbies: results[2]?.data ?? [],
    compatibility: results[3]?.data ?? [],
    characters: results[4]?.data ?? []
  };

  const species = dataMap.species;
  const breeds = dataMap.breeds;

  const speciesWithCounts = useMemo(() =>
    species.map((s) => ({ ...s, breedCount: breeds.filter((b) => b.speciesId === s.id).length })),
    [species, breeds]
  );

  const upsertMut = useMutation({
    mutationFn: ({ kind, item }: { kind: Kind; item: any }) => upsertTaxonomy(kind, item),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ["taxonomy", v.kind] });
      if (v.kind === "breeds") queryClient.invalidateQueries({ queryKey: ["taxonomy", "species"] });
    }
  });

  const deleteMut = useMutation({
    mutationFn: ({ kind, id }: { kind: Kind; id: string }) => deleteTaxonomy(kind, id),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ["taxonomy", v.kind] });
      if (v.kind === "species") queryClient.invalidateQueries({ queryKey: ["taxonomy", "breeds"] });
    }
  });

  const items = activeTab === "species" ? speciesWithCounts : activeTab === "breeds"
    ? breeds.map((b) => ({ ...b, speciesLabel: species.find((s) => s.id === b.speciesId)?.label ?? "—" }))
    : dataMap[activeTab];

  const meta = TAB_META[activeTab];

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card className="bg-[linear-gradient(135deg,rgba(255,252,248,0.98),rgba(245,229,216,0.92))]">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Taxonomies</p>
        <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">Manage pet profile data</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--petto-muted)]">
          Species, breeds, hobbies, compatibility tags, and character traits flow into the mobile pet creation experience.
        </p>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {KINDS.map((kind) => (
          <button
            key={kind}
            onClick={() => setActiveTab(kind)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === kind
                ? "bg-[var(--petto-primary)] text-white shadow-md"
                : "bg-white border border-[var(--petto-border)] text-[var(--petto-ink)] hover:border-[var(--petto-primary)] hover:text-[var(--petto-primary)]"
            }`}
          >
            {TAB_META[kind].label}
            <span className={`ml-2 text-xs ${activeTab === kind ? "text-white/70" : "text-[var(--petto-muted)]"}`}>
              {dataMap[kind].length}
            </span>
          </button>
        ))}
      </div>

      {/* Active Section */}
      <Card>
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-[var(--petto-ink)]">{meta.label}</h2>
          <p className="mt-1 text-sm text-[var(--petto-muted)]">{meta.description}</p>
        </div>

        {/* Add Form */}
        <AddForm
          kind={activeTab}
          placeholder={meta.placeholder}
          species={activeTab === "breeds" ? species : undefined}
          onAdd={(label, speciesId, translationTr) => {
            upsertMut.mutate({
              kind: activeTab,
              item: {
                id: "",
                label,
                slug: label.toLowerCase().trim().replace(/\s+/g, "-"),
                speciesId: speciesId || undefined,
                isActive: true,
                translations: translationTr ? { tr: translationTr } : undefined
              }
            });
          }}
          isPending={upsertMut.isPending}
        />

        {/* Items List */}
        <div className="mt-6 space-y-2">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--petto-border)] bg-white/50 py-10 text-center text-sm text-[var(--petto-muted)]">
              No {meta.label.toLowerCase()} added yet
            </div>
          ) : (
            items.map((item: any) => (
              <ItemRow
                key={item.id}
                item={item}
                kind={activeTab}
                onUpdate={(updated) => upsertMut.mutate({ kind: activeTab, item: updated })}
                onDelete={() => confirmDelete(() => deleteMut.mutate({ kind: activeTab, id: item.id }), item.label)}
                meta={
                  activeTab === "species" ? `${item.breedCount ?? 0} breed${(item.breedCount ?? 0) === 1 ? "" : "s"}`
                    : activeTab === "breeds" ? item.speciesLabel
                    : undefined
                }
              />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

/* ─── Add Form ─────────────────────────────────────────────────── */

function AddForm({
  kind,
  placeholder,
  species,
  onAdd,
  isPending
}: {
  kind: Kind;
  placeholder: string;
  species?: any[];
  onAdd: (label: string, speciesId?: string, translationTr?: string) => void;
  isPending: boolean;
}) {
  const [label, setLabel] = useState("");
  const [trLabel, setTrLabel] = useState("");
  const [speciesId, setSpeciesId] = useState("");
  const isBreeds = kind === "breeds";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    if (isBreeds && !speciesId) return;
    onAdd(label.trim(), speciesId || undefined, trLabel.trim() || undefined);
    setLabel("");
    setTrLabel("");
    setSpeciesId("");
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--petto-border)] bg-white/70 p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          placeholder={placeholder}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Input
          placeholder="Turkish translation (optional)"
          value={trLabel}
          onChange={(e) => setTrLabel(e.target.value)}
        />
      </div>
      {isBreeds && (
        <select
          value={speciesId}
          onChange={(e) => setSpeciesId(e.target.value)}
          className="flex h-11 w-full rounded-2xl border border-[var(--petto-border)] bg-white px-4 text-sm text-[var(--petto-ink)] outline-none"
        >
          <option value="">Select parent species</option>
          {species?.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={!label.trim() || (isBreeds && !speciesId) || isPending}>
          {isPending ? "Adding..." : `Add ${TAB_META[kind].label.replace(/s$/, "")}`}
        </Button>
      </div>
    </form>
  );
}

/* ─── Item Row ─────────────────────────────────────────────────── */

function ItemRow({
  item,
  kind,
  onUpdate,
  onDelete,
  meta
}: {
  item: any;
  kind: Kind;
  onUpdate: (item: any) => void;
  onDelete: () => void;
  meta?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [trValue, setTrValue] = useState(item.translations?.tr ?? "");
  const hasTr = Boolean(item.translations?.tr);

  const save = () => {
    onUpdate({
      ...item,
      slug: item.label.toLowerCase().trim().replace(/\s+/g, "-"),
      translations: { ...(item.translations ?? {}), tr: trValue.trim() }
    });
    setEditing(false);
  };

  return (
    <div className="group rounded-2xl border border-[var(--petto-border)] bg-[rgba(255,252,248,0.92)] px-4 py-3 transition-colors hover:border-[var(--petto-primary-light)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <p className="font-semibold text-[var(--petto-ink)] truncate">{item.label}</p>
          {hasTr && !editing && (
            <Badge tone="info" className="shrink-0">TR: {item.translations.tr}</Badge>
          )}
          {meta && <span className="text-xs text-[var(--petto-muted)] shrink-0">{meta}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => { setEditing(!editing); setTrValue(item.translations?.tr ?? ""); }}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--petto-primary)] hover:bg-[var(--petto-primary-bg)] transition-colors"
          >
            {editing ? "Cancel" : hasTr ? "Edit TR" : "+ Turkish"}
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
      {editing && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            placeholder="Turkish translation"
            value={trValue}
            onChange={(e) => setTrValue(e.target.value)}
            className="flex-1"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <Button onClick={save} className="shrink-0">Save</Button>
        </div>
      )}
    </div>
  );
}
