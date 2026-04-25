import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CloudOff,
  Heart,
  Info
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";

import { LottieLoading } from "@/components/lottie-loading";
import { listFirstAidTopics } from "@/lib/api";
import type { FirstAidTopic } from "@petto/contracts";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useLocalRefresh } from "@/lib/use-local-refresh";
import { useSessionStore } from "@/store/session";

const CACHE_KEY = "fetcht.first-aid-cache.v1";

type Cache = { topics: FirstAidTopic[]; cachedAt: string };

// In-memory primer used by the screen until AsyncStorage hydration finishes.
async function loadCache(): Promise<Cache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Cache;
  } catch {
    return null;
  }
}

async function saveCache(topics: FirstAidTopic[]) {
  try {
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ topics, cachedAt: new Date().toISOString() } satisfies Cache)
    );
  } catch {
    // best-effort; offline cache is not load-bearing for write paths.
  }
}

function severityMeta(sev: FirstAidTopic["severity"]) {
  switch (sev) {
    case "emergency":
      return { color: "#A14632", icon: AlertTriangle, labelKey: "firstAid.severityEmergency" };
    case "urgent":
      return { color: "#C48A3F", icon: Heart, labelKey: "firstAid.severityUrgent" };
    default:
      return { color: "#5B9BD5", icon: Info, labelKey: "firstAid.severityInfo" };
  }
}

export default function FirstAidPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const token = session?.tokens.accessToken ?? "";

  const [cached, setCached] = useState<Cache | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Hydrate from AsyncStorage first so the page paints instantly even when
  // the user is offline. We then fetch fresh in the background.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await loadCache();
      if (cancelled) return;
      setCached(c);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const topicsQuery = useQuery({
    queryKey: ["first-aid"],
    queryFn: () => listFirstAidTopics(token),
    enabled: Boolean(token) && hydrated,
    staleTime: 1000 * 60 * 30
  });

  // Persist successful fetches.
  useEffect(() => {
    if (topicsQuery.data) {
      void saveCache(topicsQuery.data);
      setCached({ topics: topicsQuery.data, cachedAt: new Date().toISOString() });
    }
  }, [topicsQuery.data]);

  const { refreshing, handleRefresh } = useLocalRefresh(
    useCallback(() => topicsQuery.refetch(), [topicsQuery])
  );

  // Topics: prefer fresh fetch, fall back to cache when offline.
  const topics = topicsQuery.data ?? cached?.topics ?? [];
  const isOfflineFallback =
    !topicsQuery.data && Boolean(cached) && Boolean(topicsQuery.error);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.lg,
          paddingHorizontal: mobileTheme.spacing.xl,
          backgroundColor: theme.colors.danger,
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "rgba(255,255,255,0.18)",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <ArrowLeft size={18} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: mobileTheme.typography.subheading.fontSize,
              fontWeight: mobileTheme.typography.subheading.fontWeight,
              color: "#FFFFFF",
              fontFamily: "Inter_700Bold"
            }}
          >
            {t("firstAid.title")}
          </Text>
          <Text
            style={{
              fontSize: mobileTheme.typography.caption.fontSize,
              color: "rgba(255,255,255,0.85)",
              fontFamily: "Inter_500Medium"
            }}
          >
            {t("firstAid.subtitle")}
          </Text>
        </View>
      </View>

      {isOfflineFallback ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingVertical: mobileTheme.spacing.sm,
            backgroundColor: theme.colors.dangerBg
          }}
        >
          <CloudOff size={14} color={theme.colors.danger} />
          <Text
            style={{
              fontSize: mobileTheme.typography.caption.fontSize,
              color: theme.colors.danger,
              fontFamily: "Inter_500Medium",
              flex: 1
            }}
          >
            {t("firstAid.offlineBanner", {
              when: cached?.cachedAt
                ? new Date(cached.cachedAt).toLocaleString()
                : "—"
            })}
          </Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={{
          padding: mobileTheme.spacing.xl,
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
        {!hydrated || (topicsQuery.isLoading && !cached) ? (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <LottieLoading size={60} />
          </View>
        ) : topics.length === 0 ? (
          <View
            style={{
              paddingVertical: mobileTheme.spacing["4xl"],
              alignItems: "center",
              gap: mobileTheme.spacing.lg
            }}
          >
            <Heart size={48} color={theme.colors.muted} />
            <Text
              style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold",
                textAlign: "center"
              }}
            >
              {t("firstAid.empty")}
            </Text>
            <Text
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_400Regular",
                textAlign: "center",
                paddingHorizontal: mobileTheme.spacing["2xl"]
              }}
            >
              {t("firstAid.emptyDescription")}
            </Text>
          </View>
        ) : (
          <View style={{ gap: mobileTheme.spacing.md }}>
            {topics.map((topic) => {
              const meta = severityMeta(topic.severity);
              const Icon = meta.icon;
              const open = openId === topic.id;
              return (
                <View
                  key={topic.id}
                  style={{
                    backgroundColor: theme.colors.white,
                    borderRadius: mobileTheme.radius.lg,
                    overflow: "hidden",
                    borderLeftWidth: 4,
                    borderLeftColor: meta.color,
                    ...mobileTheme.shadow.sm
                  }}
                >
                  <Pressable
                    onPress={() => setOpenId(open ? null : topic.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: mobileTheme.spacing.lg,
                      gap: mobileTheme.spacing.md
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: meta.color + "22",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Icon size={18} color={meta.color} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: meta.color,
                          fontFamily: "Inter_700Bold",
                          textTransform: "uppercase",
                          letterSpacing: 0.6
                        }}
                      >
                        {t(meta.labelKey)}
                      </Text>
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.body.fontSize,
                          fontWeight: "700",
                          color: theme.colors.ink,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {topic.title}
                      </Text>
                      {topic.summary && !open ? (
                        <Text
                          numberOfLines={2}
                          style={{
                            fontSize: mobileTheme.typography.caption.fontSize,
                            color: theme.colors.muted,
                            fontFamily: "Inter_400Regular",
                            lineHeight: 18
                          }}
                        >
                          {topic.summary}
                        </Text>
                      ) : null}
                    </View>
                    {open ? (
                      <ChevronDown size={18} color={theme.colors.muted} />
                    ) : (
                      <ChevronRight size={18} color={theme.colors.muted} />
                    )}
                  </Pressable>
                  {open ? (
                    <View
                      style={{
                        paddingHorizontal: mobileTheme.spacing.lg,
                        paddingBottom: mobileTheme.spacing.lg,
                        gap: mobileTheme.spacing.sm,
                        borderTopWidth: 1,
                        borderTopColor: theme.colors.border
                      }}
                    >
                      {topic.body
                        .split(/\n\s*\n/)
                        .filter((p) => p.trim().length > 0)
                        .map((paragraph, idx) => (
                          <Text
                            key={idx}
                            style={{
                              marginTop: idx === 0 ? mobileTheme.spacing.md : 0,
                              fontSize: mobileTheme.typography.body.fontSize,
                              color: theme.colors.ink,
                              fontFamily: "Inter_400Regular",
                              lineHeight: 23
                            }}
                          >
                            {paragraph.trim()}
                          </Text>
                        ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
