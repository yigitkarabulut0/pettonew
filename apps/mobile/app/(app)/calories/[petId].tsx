import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import {
  ArrowLeft,
  Check,
  Drumstick,
  Flame,
  Plus,
  Search,
  Send,
  Trash2,
  X
} from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { LottieLoading } from "@/components/lottie-loading";
import {
  createMealLog,
  deleteMealLog,
  getDailyMealSummary,
  listFoodItems,
  listMealLogs,
  listMyPets
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

  const [foodPickerOpen, setFoodPickerOpen] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState("");
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
      await Promise.all([mealsQuery.refetch(), summaryQuery.refetch()]);
    }, [mealsQuery, summaryQuery])
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
      </ScrollView>

      {/* Food picker modal */}
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
    </KeyboardAvoidingView>
  );
}

function FoodPickerModal({
  visible,
  onClose,
  onPick,
  species,
  token
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (item: FoodItem) => void;
  species: string;
  token: string;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const itemsQuery = useQuery({
    queryKey: ["food-items", species, search],
    queryFn: () => listFoodItems(token, { search: search.trim() || undefined, species: species || undefined }),
    enabled: visible && Boolean(token)
  });

  const items = itemsQuery.data ?? [];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View
          style={{
            paddingTop: insets.top + mobileTheme.spacing.md,
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingBottom: mobileTheme.spacing.lg,
            backgroundColor: theme.colors.white,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            gap: mobileTheme.spacing.md
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                fontWeight: mobileTheme.typography.subheading.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold"
              }}
            >
              {t("calories.selectFood")}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={22} color={theme.colors.ink} />
            </Pressable>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: theme.colors.background,
              borderRadius: mobileTheme.radius.md,
              paddingHorizontal: mobileTheme.spacing.lg,
              paddingVertical: 10
            }}
          >
            <Search size={16} color={theme.colors.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t("calories.searchFood")}
              placeholderTextColor={theme.colors.muted}
              autoFocus
              style={{
                flex: 1,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink,
                fontFamily: "Inter_400Regular"
              }}
            />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingTop: mobileTheme.spacing.xl,
            paddingBottom: insets.bottom + 24
          }}
          keyboardShouldPersistTaps="handled"
        >
          {itemsQuery.isLoading ? (
            <View style={{ paddingVertical: mobileTheme.spacing["3xl"], alignItems: "center" }}>
              <LottieLoading size={50} />
            </View>
          ) : items.length === 0 ? (
            <Text
              style={{
                paddingTop: mobileTheme.spacing["3xl"],
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_400Regular",
                textAlign: "center"
              }}
            >
              {t("calories.noFoodResults")}
            </Text>
          ) : (
            <View style={{ gap: mobileTheme.spacing.sm }}>
              {items.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => onPick(item)}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? theme.colors.primaryBg : theme.colors.white,
                    borderRadius: mobileTheme.radius.lg,
                    padding: mobileTheme.spacing.lg,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: mobileTheme.spacing.md,
                    ...mobileTheme.shadow.sm
                  })}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: theme.colors.primaryBg,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Drumstick size={18} color={theme.colors.primary} />
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
                      {item.brand ? `${item.brand} · ` : ""}{item.name}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.colors.muted,
                        fontFamily: "Inter_500Medium"
                      }}
                    >
                      {item.kcalPer100g} kcal / 100g · {item.kind}
                      {item.speciesLabel ? ` · ${item.speciesLabel}` : ""}
                    </Text>
                  </View>
                  <Check size={16} color={theme.colors.primary} />
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
