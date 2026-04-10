import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, BookOpen, Check, GraduationCap } from "lucide-react-native";

import { listTrainingTips } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  easy: { bg: "rgba(63, 125, 78, 0.12)", text: "#3F7D4E" },
  medium: { bg: "rgba(247, 178, 103, 0.15)", text: "#C48A3F" },
  hard: { bg: "rgba(161, 70, 50, 0.12)", text: "#A14632" }
};

const PET_TYPE_FILTERS = ["all", "dog", "cat"] as const;

export default function TrainingTipsPage() {
  const theme = useTheme();
  const session = useSessionStore((s) => s.session);
  const insets = useSafeAreaInsets();
  const [petTypeFilter, setPetTypeFilter] = useState<string>("all");

  const {
    data: tips = [],
    isLoading,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ["training-tips", session?.tokens.accessToken, petTypeFilter],
    queryFn: () =>
      listTrainingTips(
        session!.tokens.accessToken,
        petTypeFilter === "all" ? undefined : petTypeFilter
      ),
    enabled: Boolean(session)
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.md,
          paddingHorizontal: mobileTheme.spacing.xl
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1
          })}
        >
          <ArrowLeft size={20} color={theme.colors.ink} />
        </Pressable>
        <Text
          style={{
            flex: 1,
            fontSize: mobileTheme.typography.heading.fontSize,
            fontWeight: mobileTheme.typography.heading.fontWeight,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          Training Tips
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          gap: mobileTheme.spacing.sm,
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingBottom: mobileTheme.spacing.md
        }}
      >
        {PET_TYPE_FILTERS.map((type) => (
          <Pressable
            key={type}
            onPress={() => setPetTypeFilter(type)}
            style={{
              paddingHorizontal: mobileTheme.spacing.lg,
              paddingVertical: mobileTheme.spacing.sm,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor:
                petTypeFilter === type
                  ? theme.colors.primary
                  : theme.colors.surface,
              borderWidth: 1,
              borderColor:
                petTypeFilter === type
                  ? theme.colors.primary
                  : theme.colors.border
            }}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.caption.fontSize,
                fontFamily: "Inter_600SemiBold",
                color:
                  petTypeFilter === type
                    ? "#FFFFFF"
                    : theme.colors.muted
              }}
            >
              {type === "all" ? "All" : type === "dog" ? "Dogs" : "Cats"}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingBottom: insets.bottom + 40,
            gap: mobileTheme.spacing.md
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={theme.colors.primary}
            />
          }
        >
          {tips.length === 0 ? (
            <View
              style={{
                alignItems: "center",
                paddingVertical: mobileTheme.spacing["4xl"],
                gap: mobileTheme.spacing.md
              }}
            >
              <GraduationCap size={40} color={theme.colors.muted} />
              <Text
                style={{
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium",
                  textAlign: "center"
                }}
              >
                No training tips yet
              </Text>
            </View>
          ) : (
            tips.map((tip) => {
              const diffStyle =
                DIFFICULTY_COLORS[tip.difficulty] ?? DIFFICULTY_COLORS.easy;
              const stepCount = Array.isArray(tip.steps) ? tip.steps.length : 0;
              return (
                <Pressable
                  key={tip.id}
                  onPress={() => router.push(`/(app)/training-tip/${tip.id}`)}
                  style={({ pressed }) => ({
                    padding: mobileTheme.spacing.xl,
                    borderRadius: mobileTheme.radius.lg,
                    backgroundColor: theme.colors.white,
                    gap: mobileTheme.spacing.md,
                    opacity: pressed ? 0.85 : 1,
                    ...mobileTheme.shadow.sm
                  })}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: mobileTheme.spacing.sm,
                        flex: 1
                      }}
                    >
                      <BookOpen size={16} color={theme.colors.primary} />
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                          fontFamily: "Inter_700Bold",
                          color: theme.colors.ink,
                          flex: 1
                        }}
                        numberOfLines={1}
                      >
                        {tip.title}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: mobileTheme.spacing.sm }}>
                      {(tip as any).isCompleted && (
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: "rgba(63, 125, 78, 0.15)",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          <Check size={14} color="#3F7D4E" />
                        </View>
                      )}
                      {stepCount > 0 && (
                        <View
                          style={{
                            paddingHorizontal: mobileTheme.spacing.sm,
                            paddingVertical: 3,
                            borderRadius: mobileTheme.radius.pill,
                            backgroundColor: "rgba(63, 125, 78, 0.12)"
                          }}
                        >
                          <Text
                            style={{
                              fontSize: mobileTheme.typography.micro.fontSize,
                              fontFamily: "Inter_600SemiBold",
                              color: "#3F7D4E"
                            }}
                          >
                            {stepCount} {stepCount === 1 ? "step" : "steps"}
                          </Text>
                        </View>
                      )}
                      <View
                        style={{
                          paddingHorizontal: mobileTheme.spacing.sm,
                          paddingVertical: 3,
                          borderRadius: mobileTheme.radius.pill,
                          backgroundColor: diffStyle.bg
                        }}
                      >
                        <Text
                          style={{
                            fontSize: mobileTheme.typography.micro.fontSize,
                            fontFamily: "Inter_600SemiBold",
                            color: diffStyle.text
                          }}
                        >
                          {tip.difficulty}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.body.fontSize,
                      fontFamily: "Inter_400Regular",
                      color: theme.colors.muted,
                      lineHeight: 22
                    }}
                    numberOfLines={2}
                  >
                    {tip.summary || tip.body}
                  </Text>
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.micro.fontSize,
                      fontFamily: "Inter_500Medium",
                      color: theme.colors.primary
                    }}
                  >
                    {tip.category} · {tip.petType}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
