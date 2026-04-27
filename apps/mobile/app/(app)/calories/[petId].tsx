import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
  Drumstick,
  Flame,
  Plus,
  Search,
  Send,
  Trash2,
  UtensilsCrossed,
  X
} from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { LottieLoading } from "@/components/lottie-loading";
import { FoodPickerModal } from "@/components/care/food-picker-modal";
import {
  createFeedingSchedule,
  createMealLog,
  deleteFeedingSchedule,
  deleteMealLog,
  getDailyMealSummary,
  listFeedingSchedules,
  listMealLogs,
  listMyPets,
  logFeedingScheduleNow
} from "@/lib/api";
import type { FoodItem } from "@petto/contracts";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useLocalRefresh } from "@/lib/use-local-refresh";
import { useSessionStore } from "@/store/session";

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatMealTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export default function CaloriesPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const token = session?.tokens.accessToken ?? "";

  const [tab, setTab] = useState<"today" | "schedule">("today");

  // Today tab — log a meal NOW.
  const [foodPickerOpen, setFoodPickerOpen] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState("");

  // Schedule tab — recurring feeding plan composer.
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [scheduleFood, setScheduleFood] = useState<FoodItem | null>(null);
  const [scheduleMealName, setScheduleMealName] = useState("");
  const [scheduleTime, setScheduleTime] = useState(new Date());
  const [showScheduleTimePicker, setShowScheduleTimePicker] = useState(false);
  const [scheduleGrams, setScheduleGrams] = useState("");
  const [scheduleFoodTypeText, setScheduleFoodTypeText] = useState("");
  const [scheduleAmountText, setScheduleAmountText] = useState("");

  const date = todayISO();
  // [from, to) — local-day window, ISO instants for the URL.
  const fromISO = `${date}T00:00:00Z`;
  const toISO = `${new Date(new Date(`${date}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000).toISOString()}`;

  const { data: pets = [] } = useQuery({
    queryKey: ["my-pets-calories", token],
    queryFn: () => listMyPets(token),
    enabled: Boolean(token)
  });
  const pet = useMemo(() => pets.find((p) => p.id === petId), [pets, petId]);
  const speciesFilter = (pet?.speciesLabel ?? "").toLowerCase();

  const mealsQuery = useQuery({
    queryKey: ["meals", petId, date],
    queryFn: () => listMealLogs(token, petId!, { from: fromISO, to: toISO }),
    enabled: Boolean(token && petId)
  });

  const summaryQuery = useQuery({
    queryKey: ["meals-summary", petId, date],
    queryFn: () => getDailyMealSummary(token, petId!, date),
    enabled: Boolean(token && petId)
  });

  // v0.14.2 — feeding plan integration. We pull the recurring schedule for
  // this pet so the "Today's Plan" section can show what's lined up + a
  // one-tap "Log it" button per row.
  const feedingQuery = useQuery({
    queryKey: ["feeding-schedules", petId],
    queryFn: () => listFeedingSchedules(token, petId!),
    enabled: Boolean(token && petId)
  });

  const logScheduleMutation = useMutation({
    mutationFn: (scheduleId: string) => logFeedingScheduleNow(token, petId!, scheduleId),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["meals", petId] });
      queryClient.invalidateQueries({ queryKey: ["meals-summary", petId] });
      queryClient.invalidateQueries({ queryKey: ["feeding-schedules", petId] });
    }
  });

  const formatTimeShort = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const createScheduleMutation = useMutation({
    mutationFn: () => {
      const g = parseFloat(scheduleGrams);
      const hasFood = scheduleFood && Number.isFinite(g) && g > 0;
      return createFeedingSchedule(token, petId!, {
        mealName: scheduleMealName.trim(),
        time: formatTimeShort(scheduleTime),
        foodType: scheduleFoodTypeText.trim(),
        amount: scheduleAmountText.trim(),
        notes: "",
        foodItemId: hasFood ? scheduleFood!.id : undefined,
        grams: hasFood ? g : undefined
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["feeding-schedules", petId] });
      setScheduleMealName("");
      setScheduleTime(new Date());
      setScheduleFood(null);
      setScheduleGrams("");
      setScheduleFoodTypeText("");
      setScheduleAmountText("");
    }
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (scheduleId: string) => deleteFeedingSchedule(token, petId!, scheduleId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["feeding-schedules", petId] })
  });

  const schedulePreviewKcal = useMemo(() => {
    const g = parseFloat(scheduleGrams);
    if (!scheduleFood || !Number.isFinite(g) || g <= 0) return 0;
    return Math.round((scheduleFood.kcalPer100g * g) / 100);
  }, [scheduleFood, scheduleGrams]);

  const createMutation = useMutation({
    mutationFn: () => {
      const g = parseFloat(grams);
      if (!Number.isFinite(g) || g <= 0) throw new Error("invalid_grams");
      return createMealLog(token, petId!, {
        foodItemId: selectedFood?.id,
        grams: g,
        eatenAt: new Date().toISOString()
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["meals", petId] });
      queryClient.invalidateQueries({ queryKey: ["meals-summary", petId] });
      setSelectedFood(null);
      setGrams("");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (mealId: string) => deleteMealLog(token, petId!, mealId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meals", petId] });
      queryClient.invalidateQueries({ queryKey: ["meals-summary", petId] });
    }
  });

  const { refreshing, handleRefresh } = useLocalRefresh(
    useCallback(async () => {
      await Promise.all([
        mealsQuery.refetch(),
        summaryQuery.refetch(),
        feedingQuery.refetch()
      ]);
    }, [mealsQuery, summaryQuery, feedingQuery])
  );

  const previewKcal = useMemo(() => {
    const g = parseFloat(grams);
    if (!selectedFood || !Number.isFinite(g) || g <= 0) return 0;
    return Math.round((selectedFood.kcalPer100g * g) / 100);
  }, [selectedFood, grams]);

  const confirmDelete = (mealId: string, label: string) => {
    Alert.alert(
      t("calories.deleteConfirmTitle"),
      t("calories.deleteConfirmBody", { label }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteMutation.mutate(mealId)
        }
      ]
    );
  };

  const meals = mealsQuery.data ?? [];
  const summary = summaryQuery.data;

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
            {t("calories.title")}
          </Text>
          {pet ? (
            <Text
              style={{
                fontSize: mobileTheme.typography.caption.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_400Regular"
              }}
            >
              {pet.name} · {date}
            </Text>
          ) : null}
        </View>
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
        {/* Tab switcher — Today (log + actuals) vs Schedule (recurring plan).
            Single screen owns both — feeding plan was merged in here so the
            user has a unified nutrition surface. */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: theme.colors.white,
            borderRadius: mobileTheme.radius.pill,
            padding: 3,
            marginBottom: mobileTheme.spacing.xl,
            ...mobileTheme.shadow.sm
          }}
        >
          {(
            [
              { key: "today" as const, label: t("calories.tabToday") },
              { key: "schedule" as const, label: t("calories.tabSchedule") }
            ]
          ).map((it) => {
            const active = tab === it.key;
            return (
              <Pressable
                key={it.key}
                onPress={() => setTab(it.key)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: active
                    ? theme.colors.primary
                    : "transparent",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Text
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    fontWeight: "700",
                    color: active ? "#FFFFFF" : theme.colors.muted,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {it.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "today" ? (
          <>
        {/* Hero — today's calories */}
        <View
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: mobileTheme.radius.lg,
            padding: mobileTheme.spacing.xl,
            marginBottom: mobileTheme.spacing.xl,
            gap: mobileTheme.spacing.sm
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Flame size={20} color="#FFFFFF" />
            <Text
              style={{
                fontSize: mobileTheme.typography.caption.fontSize,
                color: "rgba(255,255,255,0.85)",
                fontFamily: "Inter_600SemiBold",
                textTransform: "uppercase",
                letterSpacing: 1
              }}
            >
              {t("calories.todayHeading")}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 36,
              fontWeight: "800",
              color: "#FFFFFF",
              fontFamily: "Inter_700Bold"
            }}
          >
            {Math.round(summary?.totalKcal ?? 0)} kcal
          </Text>
          <Text
            style={{
              fontSize: mobileTheme.typography.caption.fontSize,
              color: "rgba(255,255,255,0.85)",
              fontFamily: "Inter_500Medium"
            }}
          >
            {summary?.mealCount ?? 0} {t("calories.mealCount")} · {Math.round(summary?.totalGrams ?? 0)} g
          </Text>
        </View>

        {/* Composer */}
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
            {t("calories.addMeal")}
          </Text>

          {/* Food picker trigger */}
          <Pressable
            onPress={() => setFoodPickerOpen(true)}
            style={{
              backgroundColor: theme.colors.background,
              borderRadius: mobileTheme.radius.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: mobileTheme.spacing.lg,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 8
            }}
          >
            <Search size={16} color={theme.colors.primary} />
            {selectedFood ? (
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: mobileTheme.typography.body.fontSize,
                    color: theme.colors.ink,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {selectedFood.brand ? `${selectedFood.brand} ` : ""}{selectedFood.name}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: theme.colors.muted,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  {selectedFood.kcalPer100g} kcal / 100g
                </Text>
              </View>
            ) : (
              <Text
                style={{
                  flex: 1,
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_400Regular"
                }}
              >
                {t("calories.pickFood")}
              </Text>
            )}
            {selectedFood ? (
              <Pressable onPress={() => setSelectedFood(null)} hitSlop={8}>
                <X size={14} color={theme.colors.muted} />
              </Pressable>
            ) : null}
          </Pressable>

          {/* Grams input */}
          <View style={{ gap: mobileTheme.spacing.sm }}>
            <Text
              style={{
                fontSize: mobileTheme.typography.caption.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}
            >
              {t("calories.grams")}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: mobileTheme.spacing.sm }}>
              <TextInput
                value={grams}
                onChangeText={(v) => setGrams(v.replace(/[^0-9.]/g, ""))}
                placeholder="0"
                placeholderTextColor={theme.colors.muted}
                keyboardType="decimal-pad"
                style={{
                  width: 100,
                  backgroundColor: theme.colors.background,
                  borderRadius: mobileTheme.radius.md,
                  paddingHorizontal: mobileTheme.spacing.lg,
                  paddingVertical: 12,
                  fontSize: mobileTheme.typography.subheading.fontSize,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold",
                  textAlign: "center"
                }}
              />
              <Text
                style={{
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium"
                }}
              >
                g
              </Text>
              <View style={{ flex: 1 }} />
              {previewKcal > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: mobileTheme.radius.pill,
                    backgroundColor: theme.colors.primaryBg
                  }}
                >
                  <Flame size={12} color={theme.colors.primary} />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: theme.colors.primary,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    ≈ {previewKcal} kcal
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <Pressable
            onPress={() => createMutation.mutate()}
            disabled={!selectedFood || !grams || createMutation.isPending}
            style={{
              backgroundColor: selectedFood && grams ? theme.colors.primary : theme.colors.border,
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
                <Plus size={16} color="#FFFFFF" />
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontWeight: "600",
                    fontSize: mobileTheme.typography.body.fontSize,
                    fontFamily: "Inter_600SemiBold"
                  }}
                >
                  {t("calories.logMeal")}
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {/* v0.14.2 — Today's Plan (recurring feeding schedule). Shown above
            today's actual meals so the user can one-tap log a planned meal.
            Hidden when there's no schedule on this pet. */}
        {(feedingQuery.data ?? []).length > 0 ? (
          <View style={{ marginBottom: mobileTheme.spacing.xl }}>
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
                  fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                  fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                  color: theme.colors.ink,
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                {t("calories.todayPlan")}
              </Text>
              <Pressable onPress={() => setTab("schedule")} hitSlop={6}>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.primary,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {t("calories.editPlan")}
                </Text>
              </Pressable>
            </View>
            <View style={{ gap: mobileTheme.spacing.sm }}>
              {(feedingQuery.data ?? []).map((sch) => {
                const todayDate = todayISO();
                const loggedToday = sch.lastLoggedAt
                  ? sch.lastLoggedAt.startsWith(todayDate)
                  : false;
                const foodLabel = sch.foodItemName
                  ? `${sch.foodItemBrand ? `${sch.foodItemBrand} · ` : ""}${sch.foodItemName}`
                  : sch.foodType || sch.amount || sch.mealName;
                return (
                  <View
                    key={sch.id}
                    style={{
                      backgroundColor: theme.colors.white,
                      borderRadius: mobileTheme.radius.lg,
                      padding: mobileTheme.spacing.lg,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: mobileTheme.spacing.md,
                      ...mobileTheme.shadow.sm,
                      opacity: loggedToday ? 0.65 : 1
                    }}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: theme.colors.primaryBg,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <UtensilsCrossed size={20} color={theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: mobileTheme.typography.body.fontSize,
                          fontWeight: "700",
                          color: theme.colors.ink,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {sch.mealName || t("calories.meal")}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                        {sch.time ? (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 3
                            }}
                          >
                            <Clock size={11} color={theme.colors.muted} />
                            <Text
                              style={{
                                fontSize: 11,
                                color: theme.colors.muted,
                                fontFamily: "Inter_500Medium"
                              }}
                            >
                              {sch.time}
                            </Text>
                          </View>
                        ) : null}
                        {foodLabel ? (
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: 11,
                              color: theme.colors.muted,
                              fontFamily: "Inter_500Medium",
                              flexShrink: 1
                            }}
                          >
                            · {foodLabel}
                          </Text>
                        ) : null}
                        {sch.kcal && sch.kcal > 0 ? (
                          <Text
                            style={{
                              fontSize: 11,
                              color: theme.colors.primary,
                              fontFamily: "Inter_700Bold"
                            }}
                          >
                            · {Math.round(sch.kcal)} kcal
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    {loggedToday ? (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: mobileTheme.radius.pill,
                          backgroundColor: theme.colors.successBg
                        }}
                      >
                        <Check size={12} color={theme.colors.success} />
                        <Text
                          style={{
                            fontSize: 11,
                            color: theme.colors.success,
                            fontFamily: "Inter_700Bold"
                          }}
                        >
                          {t("calories.loggedToday")}
                        </Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => logScheduleMutation.mutate(sch.id)}
                        disabled={logScheduleMutation.isPending}
                        style={({ pressed }) => ({
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: mobileTheme.radius.md,
                          backgroundColor: theme.colors.primary,
                          opacity: logScheduleMutation.isPending
                            ? 0.6
                            : pressed
                            ? 0.85
                            : 1
                        })}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            color: "#FFFFFF",
                            fontFamily: "Inter_700Bold"
                          }}
                        >
                          {t("calories.logIt")}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Today's meals */}
        <Text
          style={{
            fontSize: mobileTheme.typography.bodySemiBold.fontSize,
            fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
            color: theme.colors.ink,
            fontFamily: "Inter_600SemiBold",
            marginBottom: mobileTheme.spacing.md
          }}
        >
          {t("calories.todayMeals")}
        </Text>
        {mealsQuery.isLoading ? (
          <View style={{ paddingVertical: mobileTheme.spacing["3xl"], alignItems: "center" }}>
            <LottieLoading size={60} />
          </View>
        ) : meals.length === 0 ? (
          <View
            style={{
              paddingVertical: mobileTheme.spacing["3xl"],
              alignItems: "center",
              gap: mobileTheme.spacing.lg
            }}
          >
            <Drumstick size={40} color={theme.colors.muted} />
            <Text
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_400Regular",
                textAlign: "center",
                paddingHorizontal: mobileTheme.spacing["3xl"]
              }}
            >
              {t("calories.empty")}
            </Text>
          </View>
        ) : (
          <View style={{ gap: mobileTheme.spacing.sm }}>
            {meals.map((meal) => (
              <View
                key={meal.id}
                style={{
                  backgroundColor: theme.colors.white,
                  borderRadius: mobileTheme.radius.lg,
                  padding: mobileTheme.spacing.lg,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: mobileTheme.spacing.md,
                  ...mobileTheme.shadow.sm
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: theme.colors.primaryBg,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Drumstick size={20} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: mobileTheme.typography.body.fontSize,
                      fontWeight: "700",
                      color: theme.colors.ink,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    {meal.customName || t("calories.meal")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.colors.muted,
                      fontFamily: "Inter_500Medium"
                    }}
                  >
                    {Math.round(meal.grams)} g · {Math.round(meal.kcal)} kcal · {formatMealTime(meal.eatenAt)}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    confirmDelete(meal.id, meal.customName || t("calories.meal"))
                  }
                  hitSlop={8}
                >
                  <Trash2 size={16} color={theme.colors.muted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
          </>
        ) : (
          <>
            {/* ── Schedule view: recurring feeding plan ───────────────── */}
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
                {t("calories.scheduleNew")}
              </Text>

              <TextInput
                value={scheduleMealName}
                onChangeText={setScheduleMealName}
                placeholder={t("calories.mealNamePlaceholder") as string}
                placeholderTextColor={theme.colors.muted}
                style={{
                  backgroundColor: theme.colors.background,
                  borderRadius: mobileTheme.radius.md,
                  padding: mobileTheme.spacing.lg,
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.ink,
                  fontFamily: "Inter_400Regular"
                }}
              />

              <Pressable
                onPress={() => setShowScheduleTimePicker(true)}
                style={{
                  backgroundColor: theme.colors.background,
                  borderRadius: mobileTheme.radius.md,
                  padding: mobileTheme.spacing.lg,
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
                  {formatTimeShort(scheduleTime)}
                </Text>
              </Pressable>
              {showScheduleTimePicker && (
                <DateTimePicker
                  value={scheduleTime}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, d) => {
                    setShowScheduleTimePicker(Platform.OS === "ios");
                    if (d) setScheduleTime(d);
                  }}
                />
              )}

              {/* Food picker for the schedule */}
              <Pressable
                onPress={() => setSchedulePickerOpen(true)}
                style={{
                  backgroundColor: theme.colors.background,
                  borderRadius: mobileTheme.radius.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  paddingHorizontal: mobileTheme.spacing.lg,
                  paddingVertical: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8
                }}
              >
                <Search size={16} color={theme.colors.primary} />
                {scheduleFood ? (
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: mobileTheme.typography.body.fontSize,
                        color: theme.colors.ink,
                        fontFamily: "Inter_700Bold"
                      }}
                    >
                      {scheduleFood.brand ? `${scheduleFood.brand} ` : ""}
                      {scheduleFood.name}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: theme.colors.muted,
                        fontFamily: "Inter_500Medium"
                      }}
                    >
                      {scheduleFood.kcalPer100g} kcal / 100g
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={{
                      flex: 1,
                      fontSize: mobileTheme.typography.body.fontSize,
                      color: theme.colors.muted,
                      fontFamily: "Inter_400Regular"
                    }}
                  >
                    {t("calories.pickFoodOptional")}
                  </Text>
                )}
                {scheduleFood ? (
                  <Pressable
                    onPress={() => setScheduleFood(null)}
                    hitSlop={8}
                  >
                    <X size={14} color={theme.colors.muted} />
                  </Pressable>
                ) : null}
              </Pressable>

              {scheduleFood ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: mobileTheme.spacing.sm
                  }}
                >
                  <TextInput
                    value={scheduleGrams}
                    onChangeText={(v) =>
                      setScheduleGrams(v.replace(/[^0-9.]/g, ""))
                    }
                    placeholder="0"
                    placeholderTextColor={theme.colors.muted}
                    keyboardType="decimal-pad"
                    style={{
                      width: 100,
                      backgroundColor: theme.colors.background,
                      borderRadius: mobileTheme.radius.md,
                      paddingHorizontal: mobileTheme.spacing.lg,
                      paddingVertical: 12,
                      fontSize: mobileTheme.typography.subheading.fontSize,
                      color: theme.colors.ink,
                      fontFamily: "Inter_700Bold",
                      textAlign: "center"
                    }}
                  />
                  <Text
                    style={{
                      color: theme.colors.muted,
                      fontFamily: "Inter_500Medium"
                    }}
                  >
                    g
                  </Text>
                  <View style={{ flex: 1 }} />
                  {schedulePreviewKcal > 0 ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: mobileTheme.radius.pill,
                        backgroundColor: theme.colors.primaryBg
                      }}
                    >
                      <Flame size={12} color={theme.colors.primary} />
                      <Text
                        style={{
                          fontSize: 12,
                          color: theme.colors.primary,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        ≈ {schedulePreviewKcal} kcal
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                // Free-text fallback when no food is picked
                <>
                  <TextInput
                    value={scheduleFoodTypeText}
                    onChangeText={setScheduleFoodTypeText}
                    placeholder={t("calories.foodTypePlaceholder") as string}
                    placeholderTextColor={theme.colors.muted}
                    style={{
                      backgroundColor: theme.colors.background,
                      borderRadius: mobileTheme.radius.md,
                      padding: mobileTheme.spacing.lg,
                      fontSize: mobileTheme.typography.body.fontSize,
                      color: theme.colors.ink,
                      fontFamily: "Inter_400Regular"
                    }}
                  />
                  <TextInput
                    value={scheduleAmountText}
                    onChangeText={setScheduleAmountText}
                    placeholder={t("calories.amountPlaceholder") as string}
                    placeholderTextColor={theme.colors.muted}
                    style={{
                      backgroundColor: theme.colors.background,
                      borderRadius: mobileTheme.radius.md,
                      padding: mobileTheme.spacing.lg,
                      fontSize: mobileTheme.typography.body.fontSize,
                      color: theme.colors.ink,
                      fontFamily: "Inter_400Regular"
                    }}
                  />
                </>
              )}

              <Pressable
                onPress={() => createScheduleMutation.mutate()}
                disabled={
                  !scheduleMealName.trim() || createScheduleMutation.isPending
                }
                style={({ pressed }) => ({
                  backgroundColor: scheduleMealName.trim()
                    ? theme.colors.primary
                    : theme.colors.border,
                  borderRadius: mobileTheme.radius.md,
                  paddingVertical: mobileTheme.spacing.md,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: mobileTheme.spacing.sm,
                  opacity: createScheduleMutation.isPending
                    ? 0.6
                    : pressed
                    ? 0.85
                    : 1
                })}
              >
                {createScheduleMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Plus size={16} color="#FFFFFF" />
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontWeight: "700",
                        fontSize: mobileTheme.typography.body.fontSize,
                        fontFamily: "Inter_700Bold"
                      }}
                    >
                      {t("calories.scheduleSave")}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>

            {/* Existing schedule list with delete */}
            <Text
              style={{
                fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_600SemiBold",
                marginBottom: mobileTheme.spacing.md
              }}
            >
              {t("calories.scheduleList")}
            </Text>
            {(feedingQuery.data ?? []).length === 0 ? (
              <View
                style={{
                  paddingVertical: mobileTheme.spacing["3xl"],
                  alignItems: "center",
                  gap: mobileTheme.spacing.md
                }}
              >
                <UtensilsCrossed size={36} color={theme.colors.muted} />
                <Text
                  style={{
                    fontSize: mobileTheme.typography.body.fontSize,
                    color: theme.colors.muted,
                    fontFamily: "Inter_400Regular",
                    textAlign: "center",
                    paddingHorizontal: mobileTheme.spacing["3xl"]
                  }}
                >
                  {t("calories.scheduleEmpty")}
                </Text>
              </View>
            ) : (
              <View style={{ gap: mobileTheme.spacing.sm }}>
                {(feedingQuery.data ?? []).map((sch) => {
                  const foodLabel = sch.foodItemName
                    ? `${sch.foodItemBrand ? `${sch.foodItemBrand} · ` : ""}${sch.foodItemName}`
                    : sch.foodType
                      ? `${sch.foodType}${sch.amount ? ` · ${sch.amount}` : ""}`
                      : null;
                  return (
                    <View
                      key={sch.id}
                      style={{
                        backgroundColor: theme.colors.white,
                        borderRadius: mobileTheme.radius.lg,
                        padding: mobileTheme.spacing.lg,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: mobileTheme.spacing.md,
                        ...mobileTheme.shadow.sm
                      }}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: theme.colors.primaryBg,
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >
                        <UtensilsCrossed size={20} color={theme.colors.primary} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          style={{
                            fontSize: mobileTheme.typography.body.fontSize,
                            fontWeight: "700",
                            color: theme.colors.ink,
                            fontFamily: "Inter_700Bold"
                          }}
                        >
                          {sch.mealName || t("calories.meal")}
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            flexWrap: "wrap"
                          }}
                        >
                          {sch.time ? (
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 3
                              }}
                            >
                              <Clock size={11} color={theme.colors.muted} />
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: theme.colors.muted,
                                  fontFamily: "Inter_500Medium"
                                }}
                              >
                                {sch.time}
                              </Text>
                            </View>
                          ) : null}
                          {foodLabel ? (
                            <Text
                              numberOfLines={1}
                              style={{
                                fontSize: 11,
                                color: theme.colors.muted,
                                fontFamily: "Inter_500Medium"
                              }}
                            >
                              · {foodLabel}
                            </Text>
                          ) : null}
                          {sch.kcal && sch.kcal > 0 ? (
                            <Text
                              style={{
                                fontSize: 11,
                                color: theme.colors.primary,
                                fontFamily: "Inter_700Bold"
                              }}
                            >
                              · {Math.round(sch.kcal)} kcal
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <Pressable
                        onPress={() =>
                          Alert.alert(
                            t("calories.scheduleDeleteTitle") as string,
                            t("calories.scheduleDeleteBody") as string,
                            [
                              {
                                text: t("common.cancel") as string,
                                style: "cancel"
                              },
                              {
                                text: t("common.delete") as string,
                                style: "destructive",
                                onPress: () =>
                                  deleteScheduleMutation.mutate(sch.id)
                              }
                            ]
                          )
                        }
                        hitSlop={8}
                      >
                        <Trash2 size={16} color={theme.colors.muted} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Food picker modals — separate state for today's meal log vs schedule */}
      <FoodPickerModal
        visible={foodPickerOpen}
        onClose={() => setFoodPickerOpen(false)}
        onPick={(item) => {
          setSelectedFood(item);
          setFoodPickerOpen(false);
          Haptics.selectionAsync();
        }}
        species={speciesFilter}
        token={token}
      />
      <FoodPickerModal
        visible={schedulePickerOpen}
        onClose={() => setSchedulePickerOpen(false)}
        onPick={(item) => {
          setScheduleFood(item);
          setSchedulePickerOpen(false);
          Haptics.selectionAsync();
        }}
        species={speciesFilter}
        token={token}
      />
    </KeyboardAvoidingView>
  );
}

