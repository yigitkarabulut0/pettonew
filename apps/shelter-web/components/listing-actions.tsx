"use client";

// Post-publish listing management controls. The action rail decides
// which verbs to expose based on the listing's `listingState` — the
// matrix mirrors the product spec exactly. Server-side re-enforces
// every transition; this component is UX sugar, not security.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  Ban,
  Heart,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Undo2
} from "lucide-react";

import type { ListingState, ShelterPet } from "@petto/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteShelterPet,
  restoreShelterListing,
  transitionShelterListing
} from "@/lib/api";

type Verb = "edit" | "pause" | "publish" | "mark_adopted" | "archive" | "delete";

// State → allowed verbs. "edit" isn't a transition — it's a link
// toggle on the UI — but we gate it with the same table. `publish` is
// shelter vocab for "unpause", which internally moves paused →
// published.
const MATRIX: Record<ListingState, Partial<Record<Verb, boolean>>> = {
  draft: { edit: true, delete: true },
  pending_review: {},
  published: { edit: true, pause: true, mark_adopted: true, archive: true, delete: true },
  paused: { edit: true, publish: true, mark_adopted: true, archive: true, delete: true },
  adopted: { archive: true },
  archived: { delete: true },
  rejected: { edit: true, delete: true }
};

export function listingCanEdit(state: ListingState): boolean {
  return !!MATRIX[state]?.edit;
}

export function ListingActionRail({ pet }: { pet: ShelterPet }) {
  const qc = useQueryClient();
  const [markAdoptedOpen, setMarkAdoptedOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const transition = useMutation({
    mutationFn: (vars: {
      action: "pause" | "publish" | "archive";
    }) => transitionShelterListing(pet.id, vars.action),
    onSuccess: () => {
      toast.success("Listing updated.");
      qc.invalidateQueries({ queryKey: ["shelter-pet", pet.id] });
      qc.invalidateQueries({ queryKey: ["shelter-pets"] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const del = useMutation({
    mutationFn: () => deleteShelterPet(pet.id),
    onSuccess: () => {
      toast.success(
        pet.listingState === "draft"
          ? "Draft deleted."
          : "Listing moved to trash — recoverable for 30 days."
      );
      qc.invalidateQueries({ queryKey: ["shelter-pet", pet.id] });
      qc.invalidateQueries({ queryKey: ["shelter-pets"] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const restore = useMutation({
    mutationFn: () => restoreShelterListing(pet.id),
    onSuccess: () => {
      toast.success("Listing restored.");
      qc.invalidateQueries({ queryKey: ["shelter-pet", pet.id] });
      qc.invalidateQueries({ queryKey: ["shelter-pets"] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const allowed = MATRIX[pet.listingState] ?? {};

  if (pet.deletedAt) {
    return (
      <Card className="space-y-3 rounded-2xl border-amber-300 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <Trash2 className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <div className="text-sm font-semibold text-amber-900">
              In trash — hard-deletes 30 days after {pet.deletedAt.slice(0, 10)}
            </div>
            <p className="mt-0.5 text-xs text-amber-900/90">
              Hidden from every view. You can restore it until the sweeper purges it.
            </p>
          </div>
        </div>
        <Button onClick={() => restore.mutate()} disabled={restore.isPending} className="w-full">
          {restore.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Undo2 className="mr-1 h-4 w-4" />
          )}
          Restore listing
        </Button>
      </Card>
    );
  }

  if (pet.listingState === "pending_review") {
    return (
      <Card className="rounded-2xl border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
        <div className="font-semibold">Under review</div>
        <p className="mt-1 text-xs">
          A moderator is reviewing this listing. Edits and deletes are locked until
          they approve or reject.
        </p>
      </Card>
    );
  }

  const buttons: React.ReactNode[] = [];

  if (allowed.pause) {
    buttons.push(
      <Button
        key="pause"
        variant="outline"
        className="gap-1"
        onClick={() => transition.mutate({ action: "pause" })}
        disabled={transition.isPending}
      >
        <Pause className="h-4 w-4" /> Pause
      </Button>
    );
  }
  if (allowed.publish) {
    buttons.push(
      <Button
        key="publish"
        className="gap-1"
        onClick={() => transition.mutate({ action: "publish" })}
        disabled={transition.isPending}
      >
        <Play className="h-4 w-4" /> Unpause
      </Button>
    );
  }
  if (allowed.mark_adopted) {
    buttons.push(
      <Button key="adopted" variant="outline" className="gap-1" onClick={() => setMarkAdoptedOpen(true)}>
        <Heart className="h-4 w-4" /> Mark adopted
      </Button>
    );
  }
  if (allowed.archive) {
    buttons.push(
      <Button
        key="archive"
        variant="outline"
        className="gap-1"
        onClick={() => transition.mutate({ action: "archive" })}
        disabled={transition.isPending}
      >
        <Archive className="h-4 w-4" /> Archive
      </Button>
    );
  }
  if (allowed.delete) {
    buttons.push(
      <Button
        key="delete"
        variant="outline"
        className="gap-1 text-[var(--destructive)] hover:text-[var(--destructive)]"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="h-4 w-4" /> Delete
      </Button>
    );
  }

  return (
    <>
      <Card className="space-y-3 rounded-2xl border-[var(--border)] bg-white p-5 shadow-card">
        <div className="text-sm font-semibold">Listing actions</div>
        {buttons.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            No actions available in state <strong>{pet.listingState}</strong>.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">{buttons}</div>
        )}
        {pet.listingState === "rejected" && pet.lastRejectionCode && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            <div className="font-semibold">Rejected: {pet.lastRejectionCode}</div>
            {pet.lastRejectionNote && <p className="mt-1">{pet.lastRejectionNote}</p>}
            <p className="mt-2 text-[11px] text-rose-900/80">
              Edit the listing and re-submit to put it back in review.
            </p>
          </div>
        )}
      </Card>

      {markAdoptedOpen && (
        <MarkAdoptedDialog
          petId={pet.id}
          petName={pet.name}
          onClose={() => setMarkAdoptedOpen(false)}
        />
      )}
      {deleteOpen && (
        <DeleteDialog
          petName={pet.name}
          isDraft={pet.listingState === "draft"}
          pending={del.isPending}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await del.mutateAsync();
            setDeleteOpen(false);
          }}
        />
      )}
    </>
  );
}

// ── Mark-adopted dialog ────────────────────────────────────────────

function MarkAdoptedDialog({
  petId,
  petName,
  onClose
}: {
  petId: string;
  petName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [adopterName, setAdopterName] = useState("");
  const [adoptionDate, setAdoptionDate] = useState("");
  const [notes, setNotes] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  const mut = useMutation({
    mutationFn: () =>
      transitionShelterListing(petId, "mark_adopted", {
        adopterName: adopterName.trim(),
        adoptionDate: adoptionDate.trim(),
        adoptionNotes: notes.trim()
      }),
    onSuccess: () => {
      toast.success(`${petName} marked as adopted 🎉`);
      qc.invalidateQueries({ queryKey: ["shelter-pet", petId] });
      qc.invalidateQueries({ queryKey: ["shelter-pets"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const nameOverflow = adopterName.length > 100;
  const notesOverflow = notes.length > 500;
  const futureDate = adoptionDate && adoptionDate > today;
  const canSubmit = !nameOverflow && !notesOverflow && !futureDate && !mut.isPending;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark {petName} as adopted</DialogTitle>
          <DialogDescription>
            The listing moves to the <strong>adopted</strong> state and drops out of
            discovery. All fields are optional and kept internal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="adopter-name">Adopter name (≤100)</Label>
            <Input
              id="adopter-name"
              value={adopterName}
              onChange={(e) => setAdopterName(e.target.value)}
              maxLength={100}
              placeholder="e.g. Jane Doe"
            />
          </div>
          <div>
            <Label htmlFor="adoption-date">Adoption date</Label>
            <Input
              id="adoption-date"
              type="date"
              value={adoptionDate}
              max={today}
              onChange={(e) => setAdoptionDate(e.target.value)}
            />
            {futureDate && (
              <p className="mt-1 text-xs text-[var(--destructive)]">
                Adoption date cannot be in the future.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="adoption-notes">Internal notes (≤500)</Label>
            <textarea
              id="adoption-notes"
              className="min-h-[96px] w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              placeholder="Home context, follow-up plan, anything the rest of the team should see."
            />
            <div className="mt-1 text-right text-[11px] text-[var(--muted-foreground)]">
              {notes.length} / 500
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!canSubmit}>
            {mut.isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Mark adopted"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete dialog ──────────────────────────────────────────────────

function DeleteDialog({
  petName,
  isDraft,
  pending,
  onCancel,
  onConfirm
}: {
  petName: string;
  isDraft: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {petName}?</DialogTitle>
          <DialogDescription>
            {isDraft
              ? "This draft has never been published. Deleting it is permanent."
              : "The listing drops out of every view immediately. You can restore it for 30 days; after that it's purged for good."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            className="gap-1 bg-rose-600 text-white hover:bg-rose-700"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isDraft ? (
              <>
                <Ban className="mr-1 h-4 w-4" />
                Delete permanently
              </>
            ) : (
              <>
                <Trash2 className="mr-1 h-4 w-4" />
                Move to trash
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk action bar (used on the /pets list) ───────────────────────

type BulkVerb = "pause" | "mark_adopted" | "archive" | "delete";

const BULK_ALLOWED_FROM: Record<BulkVerb, ListingState[]> = {
  pause: ["published"],
  mark_adopted: ["published", "paused"],
  archive: ["published", "paused", "adopted"],
  delete: ["draft", "rejected"]
};

const BULK_VERB_LABEL: Record<BulkVerb, string> = {
  pause: "Pause",
  mark_adopted: "Mark adopted",
  archive: "Archive",
  delete: "Delete"
};

export function BulkActionBar({
  selectedIds,
  allPets,
  onClear,
  onDone
}: {
  selectedIds: string[];
  allPets: ShelterPet[];
  onClear: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [verb, setVerb] = useState<BulkVerb | "">("");
  const [confirming, setConfirming] = useState(false);

  const selected = allPets.filter((p) => selectedIds.includes(p.id));
  const applicable =
    verb === ""
      ? selected
      : selected.filter((p) =>
          BULK_ALLOWED_FROM[verb].includes(p.listingState)
        );
  const skippable = selected.length - applicable.length;

  const mut = useMutation({
    mutationFn: async () => {
      if (!verb) throw new Error("Pick an action");
      if (applicable.length > 50) throw new Error("Max 50 listings per bulk action.");
      const { bulkShelterAction } = await import("@/lib/api");
      return bulkShelterAction(verb, applicable.map((p) => p.id));
    },
    onSuccess: (results) => {
      const okCount = results.filter((r) => r.ok).length;
      const errCount = results.length - okCount;
      if (errCount === 0) toast.success(`Applied to ${okCount} listings.`);
      else toast.message(`${okCount} succeeded, ${errCount} failed.`);
      qc.invalidateQueries({ queryKey: ["shelter-pets"] });
      setConfirming(false);
      setVerb("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message)
  });

  if (selectedIds.length === 0) return null;

  return (
    <>
      <div className="sticky bottom-4 z-20 mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-full border border-[var(--border)] bg-[var(--background)] px-4 py-2 shadow-card backdrop-blur-md">
        <span className="text-sm font-semibold">
          {selectedIds.length} selected
        </span>
        <div className="flex items-center gap-2">
          <select
            value={verb}
            onChange={(e) => setVerb(e.target.value as BulkVerb)}
            className="h-9 rounded-full border border-[var(--border)] bg-white px-3 text-sm"
          >
            <option value="">Pick an action…</option>
            <option value="pause">Pause</option>
            <option value="mark_adopted">Mark adopted</option>
            <option value="archive">Archive</option>
            <option value="delete">Delete</option>
          </select>
          <Button
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={!verb || applicable.length === 0 || applicable.length > 50}
          >
            Apply
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>

      {confirming && verb && (
        <Dialog open onOpenChange={(v) => !v && setConfirming(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {BULK_VERB_LABEL[verb]} {applicable.length} listings?
              </DialogTitle>
              <DialogDescription>
                {applicable.length > 50 ? (
                  <span className="text-[var(--destructive)]">
                    Bulk actions are limited to 50 listings per operation.
                  </span>
                ) : (
                  <>
                    This applies to <strong>{applicable.length}</strong> listing
                    {applicable.length === 1 ? "" : "s"}.
                    {skippable > 0 && (
                      <span className="ml-1 text-amber-700">
                        ({skippable} skipped — wrong state for <em>{BULK_VERB_LABEL[verb]}</em>)
                      </span>
                    )}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={mut.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => mut.mutate()}
                disabled={mut.isPending || applicable.length === 0 || applicable.length > 50}
                className={
                  verb === "delete"
                    ? "bg-rose-600 text-white hover:bg-rose-700"
                    : undefined
                }
              >
                {mut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <RotateCcw className="mr-1 h-4 w-4" />
                    Confirm
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
