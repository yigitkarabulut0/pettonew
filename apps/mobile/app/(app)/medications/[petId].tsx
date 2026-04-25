import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  ArrowLeft,
  Check,
  Clock,
  Pill,
  Plus,
  Send,
  Trash2
} from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { LottieLoading } from "@/components/lottie-loading";
import {
  createMedication,
  deleteMedication,
  listMedications,
  markMedicationGiven,
  type MedicationDraft
} from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useLocalRefresh } from "@/lib/use-local-refresh";
import { useSessionStore } from "@/store/session";

const DOW_KEYS = [
  { idx: 1, labelKey: "medications.mon" },
  { idx: 2, labelKey: "medications.tue" },
  { idx: 3, labelKey: "medications.wed" },
  { idx: 4, labelKey: "medications.thu" },
  { idx: 5, labelKey: "medications.fri" },
  { idx: 6, labelKey: "medications.sat" },
  { idx: 0, labelKey: "medications.sun" }
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatHHMM(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function deviceTimezone(): string {
  // Resolves to e.g. "Europe/Istanbul" — required so the server cron knows
  // when the user means by "08:00".
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function relativeFromNow(iso: string | undefined, t: (k: string) => string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1) return t("medications.justNow");
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString();
}

export default function MedicationsPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const token = session?.tokens.accessToken ?? "";

  const [composerOpen, setComposerOpen] = useState(false);
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [notes, setNotes] = useState("");
  const [time, setTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [showPicker, setShowPicker] = useState(false);
  // Default to all 7 days. Order doesn't matter — server sanitises.
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  const medsQuery = useQuery({
    queryKey: ["medications", petId],
    queryFn: () => listMedications(token, petId!),
    enabled: Boolean(token && petId)
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const draft: MedicationDraft = {
        name: name.trim(),
        dosage: dosage.trim(),
        notes: notes.trim() || undefined,
        timeOfDay: formatHHMM(time),
        daysOfWeek: days,
        timezone: deviceTimezone(),
        startDate: todayISO()
      };
      return createMedication(token, petId!, draft);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["medications", petId] });
      setName("");
      setDosage("");
      setNotes("");
      setComposerOpen(false);
    }
  });

  const givenMutation = useMutation({
    mutationFn: (medId: string) => markMedicationGiven(token, petId!, medId),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["medications", petId] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (medId: string) => deleteMedication(token, petId!, medId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medications", petId] });
    }
  });

  const { refreshing, handleRefresh } = useLocalRefresh(
    useCallback(() => medsQuery.refetch(), [medsQuery])
  );

  const toggleDay = (idx: number) => {
    setDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort()
    );
    Haptics.selectionAsync();
  };

  const confirmDelete = (medId: string, name: string) => {
    Alert.alert(
      t("medications.deleteConfirmTitle"),
      t("medications.deleteConfirmBody", { name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteMutation.mutate(medId)
        }
      ]
    );
  };

  const canSave = name.trim().length > 0 && days.length > 0;
  const meds = medsQuery.data ?? [];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.lg,
          paddingHorizontal: mobileTheme.spacing.xl,
          backgroundColor: theme.colors.white,
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border
        }}
      >
        <Pressable
          onPress={() => router.back()}
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
          <ArrowLeft size={18} color={theme.colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: mobileTheme.typography.subheading.fontSize,
              fontWeight: mobileTheme.typography.subheading.fontWeight,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            {t("medications.title")}
          </Text>
        </View>
        <Pressable
          onPress={() => setComposerOpen(!composerOpen)}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.colors.primaryBg,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Plus size={18} color={theme.colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingTop: mobileTheme.spacing.xl,
          paddingBottom: insets.bottom + 24
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* Composer */}
        {composerOpen && (
          <View
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              padding: mobileTheme.spacing.xl,
              marginBottom: mobileTheme.spacing.xl,
              gap: mobileTheme.spacing.lg,
              ...mobileTheme.shadow.sm
            }}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {t("medications.newMedication")}
            </Text>

            {/* Name */}
            <FormField label={t("medications.name")} theme={theme}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t("medications.namePlaceholder")}
                placeholderTextColor={theme.colors.muted}
                style={inputStyle(theme)}
              />
            </FormField>

            {/* Dosage */}
            <FormField label={t("medications.dosage")} theme={theme}>
              <TextInput
                value={dosage}
                onChangeText={setDosage}
                placeholder={t("medications.dosagePlaceholder")}
                placeholderTextColor={theme.colors.muted}
                style={inputStyle(theme)}
              />
            </FormField>

            {/* Time picker */}
            <FormField label={t("medications.time")} theme={theme}>
              <Pressable
                onPress={() => setShowPicker(true)}
                style={{
                  ...inputStyle(theme),
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8
                }}
              >
                <Clock size={16} color={theme.colors.primary} />
                <Text
                  style={{
                    fontSize: mobileTheme.typography.body.fontSize,
                    color: theme.colors.ink,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  {formatHHMM(time)}
                </Text>
              </Pressable>
              {showPicker && (
                <DateTimePicker
                  value={time}
                  mode="time"
                  is24Hour
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, d) => {
                    if (Platform.OS !== "ios") setShowPicker(false);
                    if (d) setTime(d);
                  }}
                />
              )}
              {Platform.OS === "ios" && showPicker && (
                <Pressable
                  onPress={() => setShowPicker(false)}
                  style={{
                    alignSelf: "flex-end",
                    paddingVertical: 6,
                    paddingHorizontal: 12
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.primary,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: mobileTheme.typography.caption.fontSize
                    }}
                  >
                    {t("common.done")}
                  </Text>
                </Pressable>
              )}
            </FormField>

            {/* Days */}
            <FormField label={t("medications.repeatOn")} theme={theme}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {DOW_KEYS.map((d) => {
                  const sel = days.includes(d.idx);
                  return (
                    <Pressable
                      key={d.idx}
                      onPress={() => toggleDay(d.idx)}
                      style={{
                        flex: 1,
                        height: 36,
                        borderRadius: mobileTheme.radius.md,
                        backgroundColor: sel
                          ? theme.colors.primary
                          : theme.colors.background,
                        borderWidth: 1,
                        borderColor: sel
                          ? theme.colors.primary
                          : theme.colors.border,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: sel ? "#FFFFFF" : theme.colors.muted,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {t(d.labelKey)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </FormField>

            {/* Notes */}
            <FormField label={t("medications.notes")} theme={theme}>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder={t("medications.notesPlaceholder")}
                placeholderTextColor={theme.colors.muted}
                multiline
                style={{
                  ...inputStyle(theme),
                  minHeight: 64,
                  textAlignVertical: "top"
                }}
              />
            </FormField>

            <Pressable
              onPress={() => createMutation.mutate()}
              disabled={!canSave || createMutation.isPending}
              style={{
                backgroundColor: canSave
                  ? theme.colors.primary
                  : theme.colors.border,
                borderRadius: mobileTheme.radius.md,
                paddingVertical: mobileTheme.spacing.md,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: mobileTheme.spacing.sm
              }}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Send size={16} color="#FFFFFF" />
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontWeight: "600",
                      fontSize: mobileTheme.typography.body.fontSize,
                      fontFamily: "Inter_600SemiBold"
                    }}
                  >
                    {t("medications.save")}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {medsQuery.isLoading ? (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <LottieLoading size={70} />
          </View>
        ) : meds.length === 0 ? (
          <View
            style={{
              paddingVertical: mobileTheme.spacing["4xl"],
              alignItems: "center",
              gap: mobileTheme.spacing.lg
            }}
          >
            <Pill size={48} color={theme.colors.muted} />
            <Text
              style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                fontWeight: mobileTheme.typography.subheading.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {t("medications.empty")}
            </Text>
            <Text
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_400Regular",
                textAlign: "center",
                paddingHorizontal: mobileTheme.spacing["3xl"]
              }}
            >
              {t("medications.emptyDescription")}
            </Text>
          </View>
        ) : (
          <View style={{ gap: mobileTheme.spacing.md }}>
            {meds.map((med) => {
              const lastGiven = relativeFromNow(med.lastGivenAt, t);
              return (
                <View
                  key={med.id}
                  style={{
                    backgroundColor: theme.colors.white,
                    borderRadius: mobileTheme.radius.lg,
                    padding: mobileTheme.spacing.lg,
                    gap: mobileTheme.spacing.sm,
                    ...mobileTheme.shadow.sm
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: mobileTheme.spacing.sm
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                          fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                          color: theme.colors.ink,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {med.name}
                      </Text>
                      {med.dosage ? (
                        <Text
                          style={{
                            fontSize: mobileTheme.typography.caption.fontSize,
                            color: theme.colors.muted,
                            fontFamily: "Inter_500Medium"
                          }}
                        >
                          {med.dosage}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => confirmDelete(med.id, med.name)}
                      hitSlop={8}
                    >
                      <Trash2 size={16} color={theme.colors.muted} />
                    </Pressable>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap"
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: mobileTheme.radius.pill,
                        backgroundColor: theme.colors.primaryBg
                      }}
                    >
                      <Clock size={12} color={theme.colors.primary} />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: theme.colors.primary,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {med.timeOfDay}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 11,
                        color: theme.colors.muted,
                        fontFamily: "Inter_500Medium"
                      }}
                    >
                      {summariseDays(med.daysOfWeek, t)}
                    </Text>
                  </View>

                  {med.notes ? (
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.caption.fontSize,
                        color: theme.colors.muted,
                        fontFamily: "Inter_400Regular",
                        lineHeight: 18
                      }}
                    >
                      {med.notes}
                    </Text>
                  ) : null}

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 4
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        color: theme.colors.muted,
                        fontFamily: "Inter_400Regular"
                      }}
                    >
                      {lastGiven
                        ? t("medications.lastGiven", { when: lastGiven })
                        : t("medications.neverGiven")}
                    </Text>
                    <Pressable
                      onPress={() => givenMutation.mutate(med.id)}
                      disabled={givenMutation.isPending}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: mobileTheme.radius.md,
                        backgroundColor: theme.colors.successBg,
                        borderWidth: 1,
                        borderColor: theme.colors.success + "44"
                      }}
                    >
                      <Check size={14} color={theme.colors.success} />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: theme.colors.success,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {t("medications.markGiven")}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function inputStyle(theme: ReturnType<typeof useTheme>) {
  return {
    backgroundColor: theme.colors.background,
    borderRadius: mobileTheme.radius.md,
    paddingHorizontal: mobileTheme.spacing.lg,
    paddingVertical: 12,
    fontSize: mobileTheme.typography.body.fontSize,
    color: theme.colors.ink,
    fontFamily: "Inter_400Regular"
  };
}

function FormField({
  label,
  children,
  theme
}: {
  label: string;
  children: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ gap: mobileTheme.spacing.sm }}>
      <Text
        style={{
          fontSize: mobileTheme.typography.caption.fontSize,
          color: theme.colors.muted,
          fontFamily: "Inter_500Medium"
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function summariseDays(days: number[], t: (k: string) => string): string {
  if (!days || days.length === 0 || days.length === 7) return t("medications.everyDay");
  const weekdays = [1, 2, 3, 4, 5];
  const weekend = [0, 6];
  const sorted = [...days].sort();
  const matches = (a: number[], b: number[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);
  if (matches(sorted, weekdays)) return t("medications.weekdays");
  if (matches(sorted, weekend)) return t("medications.weekends");
  const labels = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return sorted.map((d) => t(`medications.short_${labels[d]}`)).join(" · ");
}
