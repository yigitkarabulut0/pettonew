import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker, type Region } from "react-native-maps";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  CalendarDays,
  List as ListIcon,
  Map as MapIcon,
  Navigation,
  Plus,
  RefreshCw,
  Search,
  X
} from "lucide-react-native";
import type { Playdate } from "@petto/contracts";

import { listPlaydates, joinPlaydate } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useLocalRefresh } from "@/lib/use-local-refresh";
import { useSessionStore } from "@/store/session";
import {
  getCachedLocation,
  refreshLocation,
  type CachedLocation
} from "@/lib/location";
import { clusterPoints } from "@/lib/clustering";
import { PlaydateCard } from "@/components/playdates/playdate-card";
import {
  PlaydateFilters,
  type SortMode,
  type TimeFilter
} from "@/components/playdates/playdate-filters";
import { PlaydateMarker } from "@/components/playdates/playdate-marker";
import { CreatePlaydateModal } from "@/components/playdates/create-playdate-modal";

// Default map center if the user hasn't granted location yet — Istanbul.
const DEFAULT_REGION: Region = {
  latitude: 41.01,
  longitude: 28.98,
  latitudeDelta: 0.25,
  longitudeDelta: 0.25
};

const NEARBY_THRESHOLD_KM = 25;

function computeDateRange(filter: TimeFilter, custom?: { from?: Date; to?: Date }) {
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
  if (filter === "custom" && custom?.from) {
    const end = custom.to ?? new Date(custom.from.getTime() + 24 * 60 * 60 * 1000);
    return { from: custom.from.toISOString(), to: end.toISOString() };
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

  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [time, setTime] = useState<TimeFilter>("all");
  const [sort, setSort] = useState<SortMode>("distance");
  const [location, setLocation] = useState<CachedLocation | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [selectedPlaydateId, setSelectedPlaydateId] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);

  // Seed the location from cache on mount so the first render has a
  // usable map — then kick off a fresh fix in the background.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await getCachedLocation();
      if (!cancelled && cached) {
        setLocation(cached);
        setRegion({
          latitude: cached.latitude,
          longitude: cached.longitude,
          latitudeDelta: 0.12,
          longitudeDelta: 0.12
        });
      }
      const fresh = await refreshLocation();
      if (cancelled) return;
      if (fresh.status === "granted") {
        setLocation(fresh.location);
        setLocationDenied(false);
        if (!cached) {
          setRegion({
            latitude: fresh.location.latitude,
            longitude: fresh.location.longitude,
            latitudeDelta: 0.12,
            longitudeDelta: 0.12
          });
        }
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
      // Re-acquire location on pull-to-refresh so stale coordinates
      // don't pin the map to an old city if the user moved.
      const fresh = await refreshLocation();
      if (fresh.status === "granted") setLocation(fresh.location);
      await playdatesQuery.refetch();
    }, [playdatesQuery])
  );

  const joinMutation = useMutation({
    mutationFn: (playdateId: string) => joinPlaydate(token, playdateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playdates"] });
    }
  });

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

  const mapPoints = useMemo(
    () =>
      playdates
        .filter((p) => p.latitude && p.longitude)
        .map((p) => ({
          id: p.id,
          latitude: p.latitude as number,
          longitude: p.longitude as number,
          playdate: p
        })),
    [playdates]
  );

  const clusters = useMemo(
    () => clusterPoints(mapPoints, region.latitudeDelta),
    [mapPoints, region.latitudeDelta]
  );

  const selectedPlaydate = selectedPlaydateId
    ? playdates.find((p) => p.id === selectedPlaydateId) ?? null
    : null;

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

  const handleJoin = (playdate: Playdate) => {
    if (!playdate.isAttending) {
      joinMutation.mutate(playdate.id);
    }
  };

  const onRegionChangeComplete = (r: Region) => setRegion(r);

  const recenterToUser = async () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.12,
          longitudeDelta: 0.12
        },
        400
      );
    } else {
      const fresh = await refreshLocation();
      if (fresh.status === "granted") {
        setLocation(fresh.location);
        mapRef.current?.animateToRegion(
          {
            latitude: fresh.location.latitude,
            longitude: fresh.location.longitude,
            latitudeDelta: 0.12,
            longitudeDelta: 0.12
          },
          400
        );
      }
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Unified white header surface (title + toggle + filters) with soft
          shadow — same pattern as groups.tsx so the filter row breathes. */}
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
            onPress={handleRefresh}
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
            <RefreshCw size={18} color={theme.colors.ink} />
          </Pressable>
          <Pressable
            onPress={() => setCreateOpen(true)}
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

        {/* View toggle */}
        <View
          style={{
            flexDirection: "row",
            marginHorizontal: 20,
            marginBottom: 12,
            backgroundColor: theme.colors.surface,
            borderRadius: mobileTheme.radius.pill,
            padding: 4,
            borderWidth: 1,
            borderColor: theme.colors.border
          }}
        >
          {(["list", "map"] as const).map((key) => {
            const active = viewMode === key;
            const Icon = key === "list" ? ListIcon : MapIcon;
            return (
              <Pressable
                key={key}
                onPress={() => setViewMode(key)}
                style={{
                  flex: 1,
                  paddingVertical: 11,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: active ? theme.colors.white : "transparent",
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 6,
                  ...(active ? mobileTheme.shadow.sm : {})
                }}
              >
                <Icon
                  size={14}
                  color={active ? theme.colors.primary : theme.colors.muted}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: active ? "Inter_700Bold" : "Inter_500Medium",
                    color: active ? theme.colors.ink : theme.colors.muted
                  }}
                >
                  {key === "list"
                    ? (t("playdates.listView") as string)
                    : (t("playdates.mapView") as string)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Filters */}
        <PlaydateFilters
          time={time}
          onTimeChange={setTime}
          sort={sort}
          onSortToggle={() =>
            setSort((s) => (s === "distance" ? "time" : "distance"))
          }
          onOpenCustom={() => setTime("all")}
        />
      </View>

      {/* Location denied banner */}
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

      {/* Body */}
      {viewMode === "list" ? (
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
              onCreate={() => setCreateOpen(true)}
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
                      onJoin={() => handleJoin(p)}
                      joinPending={joinMutation.isPending}
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
                      onJoin={() => handleJoin(p)}
                      joinPending={joinMutation.isPending}
                    />
                  ))}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={region}
            onRegionChangeComplete={onRegionChangeComplete}
            showsUserLocation
            showsMyLocationButton={false}
            toolbarEnabled={false}
          >
            {clusters.map((c) => {
              if (c.kind === "single") {
                const p = (c.point as any).playdate as Playdate;
                return (
                  <Marker
                    key={p.id}
                    coordinate={{
                      latitude: p.latitude as number,
                      longitude: p.longitude as number
                    }}
                    onPress={() => setSelectedPlaydateId(p.id)}
                    tracksViewChanges={false}
                  >
                    <PlaydateMarker
                      kind="single"
                      selected={selectedPlaydateId === p.id}
                    />
                  </Marker>
                );
              }
              return (
                <Marker
                  key={c.id}
                  coordinate={{
                    latitude: c.latitude,
                    longitude: c.longitude
                  }}
                  onPress={() => {
                    mapRef.current?.animateToRegion(
                      {
                        latitude: c.latitude,
                        longitude: c.longitude,
                        latitudeDelta: Math.max(
                          region.latitudeDelta / 2.5,
                          0.004
                        ),
                        longitudeDelta: Math.max(
                          region.longitudeDelta / 2.5,
                          0.004
                        )
                      },
                      400
                    );
                  }}
                  tracksViewChanges={false}
                >
                  <PlaydateMarker kind="group" count={c.count} />
                </Marker>
              );
            })}
          </MapView>

          {/* Recenter button */}
          <Pressable
            onPress={recenterToUser}
            style={{
              position: "absolute",
              right: 16,
              bottom: insets.bottom + (selectedPlaydate ? 190 : 28),
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.colors.white,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.border,
              ...mobileTheme.shadow.sm
            }}
          >
            <Navigation size={18} color={theme.colors.primary} />
          </Pressable>

          {/* Bottom preview card */}
          {selectedPlaydate ? (
            <View
              style={{
                position: "absolute",
                left: 16,
                right: 16,
                bottom: insets.bottom + 20
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  marginBottom: 6
                }}
              >
                <Pressable
                  onPress={() => setSelectedPlaydateId(null)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: theme.colors.white,
                    alignItems: "center",
                    justifyContent: "center",
                    ...mobileTheme.shadow.sm
                  }}
                >
                  <X size={14} color={theme.colors.muted} />
                </Pressable>
              </View>
              <PlaydateCard
                playdate={selectedPlaydate}
                onPress={() => openDetail(selectedPlaydate)}
                onJoin={() => handleJoin(selectedPlaydate)}
                joinPending={joinMutation.isPending}
              />
            </View>
          ) : null}
        </View>
      )}

      <CreatePlaydateModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        userLocation={
          location
            ? { latitude: location.latitude, longitude: location.longitude }
            : null
        }
      />
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
