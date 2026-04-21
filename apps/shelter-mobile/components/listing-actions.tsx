// State-aware action rail + bulk action bar for shelter-mobile.
// Mirrors the shelter-web `listing-actions.tsx` feature set so operators
// have parity between phone and desktop: pause / publish / mark-adopted
// / archive / delete / restore + optional adopter metadata on mark-
// adopted, + a bottom bar for multi-select bulk operations.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import {
  Archive,
  Check,
  Heart,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Undo2,
  X
} from "lucide-react-native";

import type { ListingState, ShelterPet } from "@petto/contracts";
import {
  bulkShelterAction,
  deleteShelterPet,
  restoreShelterListing,
  transitionShelterListing,
  type BulkActionVerb
} from "@/lib/api";
import { theme, useTheme } from "@/lib/theme";

// State → allowed verb table, matches the spec matrix used on shelter-web.
type AllowedVerbs = Partial<{
  edit: boolean;
  pause: boolean;
  publish: boolean;
  mark_adopted: boolean;
  archive: boolean;
  delete: boolean;
}>;

const ALLOWED: Record<string, AllowedVerbs> = {
  draft: { edit: true, delete: true },
  pending_review: {},
  published: { edit: true, pause: true, mark_adopted: true, archive: true, delete: true },
  paused: { edit: true, publish: true, mark_adopted: true, archive: true, delete: true },
  adopted: { archive: true },
  archived: { delete: true },
  rejected: { edit: true, delete: true }
};

export function listingCanEdit(state: string): boolean {
  return !!ALLOWED[state]?.edit;
}

export function ListingActionRail({ pet }: { pet: ShelterPet }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [markOpen, setMarkOpen] = useState(false);

  const transition = useMutation({
    mutationFn: (action: "pause" | "publish" | "archive") =>
      transitionShelterListing(pet.id, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shelter-pet", pet.id] });
      qc.invalidateQueries({ queryKey: ["shelter-pets"] });
    },
    onError: (e: Error) => Alert.alert("Could not update", e.message)
  });

  const del = useMutation({
    mutationFn: () => deleteShelterPet(pet.id),
    onSuccess: () => {
      Alert.alert(
        pet.listingState === "draft" ? "Draft deleted" : "Moved to trash",
        pet.listingState === "draft"
          ? "This draft is gone."
          : "Recoverable for 30 days."
      );
      qc.invalidateQueries({ queryKey: ["shelter-pet", pet.id] });
      qc.invalidateQueries({ queryKey: ["shelter-pets"] });
    },
    onError: (e: Error) => Alert.alert("Could not delete", e.message)
  });

  const restore = useMutation({
    mutationFn: () => restoreShelterListing(pet.id),
    onSuccess: () => {
      Alert.alert("Restored", "This listing is active again.");
      qc.invalidateQueries({ queryKey: ["shelter-pet", pet.id] });
      qc.invalidateQueries({ queryKey: ["shelter-pets"] });
    },
    onError: (e: Error) => Alert.alert("Could not restore", e.message)
  });

  // Soft-deleted: show restore card only.
  if (pet.deletedAt) {
    return (
      <View
        style={{
          marginHorizontal: theme.spacing.xl,
          marginTop: theme.spacing.lg,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.lg,
          backgroundColor: t.colors.warningBg,
          borderWidth: 1,
          borderColor: t.colors.warning,
          gap: theme.spacing.sm
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Trash2 size={16} color={t.colors.warning} />
          <Text style={{ fontSize: 13, fontWeight: "700", color: t.colors.warning }}>
            In trash — deletes 30 days after {pet.deletedAt.slice(0, 10)}
          </Text>
        </View>
        <Pressable
          onPress={() => restore.mutate()}
          disabled={restore.isPending}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 10,
            borderRadius: theme.radius.pill,
            backgroundColor: t.colors.primary,
            opacity: pressed ? 0.9 : 1
          })}
        >
          {restore.isPending ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Undo2 size={14} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Restore listing</Text>
            </>
          )}
        </Pressable>
      </View>
    );
  }

  // Pending review: locked.
  if (pet.listingState === "pending_review") {
    return (
      <View
        style={{
          marginHorizontal: theme.spacing.xl,
          marginTop: theme.spacing.lg,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.lg,
          backgroundColor: t.colors.warningBg,
          borderWidth: 1,
          borderColor: t.colors.warning
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "700", color: t.colors.warning }}>
          Under review
        </Text>
        <Text style={{ marginTop: 4, fontSize: 12, color: t.colors.warning }}>
          A moderator is reviewing this listing. Edits and deletes are locked
          until they approve or reject.
        </Text>
      </View>
    );
  }

  const allowed: AllowedVerbs = ALLOWED[pet.listingState] ?? {};

  return (
    <>
      <View
        style={{
          marginHorizontal: theme.spacing.xl,
          marginTop: theme.spacing.lg,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.lg,
          backgroundColor: t.colors.card,
          borderWidth: 1,
          borderColor: t.colors.border,
          gap: theme.spacing.md
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: t.colors.muted,
            textTransform: "uppercase",
            letterSpacing: 0.6
          }}
        >
          Listing actions
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {allowed.pause && (
            <ActionButton
              icon={<Pause size={13} color={t.colors.ink} />}
              label="Pause"
              onPress={() => transition.mutate("pause")}
              tone="neutral"
              pending={transition.isPending}
              theme={t}
            />
          )}
          {allowed.publish && (
            <ActionButton
              icon={<Play size={13} color="#FFFFFF" />}
              label="Unpause"
              onPress={() => transition.mutate("publish")}
              tone="primary"
              pending={transition.isPending}
              theme={t}
            />
          )}
          {allowed.mark_adopted && (
            <ActionButton
              icon={<Heart size={13} color={t.colors.ink} />}
              label="Mark adopted"
              onPress={() => setMarkOpen(true)}
              tone="neutral"
              theme={t}
            />
          )}
          {allowed.archive && (
            <ActionButton
              icon={<Archive size={13} color={t.colors.ink} />}
              label="Archive"
              onPress={() => transition.mutate("archive")}
              tone="neutral"
              pending={transition.isPending}
              theme={t}
            />
          )}
          {allowed.delete && (
            <ActionButton
              icon={<Trash2 size={13} color={t.colors.danger} />}
              label="Delete"
              onPress={() =>
                Alert.alert(
                  "Delete this listing?",
                  pet.listingState === "draft"
                    ? "Draft deletes are permanent."
                    : "Hidden from all views. Recoverable for 30 days; then purged for good.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: pet.listingState === "draft" ? "Delete" : "Move to trash",
                      style: "destructive",
                      onPress: () => del.mutate()
                    }
                  ]
                )
              }
              tone="danger"
              pending={del.isPending}
              theme={t}
            />
          )}
        </View>
        {pet.listingState === "rejected" && pet.lastRejectionCode ? (
          <View
            style={{
              padding: theme.spacing.md,
              borderRadius: theme.radius.md,
              backgroundColor: t.colors.dangerBg,
              borderWidth: 1,
              borderColor: t.colors.danger
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: t.colors.danger }}>
              Rejected: {pet.lastRejectionCode}
            </Text>
            {pet.lastRejectionNote ? (
              <Text style={{ marginTop: 4, fontSize: 12, color: t.colors.danger }}>
                {pet.lastRejectionNote}
              </Text>
            ) : null}
            <Text style={{ marginTop: 6, fontSize: 10.5, color: t.colors.danger }}>
              Edit the listing and re-submit to put it back in review.
            </Text>
          </View>
        ) : null}
      </View>

      <MarkAdoptedModal
        visible={markOpen}
        petId={pet.id}
        petName={pet.name}
        onClose={() => setMarkOpen(false)}
      />
    </>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  tone,
  pending,
  theme: t
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  tone: "primary" | "neutral" | "danger";
  pending?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const bg =
    tone === "primary"
      ? t.colors.primary
      : tone === "danger"
        ? t.colors.dangerBg
        : t.colors.card;
  const color =
    tone === "primary" ? "#FFFFFF" : tone === "danger" ? t.colors.danger : t.colors.ink;
  const borderColor = tone === "primary" ? t.colors.primary : t.colors.border;
  return (
    <Pressable
      onPress={onPress}
      disabled={pending}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: theme.radius.pill,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor,
        opacity: pressed ? 0.8 : pending ? 0.5 : 1
      })}
    >
      {pending ? <ActivityIndicator color={color} size="small" /> : icon}
      <Text style={{ fontSize: 12, fontWeight: "700", color }}>{label}</Text>
    </Pressable>
  );
}

// ── Mark-adopted modal ──────────────────────────────────────────

function MarkAdoptedModal({
  visible,
  petId,
  petName,
  onClose
}: {
  visible: boolean;
  petId: string;
  petName: string;
  onClose: () => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const [adopterName, setAdopterName] = useState("");
  const [adoptionDate, setAdoptionDate] = useState("");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      transitionShelterListing(petId, "mark_adopted", {
        adopterName: adopterName.trim(),
        adoptionDate: adoptionDate.trim(),
        adoptionNotes: notes.trim()
      }),
    onSuccess: () => {
      Alert.alert("Marked adopted", `${petName} is officially home 🎉`);
      qc.invalidateQueries({ queryKey: ["shelter-pet", petId] });
      qc.invalidateQueries({ queryKey: ["shelter-pets"] });
      onClose();
    },
    onError: (e: Error) => Alert.alert("Could not save", e.message)
  });

  const today = new Date().toISOString().slice(0, 10);
  const nameOverflow = adopterName.length > 100;
  const notesOverflow = notes.length > 500;
  const futureDate = adoptionDate && adoptionDate > today;
  const canSubmit = !nameOverflow && !notesOverflow && !futureDate && !mut.isPending;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.xl,
            paddingBottom: theme.spacing.xl,
            gap: theme.spacing.md,
            maxHeight: "85%"
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: t.colors.ink }}>
              Mark {petName} as adopted
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={18} color={t.colors.ink} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 12, color: t.colors.muted }}>
            Optional details kept internal to your shelter. Fields can be left blank.
          </Text>

          <ScrollView contentContainerStyle={{ gap: theme.spacing.md }}>
            <Field label="Adopter name (≤100)" theme={t}>
              <TextInput
                value={adopterName}
                onChangeText={setAdopterName}
                maxLength={100}
                placeholder="e.g. Jane Doe"
                placeholderTextColor={t.colors.muted}
                style={inputStyle(t)}
              />
            </Field>
            <Field label="Adoption date" theme={t}>
              <TextInput
                value={adoptionDate}
                onChangeText={setAdoptionDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={t.colors.muted}
                style={inputStyle(t)}
              />
              {futureDate ? (
                <Text style={{ fontSize: 11, color: t.colors.danger }}>
                  Adoption date cannot be in the future.
                </Text>
              ) : null}
            </Field>
            <Field label="Internal notes (≤500)" theme={t}>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                maxLength={500}
                multiline
                numberOfLines={4}
                placeholder="Follow-up plan, home context, anything the team should see."
                placeholderTextColor={t.colors.muted}
                style={{ ...inputStyle(t), minHeight: 90, textAlignVertical: "top" }}
              />
            </Field>
            <Pressable
              onPress={() => mut.mutate()}
              disabled={!canSubmit}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 12,
                borderRadius: theme.radius.pill,
                backgroundColor: t.colors.primary,
                opacity: pressed ? 0.9 : canSubmit ? 1 : 0.5
              })}
            >
              {mut.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Check size={14} color="#FFFFFF" />
              )}
              <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                Mark adopted
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  theme: t,
  children
}: {
  label: string;
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: t.colors.ink }}>{label}</Text>
      {children}
    </View>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>) {
  return {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    color: t.colors.ink,
    fontSize: 14,
    backgroundColor: t.colors.background
  };
}

// ── Bulk action bar ────────────────────────────────────────────

const BULK_ALLOWED: Record<BulkActionVerb, ListingState[]> = {
  pause: ["published"],
  mark_adopted: ["published", "paused"],
  archive: ["published", "paused", "adopted"],
  delete: ["draft", "rejected"]
};

const BULK_LABEL: Record<BulkActionVerb, string> = {
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
  const t = useTheme();
  const qc = useQueryClient();
  const [verb, setVerb] = useState<BulkActionVerb | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (selectedIds.length === 0) return null;

  const selected = allPets.filter((p) => selectedIds.includes(p.id));
  const applicable = verb ? selected.filter((p) => BULK_ALLOWED[verb].includes(p.listingState)) : selected;
  const skippable = selected.length - applicable.length;

  const mut = useMutation({
    mutationFn: () => {
      if (!verb) throw new Error("Pick an action");
      if (applicable.length > 50) throw new Error("Max 50 per bulk action.");
      return bulkShelterAction(
        verb,
        applicable.map((p) => p.id)
      );
    },
    onSuccess: (results) => {
      const okCount = results.filter((r) => r.ok).length;
      const errCount = results.length - okCount;
      Alert.alert(
        "Bulk action complete",
        errCount === 0 ? `Applied to ${okCount} listings.` : `${okCount} succeeded, ${errCount} failed.`
      );
      qc.invalidateQueries({ queryKey: ["shelter-pets"] });
      setConfirming(false);
      setVerb(null);
      onDone();
    },
    onError: (e: Error) => Alert.alert("Bulk action failed", e.message)
  });

  return (
    <>
      <View
        style={{
          position: "absolute",
          left: theme.spacing.lg,
          right: theme.spacing.lg,
          bottom: theme.spacing.lg,
          padding: theme.spacing.md,
          borderRadius: theme.radius.lg,
          backgroundColor: t.colors.surface,
          borderWidth: 1,
          borderColor: t.colors.border,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.sm,
          ...theme.shadow.md
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "700", color: t.colors.ink }}>
          {selectedIds.length} selected
        </Text>
        <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {(Object.keys(BULK_LABEL) as BulkActionVerb[]).map((v) => {
            const on = verb === v;
            return (
              <Pressable
                key={v}
                onPress={() => setVerb(v)}
                style={({ pressed }) => ({
                  paddingHorizontal: 9,
                  paddingVertical: 5,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: on ? t.colors.primary : t.colors.border,
                  backgroundColor: on ? t.colors.primaryBg : "transparent",
                  opacity: pressed ? 0.8 : 1
                })}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: on ? t.colors.primary : t.colors.ink
                  }}
                >
                  {BULK_LABEL[v]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={() => setConfirming(true)}
          disabled={!verb || applicable.length === 0 || applicable.length > 50}
          style={({ pressed }) => ({
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: theme.radius.pill,
            backgroundColor: t.colors.primary,
            opacity: pressed ? 0.9 : !verb || applicable.length === 0 || applicable.length > 50 ? 0.5 : 1
          })}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>Apply</Text>
        </Pressable>
        <Pressable onPress={onClear} hitSlop={6}>
          <X size={16} color={t.colors.muted} />
        </Pressable>
      </View>

      {confirming && verb ? (
        <Modal transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: theme.spacing.xl }}>
            <View
              style={{
                width: "100%",
                maxWidth: 340,
                backgroundColor: t.colors.surface,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.xl,
                gap: theme.spacing.md
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: t.colors.ink }}>
                {BULK_LABEL[verb]} {applicable.length} listings?
              </Text>
              {applicable.length > 50 ? (
                <Text style={{ fontSize: 12, color: t.colors.danger }}>
                  Bulk actions are limited to 50 listings per operation.
                </Text>
              ) : (
                <Text style={{ fontSize: 12, color: t.colors.muted }}>
                  This applies to {applicable.length} listing
                  {applicable.length === 1 ? "" : "s"}.
                  {skippable > 0 ? ` (${skippable} skipped — wrong state for ${BULK_LABEL[verb]}.)` : ""}
                </Text>
              )}
              <View style={{ flexDirection: "row", gap: theme.spacing.sm, justifyContent: "flex-end" }}>
                <Pressable
                  onPress={() => setConfirming(false)}
                  disabled={mut.isPending}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: theme.radius.pill,
                    opacity: pressed ? 0.7 : 1
                  })}
                >
                  <Text style={{ color: t.colors.muted, fontWeight: "700" }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => mut.mutate()}
                  disabled={mut.isPending || applicable.length === 0 || applicable.length > 50}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: theme.radius.pill,
                    backgroundColor: verb === "delete" ? t.colors.danger : t.colors.primary,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    opacity: pressed ? 0.9 : 1
                  })}
                >
                  {mut.isPending ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <RotateCcw size={12} color="#FFFFFF" />
                  )}
                  <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Confirm</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}
