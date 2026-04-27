import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
  CheckCircle2,
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
  listMedicationDosesByPet,
  listMedications,
  markMedicationGiven,
  type MedicationDraft
} from "@/lib/api";
import type { MedicationDose, PetMedication } from "@petto/contracts";
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

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Apple-Style date strip layout constants. Centralized so any tweak (gap
// or bubble width) keeps the auto-scroll math in lockstep.
const BUBBLE_W = 56;
const BUBBLE_GAP = 8;
const STRIP_PAD_H = 20; // matches mobileTheme.spacing.xl

// Whether this medication is "applicable" on a given calendar date —
// active + within start/end + day-of-week match. Drives the per-day
// list filtering on the strip-bound view.
function isMedApplicableOn(med: PetMedication, date: Date): boolean {
  if (!med.active) return false;
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (med.startDate && dateKey < med.startDate) return false;
  if (med.endDate && dateKey > med.endDate) return false;
  if (!med.daysOfWeek || med.daysOfWeek.length === 0) return true;
  return med.daysOfWeek.includes(date.getDay());
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

  // v0.14.4 — Apple-style date strip. selectedDate is always at midnight
  // (local) so day comparisons are exact. The strip renders 14 days back,
  // today, and 7 days forward; we auto-scroll to today on mount.
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const stripScrollRef = useRef<ScrollView>(null);
  const stripDates = useMemo(() => {
    const today = startOfDay(new Date());
    const out: Date[] = [];
    for (let i = -14; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      out.push(d);
    }
    return out;
  }, []);

  const medsQuery = useQuery({
    queryKey: ["medications", petId],
    queryFn: () => listMedications(token, petId!),
    enabled: Boolean(token && petId)
  });

  // Aggregate dose history for the strip's window. We fetch a fixed
  // 30-day window (today-21 → today+8) so the strip + a bit of buffer is
  // always covered without paging. Cache key is bound to the petId so
  // tabs back and forth don't refetch.
  const dosesRangeFrom = useMemo(() => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - 21);
    return d.toISOString();
  }, []);
  const dosesRangeTo = useMemo(() => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() + 8);
    return d.toISOString();
  }, []);
  const dosesQuery = useQuery({
    queryKey: ["medication-doses-by-pet", petId, dosesRangeFrom, dosesRangeTo],
    queryFn: () =>
      listMedicationDosesByPet(token, petId!, dosesRangeFrom, dosesRangeTo),
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
    onMutate: () => {
      // Two haptics: one immediate "tap registered", one on success below.
      // Mirrors how iOS native UIs feel — the first reassures the user
      // their tap was heard, the second confirms the work succeeded.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["medications", petId] });
      // Refresh the per-pet dose aggregate so the strip indicator + the
      // selected day's "given" status update without a manual refresh.
      queryClient.invalidateQueries({ queryKey: ["medication-doses-by-pet"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (medId: string) => deleteMedication(token, petId!, medId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medications", petId] });
    }
  });

  const { refreshing, handleRefresh } = useLocalRefresh(
    useCallback(async () => {
      await Promise.all([medsQuery.refetch(), dosesQuery.refetch()]);
    }, [medsQuery, dosesQuery])
  );

  // Auto-scroll the strip to today on first paint. We rely on layout
  // having stabilised (small timeout) — without it, the ScrollView's
  // contentSize is sometimes still 0 when contentOffset is set.
  useEffect(() => {
    const todayIdx = stripDates.findIndex((d: Date) =>
      isSameDay(d, startOfDay(new Date()))
    );
    if (todayIdx < 0) return;
    const offset = todayIdx * (BUBBLE_W + BUBBLE_GAP) - 96;
    const id = setTimeout(() => {
      stripScrollRef.current?.scrollTo({ x: Math.max(0, offset), animated: false });
    }, 50);
    return () => clearTimeout(id);
  }, [stripDates]);

  // Doses for the currently-selected day, indexed by medication id for
  // O(1) lookup inside the per-medication card render.
  const dosesByMedForSelectedDay = useMemo(() => {
    const map = new Map<string, MedicationDose[]>();
    for (const dose of dosesQuery.data ?? []) {
      const dt = new Date(dose.givenAt);
      if (Number.isNaN(dt.getTime())) continue;
      if (!isSameDay(dt, selectedDate)) continue;
      const list = map.get(dose.medicationId) ?? [];
      list.push(dose);
      map.set(dose.medicationId, list);
    }
    return map;
  }, [dosesQuery.data, selectedDate]);

  // Per-day "compliance" indicator on the strip: for each strip date,
  // count applicable meds vs given meds. Only meaningful for past +
  // today; future days will read 0/N.
  const stripCompliance = useMemo(() => {
    const meds = medsQuery.data ?? [];
    const doses = dosesQuery.data ?? [];
    const map = new Map<string, { applicable: number; given: number }>();
    for (const date of stripDates) {
      const key = date.toDateString();
      const applicable = meds.filter((m) => isMedApplicableOn(m, date));
      const givenIds = new Set<string>();
      for (const d of doses) {
        const dt = new Date(d.givenAt);
        if (!Number.isNaN(dt.getTime()) && isSameDay(dt, date)) {
          givenIds.add(d.medicationId);
        }
      }
      const givenForApplicable = applicable.filter((m) => givenIds.has(m.id)).length;
      map.set(key, { applicable: applicable.length, given: givenForApplicable });
    }
    return map;
  }, [medsQuery.data, dosesQuery.data, stripDates]);

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
          <>
            {/* ── Apple-style horizontal date strip ─────────────────── */}
            <ScrollView
              ref={stripScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: STRIP_PAD_H,
                paddingVertical: 4,
                gap: BUBBLE_GAP
              }}
              style={{
                marginHorizontal: -mobileTheme.spacing.xl,
                marginBottom: mobileTheme.spacing.lg
              }}
            >
              {stripDates.map((date: Date) => {
                const isSelected = isSameDay(date, selectedDate);
                const isToday = isSameDay(date, startOfDay(new Date()));
                const compliance = stripCompliance.get(date.toDateString());
                const isPastOrToday = date.getTime() <= startOfDay(new Date()).getTime();
                let indicatorColor = "transparent";
                if (compliance && compliance.applicable > 0 && isPastOrToday) {
                  indicatorColor =
                    compliance.given >= compliance.applicable
                      ? theme.colors.success
                      : compliance.given > 0
                        ? theme.colors.starGold
                        : theme.colors.danger + "55";
                }
                return (
                  <Pressable
                    key={date.toISOString()}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedDate(date);
                    }}
                    style={{
                      width: BUBBLE_W,
                      paddingVertical: 10,
                      borderRadius: 14,
                      backgroundColor: isSelected
                        ? theme.colors.primary
                        : theme.colors.white,
                      borderWidth: isSelected ? 0 : isToday ? 1.5 : 1,
                      borderColor: isToday
                        ? theme.colors.primary
                        : theme.colors.border,
                      alignItems: "center",
                      gap: 2,
                      ...mobileTheme.shadow.sm
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontFamily: "Inter_700Bold",
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        color: isSelected
                          ? "rgba(255,255,255,0.85)"
                          : theme.colors.muted
                      }}
                    >
                      {date.toLocaleDateString([], { weekday: "short" })}
                    </Text>
                    <Text
                      style={{
                        fontSize: 22,
                        fontFamily: "Inter_700Bold",
                        color: isSelected
                          ? "#FFFFFF"
                          : isToday
                            ? theme.colors.primary
                            : theme.colors.ink
                      }}
                    >
                      {date.getDate()}
                    </Text>
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        marginTop: 2,
                        backgroundColor: indicatorColor
                      }}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Selected day header */}
            {(() => {
              const today = startOfDay(new Date());
              const yesterday = new Date(today);
              yesterday.setDate(yesterday.getDate() - 1);
              const headerLabel = isSameDay(selectedDate, today)
                ? t("medications.today")
                : isSameDay(selectedDate, yesterday)
                  ? t("medications.yesterday")
                  : selectedDate.toLocaleDateString([], {
                      weekday: "long",
                      day: "numeric",
                      month: "long"
                    });
              const applicableMeds = meds.filter((m) =>
                isMedApplicableOn(m, selectedDate)
              );
              const givenCount = applicableMeds.filter((m) =>
                (dosesByMedForSelectedDay.get(m.id) ?? []).length > 0
              ).length;
              return (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: mobileTheme.spacing.md
                  }}
                >
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.subheading.fontSize,
                      fontWeight: "700",
                      color: theme.colors.ink,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    {headerLabel}
                  </Text>
                  {applicableMeds.length > 0 ? (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: mobileTheme.radius.pill,
                        backgroundColor:
                          givenCount === applicableMeds.length
                            ? theme.colors.successBg
                            : theme.colors.background
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: "Inter_700Bold",
                          color:
                            givenCount === applicableMeds.length
                              ? theme.colors.success
                              : theme.colors.muted
                        }}
                      >
                        {givenCount} / {applicableMeds.length} {t("medications.givenCountSuffix")}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })()}

            {/* Per-day medication list */}
            {(() => {
              const today = startOfDay(new Date());
              const isPast = selectedDate.getTime() < today.getTime();
              const isFuture = selectedDate.getTime() > today.getTime();
              const isToday = isSameDay(selectedDate, today);
              const applicableMeds = meds.filter((m) =>
                isMedApplicableOn(m, selectedDate)
              );
              if (applicableMeds.length === 0) {
                return (
                  <View
                    style={{
                      paddingVertical: mobileTheme.spacing["3xl"],
                      alignItems: "center",
                      gap: mobileTheme.spacing.md
                    }}
                  >
                    <Pill size={36} color={theme.colors.muted} />
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.body.fontSize,
                        color: theme.colors.muted,
                        fontFamily: "Inter_400Regular",
                        textAlign: "center",
                        paddingHorizontal: mobileTheme.spacing["3xl"]
                      }}
                    >
                      {isPast
                        ? t("medications.noneOnPast")
                        : isFuture
                          ? t("medications.noneOnFuture")
                          : t("medications.noneOnToday")}
                    </Text>
                  </View>
                );
              }
              return (
                <View style={{ gap: mobileTheme.spacing.md }}>
                  {applicableMeds.map((med) => (
                    <MedicationCard
                      key={med.id}
                      med={med}
                      dosesForDay={dosesByMedForSelectedDay.get(med.id) ?? []}
                      isToday={isToday}
                      isPast={isPast}
                      isFuture={isFuture}
                      onMarkGiven={() => givenMutation.mutate(med.id)}
                      onDelete={() => confirmDelete(med.id, med.name)}
                      isGivingPending={
                        givenMutation.isPending && givenMutation.variables === med.id
                      }
                      t={t}
                      theme={theme}
                    />
                  ))}
                </View>
              );
            })()}
          </>
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

// Helper: was the medication given today (in the device's local day).
function wasGivenToday(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// ── MedicationCard ─────────────────────────────────────────────────
//
// One row in the medication list. v0.14.3 upgrades:
//   • A dedicated "given today" visual state — green-tinted card, success
//     icon, "Given at HH:MM" line. Idle state stays cream/white.
//   • Tap-to-mark animation: the whole card briefly scales (0.97) and
//     a green flash overlay fades in/out on success. Combined with two
//     haptics (impact on tap, success on resolve) the action feels
//     responsive even on slow networks.
//   • A dedicated "History" button next to the action — opens a sheet
//     showing the full timeline of given doses.
function MedicationCard({
  med,
  dosesForDay,
  isToday,
  isPast,
  isFuture,
  onMarkGiven,
  onDelete,
  isGivingPending,
  t,
  theme
}: {
  med: PetMedication;
  dosesForDay: MedicationDose[];
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  onMarkGiven: () => void;
  onDelete: () => void;
  isGivingPending: boolean;
  t: (k: string, opts?: any) => string;
  theme: ReturnType<typeof useTheme>;
}) {
  // Newest dose for the selected day (the strip's selectedDate). For
  // past/today this means "did the user actually give it"; for future it
  // is always [].
  const lastDose = dosesForDay[0];
  const givenOnDay = Boolean(lastDose);
  const givenAtTime = lastDose
    ? new Date(lastDose.givenAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    : null;

  // Press-to-scale animation. Each tap shrinks the card slightly so the
  // user feels the touch even before the network responds.
  const scale = useRef(new Animated.Value(1)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const [justGiven, setJustGiven] = useState(false);

  // When isGivingPending flips from true to false (mutation resolved),
  // play a quick green-flash overlay so success is unmistakable.
  const wasPendingRef = useRef(false);
  useEffect(() => {
    if (wasPendingRef.current && !isGivingPending) {
      // Mutation just resolved.
      setJustGiven(true);
      Animated.sequence([
        Animated.timing(flash, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true
        }),
        Animated.timing(flash, {
          toValue: 0,
          duration: 420,
          useNativeDriver: true
        })
      ]).start(() => setJustGiven(false));
    }
    wasPendingRef.current = isGivingPending;
  }, [isGivingPending, flash]);

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      friction: 5,
      tension: 200
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
      tension: 200
    }).start();
  };

  return (
    <Animated.View
      style={{
        transform: [{ scale }],
        backgroundColor: givenOnDay
          ? theme.colors.successBg
          : isPast
            ? theme.colors.background
            : theme.colors.white,
        borderRadius: mobileTheme.radius.lg,
        borderWidth: givenOnDay ? 1.5 : 0,
        borderColor: givenOnDay ? theme.colors.success + "55" : "transparent",
        ...mobileTheme.shadow.sm,
        overflow: "hidden"
      }}
    >
      <View style={{ padding: mobileTheme.spacing.lg, gap: mobileTheme.spacing.sm }}>
        {/* Title row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: mobileTheme.spacing.sm
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: givenOnDay
                ? theme.colors.success + "22"
                : theme.colors.primaryBg,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {givenOnDay ? (
              <CheckCircle2 size={18} color={theme.colors.success} />
            ) : (
              <Pill size={18} color={theme.colors.primary} />
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                fontWeight: "700",
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
          {/* Delete only on today's view to keep past/future rows tidy. */}
          {isToday ? (
            <Pressable onPress={onDelete} hitSlop={8}>
              <Trash2 size={16} color={theme.colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Schedule line — time pill */}
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
          {dosesForDay.length > 1 ? (
            <Text
              style={{
                fontSize: 11,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}
            >
              {t("medications.dosesGivenCount", { count: dosesForDay.length })}
            </Text>
          ) : null}
        </View>

        {med.notes && isToday ? (
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

        {/* Status line — varies by where on the strip we are. */}
        <View
          style={{
            marginTop: 4,
            flexDirection: "row",
            alignItems: "center",
            gap: 6
          }}
        >
          {givenOnDay ? (
            <>
              <CheckCircle2 size={13} color={theme.colors.success} />
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.success,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {isToday
                  ? t("medications.givenTodayAt", { when: givenAtTime ?? "" })
                  : t("medications.givenAt", { when: givenAtTime ?? "" })}
              </Text>
            </>
          ) : isPast ? (
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.danger,
                fontFamily: "Inter_700Bold"
              }}
            >
              {t("medications.notTaken")}
            </Text>
          ) : isFuture ? (
            <Text
              style={{
                fontSize: 11,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}
            >
              {t("medications.scheduledForTime", { when: med.timeOfDay })}
            </Text>
          ) : (
            <Text
              style={{
                fontSize: 11,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}
            >
              {t("medications.notYetToday")}
            </Text>
          )}
        </View>

        {/* Mark Given button — only visible on today. Past = read-only,
            future = nothing to mark. */}
        {isToday ? (
          <Pressable
            onPress={onMarkGiven}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={isGivingPending}
            style={{
              marginTop: 6,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 11,
              borderRadius: mobileTheme.radius.md,
              backgroundColor: givenOnDay
                ? theme.colors.success
                : theme.colors.primary,
              opacity: isGivingPending ? 0.7 : 1
            }}
          >
            {isGivingPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Check size={15} color="#FFFFFF" />
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 13,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {givenOnDay
                    ? t("medications.markGivenAgain")
                    : t("medications.markGiven")}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      {/* Green flash overlay — fades in/out for ~600ms on successful tap */}
      {(justGiven || isGivingPending) && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme.colors.success,
            opacity: flash
          }}
        />
      )}
    </Animated.View>
  );
}

