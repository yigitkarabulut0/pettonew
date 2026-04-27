import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, Drumstick, Search, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { LottieLoading } from "@/components/lottie-loading";
import { listFoodItems } from "@/lib/api";
import type { FoodItem } from "@petto/contracts";
import { mobileTheme, useTheme } from "@/lib/theme";

/**
 * Shared food-database picker modal. Used by both:
 *   • Calorie Counter — to log a meal eaten right now
 *   • Feeding Plan — to attach a food to a recurring schedule
 *
 * `species` filters the result list (e.g. only dog foods + species-agnostic
 * rows). `token` is the caller's access token; the modal does its own
 * authenticated query so the parent doesn't have to plumb a search hook.
 */
export function FoodPickerModal({
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
    queryFn: () =>
      listFoodItems(token, {
        search: search.trim() || undefined,
        species: species || undefined
      }),
    enabled: visible && Boolean(token)
  });

  const items = itemsQuery.data ?? [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
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
              placeholder={t("calories.searchFood") as string}
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
            <View
              style={{
                paddingVertical: mobileTheme.spacing["3xl"],
                alignItems: "center"
              }}
            >
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
                    backgroundColor: pressed
                      ? theme.colors.primaryBg
                      : theme.colors.white,
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
                      {item.brand ? `${item.brand} · ` : ""}
                      {item.name}
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
