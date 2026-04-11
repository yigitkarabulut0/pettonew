import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View
} from "react-native";
import { LottieLoading } from "@/components/lottie-loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Bookmark, CheckCircle, Play } from "lucide-react-native";

import { useTranslation } from "react-i18next";
import { getTrainingTip, bookmarkTip, unbookmarkTip, completeTip } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  easy: { bg: "rgba(63, 125, 78, 0.12)", text: "#3F7D4E" },
  medium: { bg: "rgba(247, 178, 103, 0.15)", text: "#C48A3F" },
  hard: { bg: "rgba(161, 70, 50, 0.12)", text: "#A14632" }
};

export default function TrainingTipDetailPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const token = session?.tokens.accessToken ?? "";

  const [bookmarked, setBookmarked] = useState(false);
  const [completed, setCompleted] = useState(false);

  const {
    data: tip,
    isLoading
  } = useQuery({
    queryKey: ["training-tip", id],
    queryFn: () => getTrainingTip(token, id!),
    enabled: Boolean(token && id)
  });

  const bookmarkMutation = useMutation({
    mutationFn: () =>
      bookmarked ? unbookmarkTip(token, id!) : bookmarkTip(token, id!),
    onSuccess: () => {
      setBookmarked(!bookmarked);
    }
  });

  const completeMutation = useMutation({
    mutationFn: () => completeTip(token, id!),
    onSuccess: () => {
      setCompleted(true);
      queryClient.invalidateQueries({ queryKey: ["training-tips"] });
    }
  });

  const diffStyle = tip
    ? DIFFICULTY_COLORS[tip.difficulty] ?? DIFFICULTY_COLORS.easy
    : DIFFICULTY_COLORS.easy;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
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
          numberOfLines={1}
        >
          {t("training.tipTitle")}
        </Text>
        <Pressable
          onPress={() => bookmarkMutation.mutate()}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: bookmarked ? theme.colors.primaryBg : theme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1
          })}
        >
          <Bookmark
            size={20}
            color={bookmarked ? theme.colors.primary : theme.colors.muted}
            fill={bookmarked ? theme.colors.primary : "none"}
          />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <LottieLoading size={70} />
        </View>
      ) : tip ? (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingBottom: insets.bottom + 40,
            gap: mobileTheme.spacing.lg
          }}
        >
          {/* Title & Badges */}
          <Text
            style={{
              fontSize: 24,
              fontFamily: "Inter_700Bold",
              color: theme.colors.ink,
              lineHeight: 32
            }}
          >
            {tip.title}
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing.sm }}>
            <View
              style={{
                paddingHorizontal: mobileTheme.spacing.md,
                paddingVertical: 4,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: diffStyle.bg
              }}
            >
              <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontFamily: "Inter_600SemiBold", color: diffStyle.text }}>
                {tip.difficulty}
              </Text>
            </View>
            <View
              style={{
                paddingHorizontal: mobileTheme.spacing.md,
                paddingVertical: 4,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: theme.colors.primaryBg
              }}
            >
              <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontFamily: "Inter_600SemiBold", color: theme.colors.primary }}>
                {tip.category}
              </Text>
            </View>
            <View
              style={{
                paddingHorizontal: mobileTheme.spacing.md,
                paddingVertical: 4,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: theme.colors.surface
              }}
            >
              <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontFamily: "Inter_600SemiBold", color: theme.colors.muted }}>
                {tip.petType}
              </Text>
            </View>
          </View>

          {/* Summary */}
          {tip.summary ? (
            <Text
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                fontFamily: "Inter_500Medium",
                color: theme.colors.ink,
                lineHeight: 24
              }}
            >
              {tip.summary}
            </Text>
          ) : null}

          {/* Video placeholder */}
          {tip.videoUrl ? (
            <View
              style={{
                height: 200,
                borderRadius: mobileTheme.radius.lg,
                backgroundColor: theme.colors.surface,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Play size={40} color={theme.colors.primary} />
              <Text style={{ marginTop: 8, fontSize: mobileTheme.typography.caption.fontSize, fontFamily: "Inter_500Medium", color: theme.colors.muted }}>
                {t("training.videoAvailable")}
              </Text>
            </View>
          ) : null}

          {/* Body */}
          {tip.body ? (
            <View>
              <Text
                style={{
                  fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                  fontFamily: "Inter_700Bold",
                  color: theme.colors.ink,
                  marginBottom: mobileTheme.spacing.sm
                }}
              >
                {t("training.details")}
              </Text>
              <Text
                style={{
                  fontSize: mobileTheme.typography.body.fontSize,
                  fontFamily: "Inter_400Regular",
                  color: theme.colors.muted,
                  lineHeight: 24
                }}
              >
                {tip.body}
              </Text>
            </View>
          ) : null}

          {/* Steps */}
          {Array.isArray(tip.steps) && tip.steps.length > 0 ? (
            <View style={{ gap: mobileTheme.spacing.md }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                  fontFamily: "Inter_700Bold",
                  color: theme.colors.ink
                }}
              >
                {t("training.steps")}
              </Text>
              {tip.steps
                .sort((a, b) => a.order - b.order)
                .map((step) => (
                  <View
                    key={step.order}
                    style={{
                      flexDirection: "row",
                      gap: mobileTheme.spacing.md,
                      padding: mobileTheme.spacing.lg,
                      borderRadius: mobileTheme.radius.lg,
                      backgroundColor: theme.colors.white,
                      ...mobileTheme.shadow.sm
                    }}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: theme.colors.primaryBg,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontFamily: "Inter_700Bold",
                          color: theme.colors.primary
                        }}
                      >
                        {step.order}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                          fontFamily: "Inter_700Bold",
                          color: theme.colors.ink
                        }}
                      >
                        {step.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.body.fontSize,
                          fontFamily: "Inter_400Regular",
                          color: theme.colors.muted,
                          lineHeight: 22
                        }}
                      >
                        {step.description}
                      </Text>
                      {step.videoUrl ? (
                        <View
                          style={{
                            marginTop: 6,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4
                          }}
                        >
                          <Play size={14} color={theme.colors.primary} />
                          <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontFamily: "Inter_500Medium", color: theme.colors.primary }}>
                            {t("training.videoAvailable")}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))}
            </View>
          ) : null}

          {/* Mark Completed Button */}
          <Pressable
            onPress={() => completeMutation.mutate()}
            disabled={completed || completeMutation.isPending}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: mobileTheme.spacing.sm,
              backgroundColor: completed ? "rgba(63, 125, 78, 0.12)" : theme.colors.primary,
              paddingVertical: mobileTheme.spacing.lg,
              borderRadius: mobileTheme.radius.lg,
              opacity: pressed ? 0.85 : 1,
              marginTop: mobileTheme.spacing.md
            })}
          >
            <CheckCircle size={20} color={completed ? "#3F7D4E" : "#FFFFFF"} />
            <Text
              style={{
                fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                fontFamily: "Inter_700Bold",
                color: completed ? "#3F7D4E" : "#FFFFFF"
              }}
            >
              {completed ? t("training.completed") : completeMutation.isPending ? t("common.saving") : t("training.markCompleted")}
            </Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: theme.colors.muted, fontFamily: "Inter_500Medium" }}>
            {t("training.tipNotFound")}
          </Text>
        </View>
      )}
    </View>
  );
}
