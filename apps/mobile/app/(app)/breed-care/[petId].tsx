import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, BookOpen, PawPrint } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { LottieLoading } from "@/components/lottie-loading";
import { getBreedCareForPet } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useLocalRefresh } from "@/lib/use-local-refresh";
import { useSessionStore } from "@/store/session";
import { useCallback } from "react";

export default function BreedCarePage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const session = useSessionStore((s) => s.session);
  const token = session?.tokens.accessToken ?? "";

  const lookupQuery = useQuery({
    queryKey: ["breed-care", petId],
    queryFn: () => getBreedCareForPet(token, petId!),
    enabled: Boolean(token && petId)
  });

  const { refreshing, handleRefresh } = useLocalRefresh(
    useCallback(() => lookupQuery.refetch(), [lookupQuery])
  );

  const data = lookupQuery.data;
  const guide = data?.guide;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
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
            numberOfLines={1}
          >
            {data?.breedLabel || data?.speciesLabel || t("breedCare.title")}
          </Text>
          {data?.breedLabel && data?.speciesLabel ? (
            <Text
              style={{
                fontSize: mobileTheme.typography.caption.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_400Regular"
              }}
              numberOfLines={1}
            >
              {data.speciesLabel}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {lookupQuery.isLoading ? (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <LottieLoading size={70} />
          </View>
        ) : !data?.available || !guide ? (
          <EmptyState
            theme={theme}
            speciesLabel={data?.speciesLabel}
            breedLabel={data?.breedLabel}
            t={t}
          />
        ) : (
          <View>
            {/* Hero */}
            {guide.heroImageUrl ? (
              <Image
                source={{ uri: guide.heroImageUrl }}
                style={{ width: "100%", height: 220, backgroundColor: theme.colors.border }}
                contentFit="cover"
                transition={300}
                cachePolicy="memory-disk"
              />
            ) : (
              <View
                style={{
                  height: 160,
                  backgroundColor: theme.colors.primaryBg,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <PawPrint size={56} color={theme.colors.primary} />
              </View>
            )}

            <View
              style={{
                paddingHorizontal: mobileTheme.spacing.xl,
                paddingTop: mobileTheme.spacing.xl,
                gap: mobileTheme.spacing.md
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: 26,
                    fontWeight: "800",
                    color: theme.colors.ink,
                    fontFamily: "Inter_700Bold",
                    lineHeight: 32
                  }}
                >
                  {guide.title}
                </Text>
                {guide.summary ? (
                  <Text
                    style={{
                      marginTop: 6,
                      fontSize: mobileTheme.typography.body.fontSize,
                      color: theme.colors.muted,
                      fontFamily: "Inter_500Medium",
                      lineHeight: 22
                    }}
                  >
                    {guide.summary}
                  </Text>
                ) : null}
              </View>

              {/* Meta chips */}
              <View
                style={{
                  flexDirection: "row",
                  gap: 6,
                  flexWrap: "wrap"
                }}
              >
                {data.speciesLabel ? (
                  <Chip
                    label={data.speciesLabel}
                    color={theme.colors.primary}
                    bg={theme.colors.primaryBg}
                  />
                ) : null}
                {data.breedLabel ? (
                  <Chip
                    label={data.breedLabel}
                    color={theme.colors.success}
                    bg={theme.colors.successBg}
                  />
                ) : null}
                {!data.breedLabel && data.speciesLabel ? (
                  <Chip
                    label={t("breedCare.speciesWide")}
                    color={theme.colors.muted}
                    bg={theme.colors.background}
                  />
                ) : null}
              </View>

              {/* Body — preserve line breaks; no markdown for v1. */}
              {guide.body
                .split(/\n\s*\n/)
                .filter((p) => p.trim().length > 0)
                .map((paragraph, idx) => (
                  <Text
                    key={idx}
                    style={{
                      fontSize: mobileTheme.typography.body.fontSize,
                      color: theme.colors.ink,
                      fontFamily: "Inter_400Regular",
                      lineHeight: 24
                    }}
                  >
                    {paragraph.trim()}
                  </Text>
                ))}

              <Text
                style={{
                  marginTop: mobileTheme.spacing.lg,
                  fontSize: 11,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium",
                  textAlign: "center"
                }}
              >
                {t("breedCare.lastUpdated")} · {new Date(guide.updatedAt).toLocaleDateString()}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Chip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: bg
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color,
          fontFamily: "Inter_700Bold",
          textTransform: "uppercase",
          letterSpacing: 0.5
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function EmptyState({
  theme,
  speciesLabel,
  breedLabel,
  t
}: {
  theme: ReturnType<typeof useTheme>;
  speciesLabel?: string;
  breedLabel?: string;
  t: (k: string, opts?: any) => string;
}) {
  return (
    <View
      style={{
        paddingTop: mobileTheme.spacing["4xl"],
        paddingHorizontal: mobileTheme.spacing["3xl"],
        alignItems: "center",
        gap: mobileTheme.spacing.lg
      }}
    >
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          backgroundColor: theme.colors.primaryBg,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <BookOpen size={36} color={theme.colors.primary} />
      </View>
      <Text
        style={{
          fontSize: mobileTheme.typography.subheading.fontSize,
          fontWeight: mobileTheme.typography.subheading.fontWeight,
          color: theme.colors.ink,
          fontFamily: "Inter_700Bold",
          textAlign: "center"
        }}
      >
        {t("breedCare.empty")}
      </Text>
      <Text
        style={{
          fontSize: mobileTheme.typography.body.fontSize,
          color: theme.colors.muted,
          fontFamily: "Inter_400Regular",
          textAlign: "center",
          lineHeight: 22
        }}
      >
        {breedLabel
          ? t("breedCare.emptyBreed", { breed: breedLabel })
          : speciesLabel
          ? t("breedCare.emptySpecies", { species: speciesLabel })
          : t("breedCare.emptyGeneric")}
      </Text>
    </View>
  );
}
