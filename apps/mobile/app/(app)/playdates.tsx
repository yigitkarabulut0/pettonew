import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarDays,
  Key,
  Navigation,
  Plus,
  X
} from "lucide-react-native";
import type { Playdate } from "@petto/contracts";

import { joinPlaydateByCode, listPlaydates } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useLocalRefresh } from "@/lib/use-local-refresh";
import { useSessionStore } from "@/store/session";
import {
  getCachedLocation,
  refreshLocation,
  type CachedLocation
} from "@/lib/location";
import { PlaydateCard } from "@/components/playdates/playdate-card";
import {
  PlaydateFilters,
  type SortMode,
  type TimeFilter
} from "@/components/playdates/playdate-filters";

const NEARBY_THRESHOLD_KM = 25;

// v0.11.0 — the Map view and the "Custom" date filter were removed in this
// pass. Map's purpose overlapped with the Discover tab (which still has its
// venue map) and the Custom picker was never wired up. The page is now a
// focused, fast list of upcoming playdates grouped by proximity.
function computeDateRange(filter: TimeFilter) {
  const now = new Date();
  if (filter === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (filter === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  return { from: undefined, to: undefined };
}

export default function PlaydatesHubPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const token = session?.tokens.accessToken ?? "";

  const [time, setTime] = useState<TimeFilter>("all");
  const [sort, setSort] = useState<SortMode>("distance");
  const [location, setLocation] = useState<CachedLocation | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  // Join-by-code modal — a "PD-XXXXXX" code typed in here resolves to a
  // private playdate via /v1/playdates/join-by-code.
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [codeValue, setCodeValue] = useState("");
  const codeMutation = useMutation({
    mutationFn: (code: string) => joinPlaydateByCode(token, code),
    onSuccess: (playdate) => {
      setCodeModalVisible(false);
      setCodeValue("");
      // Invalidate playdate lists so the new pending invite shows up next
      // time the user opens "My Playdates".
      queryClient.invalidateQueries({ queryKey: ["playdates"] });
      queryClient.invalidateQueries({ queryKey: ["my-playdates"] });
      router.push(`/(app)/playdates/${playdate.id}` as any);
    },
    onError: (err) => {
      Alert.alert(
        t("common.error") as string,
        (err instanceof Error ? err.message : null) ||
          (t("playdates.invalidCode") as string)
      );
    }
  });

  // Seed the location from cache on mount so the first render has a
  // distance sort — then kick off a fresh fix in the background.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await getCachedLocation();
      if (!cancelled && cached) {
        setLocation(cached);
      }
      const fresh = await refreshLocation();
      if (cancelled) return;
      if (fresh.status === "granted") {
        setLocation(fresh.location);
        setLocationDenied(false);
      } else if (fresh.status === "denied") {
        setLocationDenied(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dateRange = useMemo(() => computeDateRange(time), [time]);

  const playdatesQuery = useQuery({
    queryKey: [
      "playdates",
      token,
      location?.latitude,
      location?.longitude,
      sort,
      time
    ],
    queryFn: () =>
      listPlaydates(token, {
        lat: location?.latitude,
        lng: location?.longitude,
        from: dateRange.from,
        to: dateRange.to,
        sort
      }),
    enabled: Boolean(token)
  });

  const { refreshing, handleRefresh } = useLocalRefresh(
    useCallback(async () => {
      const fresh = await refreshLocation();
      if (fresh.status === "granted") setLocation(fresh.location);
      await playdatesQuery.refetch();
    }, [playdatesQuery])
  );

  const playdates = playdatesQuery.data ?? [];
  const { nearby, other } = useMemo(() => {
    const near: Playdate[] = [];
    const rest: Playdate[] = [];
    for (const p of playdates) {
      if (
        location &&
        p.distance != null &&
        p.distance > 0 &&
        p.distance <= NEARBY_THRESHOLD_KM
      ) {
        near.push(p);
      } else {
        rest.push(p);
      }
    }
    return { nearby: near, other: rest };
  }, [playdates, location]);

  const openDetail = (playdate: Playdate) => {
    router.push({
      pathname: "/(app)/playdates/[id]",
      params: {
        id: playdate.id,
        initialTitle: playdate.title,
        initialImage: playdate.coverImageUrl ?? ""
      }
    } as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          backgroundColor: theme.colors.white,
          paddingBottom: 14,
          ...mobileTheme.shadow.sm
        }}
      >
        <View
          style={{
            paddingTop: insets.top + 12,
            paddingBottom: 10,
            paddingHorizontal: 20,
            flexDirection: "row",
            alignItems: "center",
            gap: 12
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: theme.colors.background,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <ArrowLeft size={20} color={theme.colors.ink} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              fontSize: 22,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            {t("playdates.title")}
          </Text>
          <Pressable
            onPress={() => router.push("/(app)/playdates/mine" as any)}
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: theme.colors.background,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <CalendarCheck size={18} color={theme.colors.ink} />
          </Pressable>
          {/* v0.14.1 — paste a PD-XXXXXX code shared by a friend who hosted
              a private playdate. Mirrors the same Key button placement on
              the groups screen so muscle memory carries between hubs. */}
          <Pressable
            onPress={() => setCodeModalVisible(true)}
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: theme.colors.background,
              alignItems: "center",
              justifyContent: "center"
            }}
            accessibilityLabel={t("playdates.joinByCode") as string}
          >
            <Key size={18} color={theme.colors.ink} />
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/(app)/playdates/create",
                params: {
                  lat: String(location?.latitude ?? ""),
                  lng: String(location?.longitude ?? "")
                }
              } as any)
            }
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: theme.colors.primary,
              alignItems: "center",
              justifyContent: "center",
              ...mobileTheme.shadow.sm
            }}
          >
            <Plus size={20} color={theme.colors.white} />
          </Pressable>
        </View>

        <PlaydateFilters
          time={time}
          onTimeChange={setTime}
          sort={sort}
          onSortToggle={() =>
            setSort((s) => (s === "distance" ? "time" : "distance"))
          }
        />
      </View>

      {locationDenied ? (
        <View
          style={{
            marginHorizontal: 20,
            marginTop: 12,
            padding: 12,
            borderRadius: mobileTheme.radius.md,
            backgroundColor: theme.colors.accent + "22",
            flexDirection: "row",
            alignItems: "center",
            gap: 10
          }}
        >
          <Navigation size={16} color={theme.colors.accent} />
          <Text
            style={{
              flex: 1,
              fontSize: 12,
              color: theme.colors.ink,
              fontFamily: "Inter_500Medium"
            }}
          >
            {t("playdates.locationDeniedBanner")}
          </Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: insets.bottom + 48,
          gap: 10
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {playdatesQuery.isLoading ? (
          <SkeletonStack theme={theme} />
        ) : playdatesQuery.isError ? (
          <ErrorState
            theme={theme}
            onRetry={() => playdatesQuery.refetch()}
            message={t("playdates.errorLoading") as string}
          />
        ) : playdates.length === 0 ? (
          <EmptyState
            theme={theme}
            title={t("playdates.noPlaydates") as string}
            body={t("playdates.noPlaydatesDescription") as string}
            onCreate={() =>
              router.push({
                pathname: "/(app)/playdates/create",
                params: {
                  lat: String(location?.latitude ?? ""),
                  lng: String(location?.longitude ?? "")
                }
              } as any)
            }
            ctaLabel={t("playdates.createPlaydate") as string}
          />
        ) : (
          <>
            {nearby.length > 0 ? (
              <>
                <SectionLabel
                  text={t("playdates.nearby") as string}
                  count={nearby.length}
                  theme={theme}
                />
                {nearby.map((p) => (
                  <PlaydateCard
                    key={p.id}
                    playdate={p}
                    onPress={() => openDetail(p)}
                  />
                ))}
              </>
            ) : null}

            {other.length > 0 ? (
              <View style={{ marginTop: nearby.length > 0 ? 16 : 0, gap: 10 }}>
                <SectionLabel
                  text={
                    nearby.length > 0
                      ? (t("playdates.otherPlaydates") as string)
                      : (t("playdates.allPlaydates") as string)
                  }
                  count={other.length}
                  theme={theme}
                />
                {other.map((p) => (
                  <PlaydateCard
                    key={p.id}
                    playdate={p}
                    onPress={() => openDetail(p)}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Join-by-code modal — same UX as the groups Key icon flow */}
      <Modal
        visible={codeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCodeModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
            padding: 24
          }}
        >
          <Pressable
            onPress={() => setCodeModalVisible(false)}
            style={{
              position: "absolute",
              top: insets.top + 16,
              right: 20,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.18)",
              alignItems: "center",
              justifyContent: "center"
            }}
            hitSlop={8}
          >
            <X size={18} color="#FFFFFF" />
          </Pressable>
          <View
            style={{
              width: "100%",
              maxWidth: 380,
              backgroundColor: theme.colors.surface,
              borderRadius: mobileTheme.radius.lg,
              padding: mobileTheme.spacing.xl,
              gap: mobileTheme.spacing.lg
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: theme.colors.primaryBg,
                alignItems: "center",
                justifyContent: "center",
                alignSelf: "center"
              }}
            >
              <Key size={24} color={theme.colors.primary} />
            </View>
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 19,
                  textAlign: "center",
                  fontFamily: "Inter_700Bold",
                  color: theme.colors.ink
                }}
              >
                {t("playdates.joinByCode")}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  textAlign: "center",
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium",
                  lineHeight: 18
                }}
              >
                {t("playdates.joinByCodeHint")}
              </Text>
            </View>
            <TextInput
              value={codeValue}
              onChangeText={(v) => setCodeValue(v.toUpperCase())}
              placeholder={t("playdates.joinCodePlaceholder") as string}
              placeholderTextColor={theme.colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              maxLength={9}
              style={{
                fontSize: 20,
                fontFamily: "Inter_700Bold",
                letterSpacing: 4,
                color: theme.colors.ink,
                textAlign: "center",
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: mobileTheme.radius.md,
                backgroundColor: theme.colors.background,
                borderWidth: 1.5,
                borderColor: codeValue.trim().length >= 4
                  ? theme.colors.primary
                  : theme.colors.border
              }}
            />
            <Pressable
              onPress={() => codeMutation.mutate(codeValue.trim())}
              disabled={!codeValue.trim() || codeMutation.isPending}
              style={({ pressed }) => ({
                paddingVertical: 14,
                borderRadius: mobileTheme.radius.md,
                backgroundColor: codeValue.trim()
                  ? theme.colors.primary
                  : theme.colors.border,
                alignItems: "center",
                justifyContent: "center",
                opacity: codeMutation.isPending ? 0.6 : pressed ? 0.85 : 1
              })}
            >
              {codeMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 15,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {t("playdates.joinByCodeSubmit")}
                </Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Internal helpers ──────────────────────────────────────────────

function SectionLabel({
  text,
  count,
  theme
}: {
  text: string;
  count: number;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 4,
        marginBottom: 4
      }}
    >
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 1,
          color: theme.colors.muted,
          fontFamily: "Inter_700Bold",
          textTransform: "uppercase"
        }}
      >
        {text}
      </Text>
      <View
        style={{
          minWidth: 22,
          height: 18,
          paddingHorizontal: 6,
          borderRadius: 9,
          backgroundColor: theme.colors.primaryBg,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Text
          style={{
            fontSize: 10,
            color: theme.colors.primary,
            fontFamily: "Inter_700Bold"
          }}
        >
          {count}
        </Text>
      </View>
    </View>
  );
}

function SkeletonStack({ theme }: { theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ gap: 10 }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            gap: 14,
            padding: 14,
            borderRadius: mobileTheme.radius.lg,
            backgroundColor: theme.colors.white,
            borderWidth: 1,
            borderColor: theme.colors.border,
            ...mobileTheme.shadow.sm
          }}
        >
          <View
            style={{
              width: 92,
              height: 92,
              borderRadius: mobileTheme.radius.md,
              backgroundColor: theme.colors.background
            }}
          />
          <View style={{ flex: 1, gap: 8, paddingTop: 6 }}>
            <View
              style={{
                height: 14,
                width: "70%",
                borderRadius: 4,
                backgroundColor: theme.colors.background
              }}
            />
            <View
              style={{
                height: 12,
                width: "50%",
                borderRadius: 4,
                backgroundColor: theme.colors.background
              }}
            />
            <View
              style={{
                height: 12,
                width: "40%",
                borderRadius: 4,
                backgroundColor: theme.colors.background
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyState({
  theme,
  title,
  body,
  onCreate,
  ctaLabel
}: {
  theme: ReturnType<typeof useTheme>;
  title: string;
  body: string;
  onCreate: () => void;
  ctaLabel: string;
}) {
  return (
    <View
      style={{
        alignItems: "center",
        padding: 40,
        marginTop: 40,
        borderRadius: mobileTheme.radius.lg,
        backgroundColor: theme.colors.white,
        borderWidth: 1,
        borderColor: theme.colors.border
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: theme.colors.primaryBg,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14
        }}
      >
        <CalendarDays size={28} color={theme.colors.primary} />
      </View>
      <Text
        style={{
          fontSize: 16,
          color: theme.colors.ink,
          fontFamily: "Inter_700Bold"
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontSize: 13,
          color: theme.colors.muted,
          textAlign: "center",
          lineHeight: 18,
          fontFamily: "Inter_500Medium",
          maxWidth: 260
        }}
      >
        {body}
      </Text>
      <Pressable
        onPress={onCreate}
        style={({ pressed }) => ({
          marginTop: 18,
          paddingHorizontal: 20,
          paddingVertical: 12,
          borderRadius: mobileTheme.radius.pill,
          backgroundColor: theme.colors.primary,
          opacity: pressed ? 0.88 : 1,
          ...mobileTheme.shadow.sm
        })}
      >
        <Text
          style={{
            color: theme.colors.white,
            fontSize: 13,
            fontFamily: "Inter_700Bold"
          }}
        >
          {ctaLabel}
        </Text>
      </Pressable>
    </View>
  );
}

function ErrorState({
  theme,
  message,
  onRetry
}: {
  theme: ReturnType<typeof useTheme>;
  message: string;
  onRetry: () => void;
}) {
  return (
    <View
      style={{
        padding: 24,
        marginTop: 20,
        borderRadius: mobileTheme.radius.lg,
        backgroundColor: theme.colors.dangerBg,
        alignItems: "center",
        gap: 10
      }}
    >
      <Text
        style={{
          fontSize: 14,
          color: theme.colors.danger,
          fontFamily: "Inter_600SemiBold"
        }}
      >
        {message}
      </Text>
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => ({
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: mobileTheme.radius.pill,
          backgroundColor: theme.colors.danger,
          opacity: pressed ? 0.85 : 1
        })}
      >
        <Text
          style={{
            color: theme.colors.white,
            fontSize: 12,
            fontFamily: "Inter_700Bold"
          }}
        >
          Retry
        </Text>
      </Pressable>
    </View>
  );
}
