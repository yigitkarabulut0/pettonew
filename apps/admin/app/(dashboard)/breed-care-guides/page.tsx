"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { BookOpen, ImageIcon, PawPrint, Plus, Upload, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { uploadImageFile } from "@/lib/media";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { RowActions } from "@/components/data-table/columns";
import { useDataTable } from "@/components/data-table/useDataTable";
import {
  AdminBreedCareGuide,
  BreedCareGuideTranslation,
  createAdminBreedCareGuide,
  deleteAdminBreedCareGuide,
  getAdminBreedCareGuides,
  getTaxonomy,
  updateAdminBreedCareGuide
} from "@/lib/admin-api";

const SPECIES_WIDE_VALUE = "__species_wide__";

// Locales the admin can author overrides for. Base English (the top-level
// title/summary/body fields) is always the fallback, so we don't list it
// here — it's authored via the main form. Add a new locale by extending
// this array; matching mobile users get the localized copy automatically.
const SUPPORTED_LOCALES: Array<{ code: string; label: string }> = [
  { code: "tr", label: "Türkçe" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" }
];

type FormState = {
  id: string;
  speciesId: string;
  speciesLabel: string;
  breedId: string;
  breedLabel: string;
  title: string;
  summary: string;
  body: string;
  heroImageUrl: string;
  translations: Record<string, BreedCareGuideTranslation>;
};

const EMPTY_FORM: FormState = {
  id: "",
  speciesId: "",
  speciesLabel: "",
  breedId: "",
  breedLabel: "",
  title: "",
  summary: "",
  body: "",
  heroImageUrl: "",
  translations: {}
};

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";

export default function BreedCareGuidesPage() {
  const qc = useQueryClient();
  const { state, setState, selection, setSelection } = useDataTable();
  const { confirm, node: confirmNode } = useConfirm();

  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const guidesQuery = useQuery({
    queryKey: ["admin-breed-care-guides"],
    queryFn: getAdminBreedCareGuides
  });

  const speciesQuery = useQuery({
    queryKey: ["taxonomy", "species"],
    queryFn: () => getTaxonomy("species")
  });

  const breedsQuery = useQuery({
    queryKey: ["taxonomy", "breeds"],
    queryFn: () => getTaxonomy("breeds")
  });

  const breedsForSpecies = React.useMemo(() => {
    if (!form.speciesId) return [];
    return (breedsQuery.data ?? []).filter(
      (b) => b.speciesId === form.speciesId
    );
  }, [breedsQuery.data, form.speciesId]);

  const all = guidesQuery.data ?? [];

  // Build a set of (speciesId, breedId) pairs that already have a guide.
  // Species-wide guides slot in with breedId="". The breed picker disables
  // any option already covered, so an admin can't accidentally create a
  // duplicate guide for "Dog · Afghan Hound" and instead has to use Edit
  // on the existing row. In edit mode we exclude the row being edited so
  // the current selection stays choosable.
  const takenBreedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const g of all) {
      if (form.id && g.id === form.id) continue;
      keys.add(`${g.speciesId}:${g.breedId ?? ""}`);
    }
    return keys;
  }, [all, form.id]);
  const hasAnyAvailableBreed =
    !form.speciesId
      ? true
      : !takenBreedKeys.has(`${form.speciesId}:`) ||
        breedsForSpecies.some(
          (b) => !takenBreedKeys.has(`${form.speciesId}:${b.id}`)
        );

  const filtered = React.useMemo(() => {
    const q = state.search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((g) =>
      [g.title, g.speciesLabel, g.breedLabel, g.summary].some((v) =>
        v?.toLowerCase().includes(q)
      )
    );
  }, [all, state.search]);

  const paged = React.useMemo(() => {
    const start = (state.page - 1) * state.pageSize;
    return filtered.slice(start, start + state.pageSize);
  }, [filtered, state.page, state.pageSize]);

  const upsertMutation = useMutation({
    mutationFn: () => {
      // Normalise translations: drop locales whose every field is blank
      // so the JSONB on the server doesn't collect dead keys, and trim
      // the surviving values per-field.
      const cleanedTranslations: Record<string, BreedCareGuideTranslation> = {};
      for (const [code, tr] of Object.entries(form.translations)) {
        const t = (tr.title ?? "").trim();
        const s = (tr.summary ?? "").trim();
        const b = (tr.body ?? "").trim();
        if (!t && !s && !b) continue;
        cleanedTranslations[code] = {
          ...(t ? { title: t } : {}),
          ...(s ? { summary: s } : {}),
          ...(b ? { body: b } : {})
        };
      }
      const payload = {
        speciesId: form.speciesId,
        speciesLabel: form.speciesLabel,
        breedId: form.breedId || undefined,
        breedLabel: form.breedLabel || undefined,
        title: form.title.trim(),
        summary: form.summary.trim() || undefined,
        body: form.body,
        heroImageUrl: form.heroImageUrl.trim() || undefined,
        translations: cleanedTranslations
      };
      return form.id
        ? updateAdminBreedCareGuide(form.id, payload)
        : createAdminBreedCareGuide(payload);
    },
    onSuccess: () => {
      toast.success(form.id ? "Guide updated" : "Guide created");
      qc.invalidateQueries({ queryKey: ["admin-breed-care-guides"] });
      setSheetOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminBreedCareGuide(id),
    onSuccess: () => {
      toast.success("Guide deleted");
      qc.invalidateQueries({ queryKey: ["admin-breed-care-guides"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  };

  const openEdit = (g: AdminBreedCareGuide) => {
    setForm({
      id: g.id,
      speciesId: g.speciesId,
      speciesLabel: g.speciesLabel,
      breedId: g.breedId ?? "",
      breedLabel: g.breedLabel ?? "",
      title: g.title,
      summary: g.summary ?? "",
      body: g.body,
      heroImageUrl: g.heroImageUrl ?? "",
      translations: g.translations ?? {}
    });
    setSheetOpen(true);
  };

  const askDelete = (g: AdminBreedCareGuide) => {
    confirm({
      title: `Delete "${g.title}"?`,
      description:
        "Mobile users on this breed will see the empty state until you (or another admin) add a new guide.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await deleteMutation.mutateAsync(g.id);
      }
    });
  };

  const onSpeciesChange = (speciesId: string) => {
    const species = (speciesQuery.data ?? []).find((s) => s.id === speciesId);
    setForm((prev) => ({
      ...prev,
      speciesId,
      speciesLabel: species?.label ?? "",
      breedId: "",
      breedLabel: ""
    }));
  };

  // Hero image upload — re-encodes to WebP and pushes to R2 via the
  // existing /v1/admin/media/presign flow. Returns a public URL we save
  // into form.heroImageUrl for the next mutation to persist.
  const handlePickHero = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadImageFile(file, "breed-care");
      setForm((prev) => ({ ...prev, heroImageUrl: url }));
      toast.success("Hero image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onBreedChange = (breedValue: string) => {
    if (breedValue === SPECIES_WIDE_VALUE) {
      setForm((prev) => ({ ...prev, breedId: "", breedLabel: "" }));
      return;
    }
    const breed = breedsForSpecies.find((b) => b.id === breedValue);
    setForm((prev) => ({
      ...prev,
      breedId: breed?.id ?? "",
      breedLabel: breed?.label ?? ""
    }));
  };

  const columns = React.useMemo<ColumnDef<AdminBreedCareGuide, unknown>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Guide",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]">
              <BookOpen className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium text-[var(--foreground)]">
                {row.original.title}
              </div>
              {row.original.summary ? (
                <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                  {row.original.summary}
                </div>
              ) : null}
            </div>
          </div>
        )
      },
      {
        accessorKey: "speciesLabel",
        header: "Species",
        cell: ({ row }) => (
          <span className="text-xs text-[var(--muted-foreground)]">
            {row.original.speciesLabel || "—"}
          </span>
        )
      },
      {
        accessorKey: "breedLabel",
        header: "Breed",
        cell: ({ row }) =>
          row.original.breedLabel ? (
            <span className="text-xs text-[var(--foreground)]">
              {row.original.breedLabel}
            </span>
          ) : (
            <span className="text-xs italic text-[var(--muted-foreground)]">
              Species-wide
            </span>
          )
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => <RelativeTime value={row.original.updatedAt} />
      },
      {
        id: "_actions",
        header: "",
        cell: ({ row }) => (
          <RowActions
            items={[
              { label: "Edit", onSelect: () => openEdit(row.original) },
              {
                label: "Delete",
                destructive: true,
                onSelect: () => askDelete(row.original)
              }
            ]}
          />
        )
      }
    ],
    []
  );

  // Defensive backstop for the disabled <option>s above — even if the DOM
  // is manipulated, the form can't submit when the picked pair is already
  // covered by another guide in create mode.
  const duplicatePair =
    !form.id &&
    form.speciesId.length > 0 &&
    takenBreedKeys.has(`${form.speciesId}:${form.breedId ?? ""}`);

  const canSubmit =
    form.speciesId.length > 0 &&
    form.title.trim().length > 0 &&
    form.body.trim().length > 0 &&
    !duplicatePair;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Breed Care Guides"
        description="Curated care information per species & breed. Mobile users see this when they tap their pet's card on the Care tab. Pick a breed for breed-specific advice or leave it on Species-wide for advice that applies to every breed of that species."
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            New guide
          </Button>
        }
      />

      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
        searchPlaceholder="Search by title, species, or breed"
      />

      {!guidesQuery.isLoading && all.length === 0 ? (
        <EmptyState
          icon={PawPrint}
          title="No guides yet"
          description="Start with one species-wide guide per species (e.g. 'Caring for any dog'), then layer breed-specific guides on top for the populars."
          action={
            <Button onClick={openCreate} size="sm">
              <Plus className="mr-1 h-4 w-4" />
              New guide
            </Button>
          }
        />
      ) : (
        <DataTable<AdminBreedCareGuide>
          data={paged}
          columns={columns}
          rowId={(row) => row.id}
          total={filtered.length}
          state={state}
          onStateChange={setState}
          loading={guidesQuery.isLoading}
          selection={selection}
          onSelectionChange={setSelection}
          onRowClick={(row) => openEdit(row)}
        />
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
        >
          <SheetHeader className="shrink-0 border-b border-[var(--border)] px-6 py-4">
            <SheetTitle>{form.id ? "Edit guide" : "New guide"}</SheetTitle>
            <SheetDescription>
              Body supports plain paragraphs separated by blank lines —
              mobile renders each paragraph as its own block.
            </SheetDescription>
          </SheetHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) upsertMutation.mutate();
            }}
          >
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bcg-species">Species</Label>
                <select
                  id="bcg-species"
                  className={SELECT_CLASS}
                  value={form.speciesId}
                  onChange={(e) => onSpeciesChange(e.target.value)}
                  disabled={speciesQuery.isLoading}
                >
                  <option value="">Select species…</option>
                  {(speciesQuery.data ?? []).map((s) => {
                    // Tally remaining slots for this species: species-wide
                    // (1 row) + one row per breed. Used as a hint, not a
                    // hard block — the admin might still want to edit.
                    const breedsForS = (breedsQuery.data ?? []).filter(
                      (b) => b.speciesId === s.id
                    );
                    const totalSlots = 1 + breedsForS.length;
                    let used = takenBreedKeys.has(`${s.id}:`) ? 1 : 0;
                    for (const b of breedsForS) {
                      if (takenBreedKeys.has(`${s.id}:${b.id}`)) used++;
                    }
                    const remaining = totalSlots - used;
                    return (
                      <option key={s.id} value={s.id}>
                        {s.label}
                        {!form.id && totalSlots > 0
                          ? remaining === 0
                            ? " — all covered"
                            : ` — ${remaining} open`
                          : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bcg-breed">Breed</Label>
                <select
                  id="bcg-breed"
                  className={SELECT_CLASS}
                  value={form.breedId === "" ? SPECIES_WIDE_VALUE : form.breedId}
                  onChange={(e) => onBreedChange(e.target.value)}
                  disabled={!form.speciesId}
                >
                  {(() => {
                    const speciesWideTaken =
                      form.speciesId && takenBreedKeys.has(`${form.speciesId}:`);
                    return (
                      <option
                        value={SPECIES_WIDE_VALUE}
                        disabled={!!speciesWideTaken}
                      >
                        Species-wide (every breed)
                        {speciesWideTaken ? " — guide exists" : ""}
                      </option>
                    );
                  })()}
                  {breedsForSpecies.map((b) => {
                    const taken = takenBreedKeys.has(`${form.speciesId}:${b.id}`);
                    return (
                      <option key={b.id} value={b.id} disabled={taken}>
                        {b.label}
                        {taken ? " — guide exists" : ""}
                      </option>
                    );
                  })}
                </select>
                {form.speciesId && !form.id && !hasAnyAvailableBreed ? (
                  <p className="text-[11px] text-[var(--warning)]">
                    Every breed in this species already has a guide. Use the
                    list to edit an existing one instead.
                  </p>
                ) : null}
                {form.speciesId && !form.id && hasAnyAvailableBreed ? (
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    Greyed-out breeds already have a guide — pick those from the
                    table to edit.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="bcg-title">Title</Label>
              <Input
                id="bcg-title"
                placeholder="Caring for your Golden Retriever"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="bcg-summary">Summary (optional)</Label>
              <Input
                id="bcg-summary"
                placeholder="One-line summary shown under the title on mobile"
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="bcg-body">Body</Label>
              <Textarea
                id="bcg-body"
                placeholder="Write paragraphs separated by blank lines. Cover energy needs, grooming, common health issues, training quirks, etc."
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={14}
                className="font-mono text-xs"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Hero image (optional)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePickHero}
              />
              {form.heroImageUrl ? (
                <div className="relative overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]">
                  <img
                    src={form.heroImageUrl}
                    alt="Hero preview"
                    className="aspect-[16/9] w-full object-cover"
                  />
                  <div className="absolute right-2 top-2 flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 bg-white/90 backdrop-blur"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      <Upload className="mr-1 h-3.5 w-3.5" />
                      Replace
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 bg-white/90 backdrop-blur"
                      onClick={() =>
                        setForm({ ...form, heroImageUrl: "" })
                      }
                      disabled={uploading}
                      aria-label="Remove image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)] transition hover:border-[var(--ring)] hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? (
                    <>
                      <Upload className="h-5 w-5 animate-pulse" />
                      <span className="text-sm font-medium">Uploading…</span>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-6 w-6" />
                      <span className="text-sm font-medium">
                        Click to upload an image
                      </span>
                      <span className="text-[11px]">
                        Re-encoded to WebP and stored on R2 — 16:9 looks best
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>

            <TranslationsEditor
              translations={form.translations}
              onChange={(next) => setForm((prev) => ({ ...prev, translations: next }))}
            />

            </div>

            <SheetFooter className="shrink-0 border-t border-[var(--border)] bg-[var(--petto-surface)] px-6 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit || upsertMutation.isPending}
              >
                {upsertMutation.isPending
                  ? "Saving…"
                  : form.id
                  ? "Save changes"
                  : "Create guide"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {confirmNode}
    </div>
  );
}

// Per-locale editor wrapped in collapsible cards. Empty fields fall back
// to the base English copy at read time, so a translator can ship just
// the title for now and finish the body later. Removing every field for
// a locale removes that locale from the JSONB on save (handled in the
// upsertMutation normaliser).
function TranslationsEditor({
  translations,
  onChange
}: {
  translations: Record<string, BreedCareGuideTranslation>;
  onChange: (next: Record<string, BreedCareGuideTranslation>) => void;
}) {
  function patch(code: string, field: keyof BreedCareGuideTranslation, value: string) {
    const prev = translations[code] ?? {};
    onChange({ ...translations, [code]: { ...prev, [field]: value } });
  }
  function clearLocale(code: string) {
    const next = { ...translations };
    delete next[code];
    onChange(next);
  }
  function localeFilled(code: string) {
    const t = translations[code];
    if (!t) return false;
    return Boolean(t.title?.trim() || t.summary?.trim() || t.body?.trim());
  }

  return (
    <div className="grid gap-1.5">
      <Label>Translations</Label>
      <p className="-mt-1 text-[11px] text-[var(--muted-foreground)]">
        Empty fields fall back to the English version. A locale with every field empty is
        not stored. Mobile users see the base English copy until you author their language.
      </p>
      <div className="flex flex-col gap-2">
        {SUPPORTED_LOCALES.map(({ code, label }) => {
          const tr = translations[code] ?? {};
          const filled = localeFilled(code);
          return (
            <details
              key={code}
              className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)]"
              open={filled}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                    {code}
                  </span>
                  <span className="font-medium text-[var(--foreground)]">{label}</span>
                  {filled ? (
                    <span className="rounded-sm bg-[var(--success-soft)] px-1.5 py-px text-[10px] font-semibold text-[var(--success)]">
                      authored
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--muted-foreground)]">
                      uses English
                    </span>
                  )}
                </div>
                {filled ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.preventDefault();
                      clearLocale(code);
                    }}
                  >
                    <X className="mr-1 h-3 w-3" /> Clear
                  </Button>
                ) : null}
              </summary>
              <div className="flex flex-col gap-2 border-t border-[var(--border)] px-3 py-3">
                <div className="grid gap-1">
                  <Label className="text-[11px]">Title</Label>
                  <Input
                    value={tr.title ?? ""}
                    onChange={(e) => patch(code, "title", e.target.value)}
                    placeholder="Localized title"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[11px]">Summary</Label>
                  <Input
                    value={tr.summary ?? ""}
                    onChange={(e) => patch(code, "summary", e.target.value)}
                    placeholder="One-line summary in this language"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[11px]">Body</Label>
                  <Textarea
                    rows={10}
                    value={tr.body ?? ""}
                    onChange={(e) => patch(code, "body", e.target.value)}
                    placeholder="Full body in this language. Same paragraph rules as English."
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
