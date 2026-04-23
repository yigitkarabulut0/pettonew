import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { useTranslation } from "react-i18next";
import type { Pet, Playdate } from "@petto/contracts";
import { DraggableSheet } from "@/components/draggable-sheet";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Clock,
  MapPin,
  PawPrint,
  Plus,
  X
} from "lucide-react-native";

import {
  joinPlaydate,
  listMyPets,
  updateAttendeePets
} from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

type JoinPlaydateModalProps = {
  visible: boolean;
  onClose: () => void;
  playdate: Playdate | null | undefined;
  /** "join" = first-time flow (select → confirm). "edit" = post-join pet editing. */
  mode?: "join" | "edit";
  onJoined?: (res: { joined: boolean; waitlisted: boolean }) => void;
  onEdited?: () => void;
};

type Step = "select" | "confirm";

export function JoinPlaydateModal({
  visible,
  onClose,
  playdate,
  mode = "join",
  onJoined,
  onEdited
}: JoinPlaydateModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const token = session?.tokens.accessToken ?? "";
  const isEdit = mode === "edit";

  const [step, setStep] = useState<Step>("select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const petsQuery = useQuery({
    queryKey: ["my-pets"],
    queryFn: () => listMyPets(token),
    enabled: Boolean(token && visible)
  });
  const pets = useMemo(
    () => (petsQuery.data ?? []).filter((p) => !p.isHidden),
    [petsQuery.data]
  );

  // Hydrate state whenever the modal opens.
  useEffect(() => {
    if (!visible) return;
    setStep("select");
    setNote("");
    if (isEdit && playdate?.myPetIds?.length) {
      setSelectedIds(playdate.myPetIds);
    } else {
      setSelectedIds([]);
    }
  }, [visible, isEdit, playdate?.myPetIds]);

  const slotsUsed = playdate?.slotsUsed ?? 0;
  const maxPets = playdate?.maxPets ?? 0;
  const capacityRemaining =
    maxPets > 0 ? Math.max(0, maxPets - slotsUsed) : Infinity;

  const togglePet = (petId: string) => {
    setSelectedIds((prev) =>
      prev.includes(petId) ? prev.filter((id) => id !== petId) : [...prev, petId]
    );
  };

  const joinMutation = useMutation({
    mutationFn: () =>
      joinPlaydate(token, playdate!.id, {
        petIds: selectedIds,
        note: note.trim() || undefined
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["playdates"] });
      queryClient.invalidateQueries({ queryKey: ["my-playdates"] });
      if (playdate) {
        queryClient.invalidateQueries({
          queryKey: ["playdate-detail", playdate.id]
        });
      }
      onJoined?.(res);
      onClose();
    }
  });

  const editMutation = useMutation({
    mutationFn: () => updateAttendeePets(token, playdate!.id, selectedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playdates"] });
      queryClient.invalidateQueries({ queryKey: ["my-playdates"] });
      if (playdate) {
        queryClient.invalidateQueries({
          queryKey: ["playdate-detail", playdate.id]
        });
      }
      onEdited?.();
      onClose();
    },
    onError: (err: any) => {
      Alert.alert(
        t("playdates.detail.editFailedTitle") as string,
        err?.message ?? (t("playdates.detail.editFailedBody") as string)
      );
    }
  });

  const activeMutation = isEdit ? editMutation : joinMutation;
  const busy = activeMutation.isPending;

  const handleContinue = () => {
    if (selectedIds.length === 0) return;
    setStep("confirm");
  };

  const handleSubmit = () => {
    if (!playdate || selectedIds.length === 0) return;
    activeMutation.mutate();
  };

  const addingCount = isEdit
    ? selectedIds.filter((id) => !(playdate?.myPetIds ?? []).includes(id)).length
    : selectedIds.length;

  const exceedsCapacity =
    maxPets > 0 && addingCount > capacityRemaining && !isEdit;
  const willWaitlist = exceedsCapacity;

  const when = playdate?.date ? new Date(playdate.date) : null;
  const formattedDate =
    when && !isNaN(when.getTime())
      ? when.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short"
        })
      : "";
  const formattedTime =
    when && !isNaN(when.getTime())
      ? when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : "";

  const headerLabel = isEdit
    ? (t("playdates.detail.editPetsTitle") as string)
    : (t("playdates.detail.selectPetsTitle") as string);

  const confirmLabel = isEdit
    ? (t("playdates.detail.saveChanges") as string)
    : willWaitlist
    ? (t("playdates.detail.joinWaitlist") as string)
    : (t("playdates.detail.confirmJoin") as string);

  return (
    <DraggableSheet
      visible={visible}
      onClose={onClose}
      initialSnap="large"
      snapPoints={{ medium: 0.7, large: 0.95 }}
    >
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: 4 }}>
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 22,
              marginBottom: 10
            }}
          >
            {step === "confirm" ? (
              <Pressable
                onPress={() => setStep("select")}
                hitSlop={10}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: theme.colors.background,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <ChevronLeft size={18} color={theme.colors.ink} strokeWidth={2.4} />
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 19,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {step === "select"
                  ? headerLabel
                  : (t("playdates.detail.confirmJoinTitle") as string)}
              </Text>
              {step === "select" ? (
                <Text
                  style={{
                    marginTop: 2,
                    fontSize: 12,
                    color: theme.colors.muted,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  {isEdit
                    ? t("playdates.detail.editPetsHint")
                    : t("playdates.detail.selectPetsHint")}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: theme.colors.background,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <X size={18} color={theme.colors.muted} />
            </Pressable>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            {step === "select" ? (
              <SelectStep
                pets={pets}
                selectedIds={selectedIds}
                onToggle={togglePet}
                loading={petsQuery.isLoading}
                onAddPet={() => {
                  onClose();
                  router.push("/onboarding/pets" as any);
                }}
              />
            ) : (
              <ConfirmStep
                pets={pets.filter((p) => selectedIds.includes(p.id))}
                playdate={playdate}
                formattedDate={formattedDate}
                formattedTime={formattedTime}
                note={note}
                onNoteChange={setNote}
                willWaitlist={willWaitlist}
                isEdit={isEdit}
              />
            )}
          </KeyboardAvoidingView>

          {/* Footer CTA */}
          <View style={{ paddingHorizontal: 22, paddingTop: 10 }}>
            {step === "select" ? (
              <Pressable
                onPress={handleContinue}
                disabled={selectedIds.length === 0 || petsQuery.isLoading}
                style={({ pressed }) => ({
                  paddingVertical: 15,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor:
                    selectedIds.length > 0
                      ? theme.colors.primary
                      : theme.colors.border,
                  alignItems: "center",
                  opacity: pressed ? 0.88 : 1,
                  ...mobileTheme.shadow.sm
                })}
              >
                <Text
                  style={{
                    color:
                      selectedIds.length > 0
                        ? theme.colors.white
                        : theme.colors.muted,
                    fontSize: 15,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {selectedIds.length === 0
                    ? t("playdates.detail.selectAtLeastOne")
                    : t("playdates.detail.continueWithCount", {
                        count: selectedIds.length
                      })}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleSubmit}
                disabled={busy || selectedIds.length === 0}
                style={({ pressed }) => ({
                  paddingVertical: 15,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: theme.colors.primary,
                  alignItems: "center",
                  opacity: pressed ? 0.88 : 1,
                  ...mobileTheme.shadow.sm
                })}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text
                    style={{
                      color: theme.colors.white,
                      fontSize: 15,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    {confirmLabel}
                  </Text>
                )}
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </DraggableSheet>
  );
}

// ── Step 1: Select pets ──────────────────────────────────────────────
function SelectStep({
  pets,
  selectedIds,
  onToggle,
  loading,
  onAddPet
}: {
  pets: Pet[];
  selectedIds: string[];
  onToggle: (petId: string) => void;
  loading: boolean;
  onAddPet: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (loading) {
    return (
      <View style={{ paddingVertical: 40, alignItems: "center" }}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
  }

  if (pets.length === 0) {
    return (
      <View
        style={{
          paddingHorizontal: 22,
          paddingVertical: 30,
          alignItems: "center",
          gap: 14
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: theme.colors.primaryBg,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <PawPrint size={30} color={theme.colors.primary} />
        </View>
        <Text
          style={{
            fontSize: 16,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold",
            textAlign: "center"
          }}
        >
          {t("playdates.detail.noPetsTitle")}
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: theme.colors.muted,
            fontFamily: "Inter_500Medium",
            textAlign: "center",
            lineHeight: 19,
            paddingHorizontal: 20
          }}
        >
          {t("playdates.detail.noPetsBody")}
        </Text>
        <Pressable
          onPress={onAddPet}
          style={({ pressed }) => ({
            marginTop: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: mobileTheme.radius.pill,
            backgroundColor: theme.colors.primary,
            opacity: pressed ? 0.88 : 1,
            ...mobileTheme.shadow.sm
          })}
        >
          <Plus size={15} color={theme.colors.white} strokeWidth={2.6} />
          <Text
            style={{
              color: theme.colors.white,
              fontSize: 14,
              fontFamily: "Inter_700Bold"
            }}
          >
            {t("playdates.detail.addPet")}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ maxHeight: 420 }}
      contentContainerStyle={{
        paddingHorizontal: 22,
        paddingBottom: 8,
        gap: 10
      }}
      showsVerticalScrollIndicator={false}
    >
      {pets.map((pet) => {
        const selected = selectedIds.includes(pet.id);
        const photo = pet.photos?.[0]?.url;
        return (
          <Pressable
            key={pet.id}
            onPress={() => onToggle(pet.id)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: selected
                ? theme.colors.primaryBg
                : theme.colors.background,
              borderWidth: 2,
              borderColor: selected ? theme.colors.primary : "transparent",
              opacity: pressed ? 0.92 : 1
            })}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                overflow: "hidden",
                backgroundColor: theme.colors.primaryBg,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {photo ? (
                <Image
                  source={{ uri: photo }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                  transition={250}
                />
              ) : (
                <PawPrint size={22} color={theme.colors.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {pet.name}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium"
                }}
                numberOfLines={1}
              >
                {pet.breedLabel || pet.speciesLabel || " "}
              </Text>
            </View>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                borderWidth: 2,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                backgroundColor: selected ? theme.colors.primary : "transparent",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {selected ? (
                <Check size={14} color={theme.colors.white} strokeWidth={3} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Step 2: Confirm ──────────────────────────────────────────────────
function ConfirmStep({
  pets,
  playdate,
  formattedDate,
  formattedTime,
  note,
  onNoteChange,
  willWaitlist,
  isEdit
}: {
  pets: Pet[];
  playdate: Playdate | null | undefined;
  formattedDate: string;
  formattedTime: string;
  note: string;
  onNoteChange: (txt: string) => void;
  willWaitlist: boolean;
  isEdit: boolean;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <ScrollView
      style={{ maxHeight: 460 }}
      contentContainerStyle={{
        paddingHorizontal: 22,
        paddingBottom: 10,
        gap: 16
      }}
      showsVerticalScrollIndicator={false}
    >
      {willWaitlist ? (
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: mobileTheme.radius.md,
            backgroundColor: theme.colors.accent + "22"
          }}
        >
          <Text
            style={{
              color: theme.colors.accent,
              fontSize: 13,
              fontFamily: "Inter_700Bold"
            }}
          >
            {t("playdates.detail.waitlistNoticeTitle")}
          </Text>
          <Text
            style={{
              marginTop: 4,
              color: theme.colors.ink,
              fontSize: 12,
              lineHeight: 17,
              fontFamily: "Inter_500Medium"
            }}
          >
            {t("playdates.detail.waitlistNoticeBody")}
          </Text>
        </View>
      ) : null}

      {/* Pet summary */}
      <View>
        <SummaryLabel theme={theme} text={t("playdates.detail.yourPets") as string} />
        <View
          style={{
            padding: 14,
            borderRadius: mobileTheme.radius.lg,
            backgroundColor: theme.colors.background,
            gap: 10
          }}
        >
          {pets.map((pet) => {
            const photo = pet.photos?.[0]?.url;
            return (
              <View
                key={pet.id}
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    overflow: "hidden",
                    backgroundColor: theme.colors.primaryBg,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {photo ? (
                    <Image
                      source={{ uri: photo }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                    />
                  ) : (
                    <PawPrint size={16} color={theme.colors.primary} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      color: theme.colors.ink,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    {pet.name}
                  </Text>
                  {pet.breedLabel ? (
                    <Text
                      style={{
                        fontSize: 11,
                        color: theme.colors.muted,
                        fontFamily: "Inter_500Medium"
                      }}
                      numberOfLines={1}
                    >
                      {pet.breedLabel}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Playdate summary */}
      <View>
        <SummaryLabel theme={theme} text={t("playdates.detail.playdateSummary") as string} />
        <View
          style={{
            padding: 14,
            borderRadius: mobileTheme.radius.lg,
            backgroundColor: theme.colors.background,
            gap: 10
          }}
        >
          <SummaryRow
            icon={<CalendarDays size={14} color={theme.colors.primary} />}
            label={formattedDate || t("playdates.detail.noDate")}
          />
          <SummaryRow
            icon={<Clock size={14} color={theme.colors.primary} />}
            label={formattedTime || "—"}
          />
          <SummaryRow
            icon={<MapPin size={14} color={theme.colors.secondary} />}
            label={
              playdate?.cityLabel ||
              playdate?.location ||
              (t("playdates.detail.noLocation") as string)
            }
          />
        </View>
      </View>

      {/* Optional note (join only) */}
      {!isEdit ? (
        <View>
          <SummaryLabel theme={theme} text={t("playdates.detail.noteLabel") as string} />
          <TextInput
            value={note}
            onChangeText={onNoteChange}
            placeholder={t("playdates.detail.notePlaceholder") as string}
            placeholderTextColor={theme.colors.muted}
            multiline
            maxLength={280}
            style={{
              backgroundColor: theme.colors.background,
              borderRadius: mobileTheme.radius.md,
              paddingHorizontal: 14,
              paddingVertical: 14,
              minHeight: 80,
              fontSize: 14,
              color: theme.colors.ink,
              fontFamily: "Inter_500Medium",
              textAlignVertical: "top"
            }}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function SummaryLabel({
  theme,
  text
}: {
  theme: ReturnType<typeof useTheme>;
  text: string;
}) {
  return (
    <Text
      style={{
        fontSize: 11,
        letterSpacing: 1,
        color: theme.colors.muted,
        fontFamily: "Inter_700Bold",
        textTransform: "uppercase",
        marginBottom: 8
      }}
    >
      {text}
    </Text>
  );
}

function SummaryRow({
  icon,
  label
}: {
  icon: React.ReactNode;
  label: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: theme.colors.surface,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {icon}
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          color: theme.colors.ink,
          fontFamily: "Inter_500Medium"
        }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}
