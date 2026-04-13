"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deleteTaxonomy, getTaxonomy, upsertTaxonomy } from "@/lib/admin-api";

const taxonomyKinds = ["species", "breeds", "hobbies", "compatibility", "characters"] as const;

const sectionMeta = {
  species: {
    eyebrow: "Species",
    title: "Core pet types",
    description: "These power the first big choice in pet creation. Keep the list short and clear."
  },
  breeds: {
    eyebrow: "Breeds",
    title: "Breed mapping",
    description: "Every breed belongs to a species so the mobile picker stays tidy and relevant."
  },
  hobbies: {
    eyebrow: "Hobbies",
    title: "Hobby library",
    description: "These appear in the multi-select modal on mobile. Add broad, reusable activities."
  },
  compatibility: {
    eyebrow: "Compatibility",
    title: "Good-with tags",
    description: "Tags like children, dogs, and cats help owners describe social fit fast."
  },
  characters: {
    eyebrow: "Characters",
    title: "Personality traits",
    description: "Character bubbles shown during pet creation. Keep traits simple and relatable."
  }
} as const;

export default function TaxonomiesPage() {
  const queryClient = useQueryClient();
  const results = useQueries({
    queries: taxonomyKinds.map((kind) => ({
      queryKey: ["taxonomy", kind],
      queryFn: () => getTaxonomy(kind)
    }))
  });

  const species = results[0]?.data ?? [];
  const breeds = results[1]?.data ?? [];
  const hobbies = results[2]?.data ?? [];
  const compatibility = results[3]?.data ?? [];
  const characters = results[4]?.data ?? [];

  const speciesCounts = useMemo(() => {
    return species.map((item) => ({
      ...item,
      breedCount: breeds.filter((breed) => breed.speciesId === item.id).length
    }));
  }, [breeds, species]);

  const createMutation = useMutation({
    mutationFn: ({
      kind,
      label,
      speciesId,
      translationTr
    }: {
      kind: (typeof taxonomyKinds)[number];
      label: string;
      speciesId?: string;
      translationTr?: string;
    }) =>
      upsertTaxonomy(kind, {
        id: "",
        label,
        slug: label.toLowerCase().trim().replace(/\s+/g, "-"),
        speciesId: speciesId || undefined,
        isActive: true,
        translations: translationTr ? { tr: translationTr } : undefined
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["taxonomy", variables.kind] });
      if (variables.kind === "breeds") {
        queryClient.invalidateQueries({ queryKey: ["taxonomy", "species"] });
      }
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ kind, item }: { kind: (typeof taxonomyKinds)[number]; item: any }) =>
      upsertTaxonomy(kind, item),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["taxonomy", variables.kind] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: ({ kind, itemId }: { kind: (typeof taxonomyKinds)[number]; itemId: string }) =>
      deleteTaxonomy(kind, itemId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["taxonomy", variables.kind] });
      if (variables.kind === "species") {
        queryClient.invalidateQueries({ queryKey: ["taxonomy", "breeds"] });
      }
    }
  });

  return (
    <div className="space-y-5">
      <Card className="bg-[linear-gradient(135deg,rgba(255,252,248,0.98),rgba(245,229,216,0.92))]">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Taxonomies</p>
        <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">Keep profile inputs clean, consistent, and easy to manage.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--petto-muted)]">
          Species, breeds, hobbies, compatibility tags, and character traits all flow straight into the mobile onboarding experience. Remove
          clutter here and the product feels better everywhere.
        </p>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <TaxonomySection
          kind="species"
          items={speciesCounts}
          title={sectionMeta.species.title}
          eyebrow={sectionMeta.species.eyebrow}
          description={sectionMeta.species.description}
          addLabel="Add species"
          onSubmit={(payload) => createMutation.mutate({ kind: "species", ...payload } as any)}
          onUpdate={(item) => updateMutation.mutate({ kind: "species", item })}
          onDelete={(itemId, label) => confirmDelete(() => deleteMutation.mutate({ kind: "species", itemId }), label)}
          renderMeta={(item) => `${item.breedCount} linked breed${item.breedCount === 1 ? "" : "s"}`}
        />

        <TaxonomySection
          kind="breeds"
          items={breeds.map((breed) => ({
            ...breed,
            speciesLabel: species.find((item) => item.id === breed.speciesId)?.label ?? "Unknown species"
          }))}
          title={sectionMeta.breeds.title}
          eyebrow={sectionMeta.breeds.eyebrow}
          description={sectionMeta.breeds.description}
          addLabel="Add breed"
          species={species}
          onSubmit={(payload) => createMutation.mutate({ kind: "breeds", ...payload } as any)}
          onUpdate={(item) => updateMutation.mutate({ kind: "breeds", item })}
          onDelete={(itemId, label) => confirmDelete(() => deleteMutation.mutate({ kind: "breeds", itemId }), label)}
          renderMeta={(item) => item.speciesLabel ?? "Unknown species"}
        />

        <TaxonomySection
          kind="hobbies"
          items={hobbies}
          title={sectionMeta.hobbies.title}
          eyebrow={sectionMeta.hobbies.eyebrow}
          description={sectionMeta.hobbies.description}
          addLabel="Add hobby"
          onSubmit={(payload) => createMutation.mutate({ kind: "hobbies", ...payload } as any)}
          onUpdate={(item) => updateMutation.mutate({ kind: "hobbies", item })}
          onDelete={(itemId, label) => confirmDelete(() => deleteMutation.mutate({ kind: "hobbies", itemId }), label)}
        />

        <TaxonomySection
          kind="compatibility"
          items={compatibility}
          title={sectionMeta.compatibility.title}
          eyebrow={sectionMeta.compatibility.eyebrow}
          description={sectionMeta.compatibility.description}
          addLabel="Add compatibility tag"
          onSubmit={(payload) => createMutation.mutate({ kind: "compatibility", ...payload } as any)}
          onUpdate={(item) => updateMutation.mutate({ kind: "compatibility", item })}
          onDelete={(itemId, label) =>
            confirmDelete(() => deleteMutation.mutate({ kind: "compatibility", itemId }), label)
          }
        />

        <TaxonomySection
          kind="characters"
          items={characters}
          title={sectionMeta.characters.title}
          eyebrow={sectionMeta.characters.eyebrow}
          description={sectionMeta.characters.description}
          addLabel="Add character trait"
          onSubmit={(payload) => createMutation.mutate({ kind: "characters", ...payload } as any)}
          onUpdate={(item) => updateMutation.mutate({ kind: "characters", item })}
          onDelete={(itemId, label) =>
            confirmDelete(() => deleteMutation.mutate({ kind: "characters", itemId }), label)
          }
        />
      </section>
    </div>
  );
}

function TaxonomySection({
  kind,
  items,
  title,
  eyebrow,
  description,
  addLabel,
  species,
  onSubmit,
  onUpdate,
  onDelete,
  renderMeta
}: {
  kind: (typeof taxonomyKinds)[number];
  items: Array<{ id: string; label: string; speciesId?: string; speciesLabel?: string; breedCount?: number }>;
  title: string;
  eyebrow: string;
  description: string;
  addLabel: string;
  species?: Array<{ id: string; label: string }>;
  onSubmit: (payload: { label: string; speciesId?: string; translationTr?: string }) => void;
  onUpdate: (item: any) => void;
  onDelete: (itemId: string, label: string) => void;
  renderMeta?: (item: { id: string; label: string; speciesId?: string; speciesLabel?: string; breedCount?: number; translations?: Record<string, string> }) => string;
}) {
  const isBreedSection = kind === "breeds";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTr, setEditTr] = useState("");
  const { register, handleSubmit, reset, watch } = useForm<{ label: string; speciesId: string; translationTr: string }>({
    defaultValues: {
      label: "",
      speciesId: "",
      translationTr: ""
    }
  });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">{eyebrow}</p>
          <h2 className="text-3xl text-[var(--petto-ink)]">{title}</h2>
          <p className="max-w-2xl text-sm leading-7 text-[var(--petto-muted)]">{description}</p>
        </div>
        <div className="rounded-full border border-[var(--petto-border)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--petto-secondary)]">
          {items.length} item{items.length === 1 ? "" : "s"}
        </div>
      </div>

      <form
        className="mt-5 grid gap-3 rounded-[24px] border border-[var(--petto-border)] bg-white/70 p-4"
        onSubmit={handleSubmit((values) => {
          onSubmit({
            label: values.label.trim(),
            speciesId: isBreedSection ? values.speciesId : undefined,
            translationTr: values.translationTr.trim() || undefined
          });
          reset();
        })}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder={`${addLabel} (English)`} {...register("label", { required: true })} />
          <Input placeholder="Turkish translation" {...register("translationTr")} />
        </div>
        {isBreedSection ? (
          <select
            className="flex h-11 w-full rounded-2xl border border-[var(--petto-border)] bg-white px-4 text-sm text-[var(--petto-ink)] outline-none"
            {...register("speciesId")}
          >
            <option value="">Choose parent species</option>
            {species?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={isBreedSection && !watch("speciesId")}>
            {addLabel}
          </Button>
        </div>
      </form>

      <div className="mt-5 space-y-3">
        {items.length ? (
          items.map((item) => (
            <div
              key={item.id}
              className="rounded-[22px] border border-[var(--petto-border)] bg-[rgba(255,252,248,0.92)] px-4 py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--petto-ink)]">{item.label}</p>
                  {renderMeta ? <p className="text-sm text-[var(--petto-muted)]">{renderMeta(item)}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  {editingId !== item.id && (
                    <Button
                      variant="ghost"
                      className="text-[var(--petto-primary)] hover:text-[var(--petto-primary-dark)]"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditTr((item as any).translations?.tr ?? "");
                      }}
                    >
                      {(item as any).translations?.tr ? `TR: ${(item as any).translations.tr}` : "+ Add Turkish"}
                    </Button>
                  )}
                  <Button variant="ghost" className="text-rose-700 hover:text-rose-800" onClick={() => onDelete(item.id, item.label)}>
                    Delete
                  </Button>
                </div>
              </div>
              {editingId === item.id && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--petto-border)] bg-white p-2">
                  <Input
                    placeholder="Turkish translation"
                    value={editTr}
                    onChange={(e) => setEditTr(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => {
                      onUpdate({
                        id: item.id,
                        label: item.label,
                        slug: item.label.toLowerCase().trim().replace(/\s+/g, "-"),
                        speciesId: item.speciesId || undefined,
                        isActive: true,
                        translations: { ...((item as any).translations ?? {}), tr: editTr.trim() }
                      });
                      setEditingId(null);
                      setEditTr("");
                    }}
                  >
                    Save
                  </Button>
                  <Button variant="ghost" onClick={() => { setEditingId(null); setEditTr(""); }}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="rounded-[22px] border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-8 text-center text-sm text-[var(--petto-muted)]">
            No items yet. Add the first one above and it will immediately appear in the mobile app.
          </div>
        )}
      </div>
    </Card>
  );
}

function confirmDelete(action: () => void, label: string) {
  if (typeof window === "undefined") {
    action();
    return;
  }

  if (window.confirm(`Delete "${label}" from the catalog?`)) {
    action();
  }
}
