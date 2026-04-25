import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { Image } from "expo-image";
import { LottieLoading } from "@/components/lottie-loading";
import MapView, { Marker, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Coffee,
  LogOut,
  LocateFixed,
  MapPin,
  Mountain,
  Phone,
  Stethoscope,
  TreePine,
  Umbrella,
  Users,
  Wine,
  X
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";

import { useTranslation } from "react-i18next";

import { Avatar } from "@/components/avatar";
import { PrimaryButton } from "@/components/primary-button";
import {
  checkInVenue,
  listExploreFeed,
  listExploreVenues,
  listMyPets,
  listVetClinics,
  rsvpEvent
} from "@/lib/api";
import type { Playdate } from "@petto/contracts";
import { useRouter } from "expo-router";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useLocalRefresh } from "@/lib/use-local-refresh";
import { useReferenceLocation } from "@/lib/useReferenceLocation";
import { getTodayStatus } from "@/lib/hours";
import { useSessionStore } from "@/store/session";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

// Used for map padding + floating elements above the collapsed sheet.
// Matches the bottom-sheet's first snap point (peek height).
const COLLAPSED_SHEET = 180;

const LONDON_FALLBACK: Region = {
  latitude: 51.5074,
  longitude: -0.1278,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08
};

/* ------------------------------------------------------------------ */
/*  Category helpers                                                    */
/* ------------------------------------------------------------------ */

const CATEGORY_COLORS: Record<string, string> = {
  park: "#34A853",
  cafe: "#E6694A",
  bar: "#6B4EFF",
  beach: "#4ECDC4",
  trail: "#8B6F47",
  other: "#9E9A95"
};

const CATEGORY_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  park: TreePine,
  cafe: Coffee,
  bar: Wine,
  beach: Umbrella,
  trail: Mountain,
  other: MapPin
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
}

function getCategoryIcon(category: string) {
  return CATEGORY_ICONS[category] ?? CATEGORY_ICONS.other;
}

function formatLabel(value: string) {
  return value
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// v0.11.1 — straight-line distance in metres. Used to snap legacy playdates
// (no venueId) to the closest venue so old data still highlights pins.
function haversineMetres(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const la1 = toRad(aLat);
  const la2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ------------------------------------------------------------------ */
/*  Pin Marker (circle style)                                          */
/* ------------------------------------------------------------------ */

interface PinMarkerProps {
  selected: boolean;
  checkInCount: number;
  category: string;
  /** v0.11.1 — number of upcoming events or playdates hosted at this venue.
      When > 0, the pin switches to the brand accent colour + adds a badge
      so users can tell at a glance which venues have activity. */
  activityCount?: number;
}

const PinMarker = React.memo(function PinMarker({
  selected,
  checkInCount,
  category,
  activityCount = 0
}: PinMarkerProps) {
  const hasActivity = activityCount > 0;
  // Highlighted pins ignore the category colour and use the brand accent
  // so "something is happening here" reads at a glance.
  const ACTIVITY_COLOR = "#E6694A";
  const color = hasActivity ? ACTIVITY_COLOR : getCategoryColor(category);
  const Icon = getCategoryIcon(category);
  const size = selected ? 46 : hasActivity ? 40 : 36;

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      {/* Pulse ring for venues with activity — visually distinct even when
          not selected. */}
      {hasActivity ? (
        <View
          style={{
            position: "absolute",
            width: size + 12,
            height: size + 12,
            borderRadius: (size + 12) / 2,
            backgroundColor: ACTIVITY_COLOR + "33",
            borderWidth: 2,
            borderColor: ACTIVITY_COLOR + "88"
          }}
        />
      ) : null}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
          ...(selected
            ? {
                borderWidth: 3,
                borderColor: "#E6694A",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 8
              }
            : {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.12,
                shadowRadius: 4,
                elevation: 4
              })
        }}
      >
        <Icon size={selected ? 20 : 16} color="#FFFFFF" />
      </View>

      {hasActivity ? (
        /* Pill badge under the pin with the activity count. */
        <View
          style={{
            position: "absolute",
            top: -6,
            right: -8,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: "#FFFFFF",
            borderWidth: 2,
            borderColor: ACTIVITY_COLOR,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Text
            style={{
              fontSize: 9,
              color: ACTIVITY_COLOR,
              fontFamily: "Inter_700Bold"
            }}
          >
            {activityCount}
          </Text>
        </View>
      ) : checkInCount > 0 ? (
        <View
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: "#E74C3C",
            borderWidth: 2,
            borderColor: "#FFFFFF"
          }}
        />
      ) : null}
    </View>
  );
});

/* ------------------------------------------------------------------ */
/*  Memoized Venue Markers                                             */
/* ------------------------------------------------------------------ */

interface MarkerVenue {
  id: string;
  latitude: number;
  longitude: number;
  currentCheckIns: Array<unknown>;
  category: string;
}

const VenueMarkers = React.memo(function VenueMarkers({
  venues,
  selectedId,
  onSelect,
  activityCounts
}: {
  venues: MarkerVenue[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** v0.11.1 — venueId → number of upcoming events + playdates. Drives
      pin highlighting. */
  activityCounts: Record<string, number>;
}) {
  return (
    <>
      {venues.map((venue) => {
        const isSelected = selectedId === venue.id;
        const activityCount = activityCounts[venue.id] ?? 0;
        return (
          <Marker
            key={venue.id}
            coordinate={{
              latitude: venue.latitude,
              longitude: venue.longitude
            }}
            // tracksViewChanges must be true whenever the rendered pin
            // changes shape so Google Maps re-rasterises it. We already
            // toggle on selected; also keep it live when activity flips.
            tracksViewChanges={isSelected || activityCount > 0}
            onPress={() => onSelect(venue.id)}
          >
            <PinMarker
              selected={isSelected}
              checkInCount={venue.currentCheckIns.length}
              category={venue.category}
              activityCount={activityCount}
            />
          </Marker>
        );
      })}
    </>
  );
});

/* ------------------------------------------------------------------ */
/*  Main Screen                                                        */
/* ------------------------------------------------------------------ */

export default function DiscoverPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapView | null>(null);
  const sheetRef = useRef<BottomSheet>(null);

  // Snap points: peek (180px ~ category header visible), half (~65% screen),
  // full (~92% screen for power-users browsing long lists).
  const snapPoints = useMemo(() => [COLLAPSED_SHEET, "65%", "92%"], []);

  const [activeTab, setActiveTab] = useState<"venues" | "events" | "vets">("venues");
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [petPickerOpen, setPetPickerOpen] = useState(false);
  const [petPickerVenueId, setPetPickerVenueId] = useState<string | null>(null);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);

  // v0.12 — Shared stable reference location. `roundedKey` absorbs GPS jitter
  // so discover queries no longer refetch every time presence.ts ticks.
  const refLoc = useReferenceLocation();
  const userLocation = useMemo(
    () =>
      refLoc.latitude != null && refLoc.longitude != null
        ? { latitude: refLoc.latitude, longitude: refLoc.longitude }
        : null,
    [refLoc.latitude, refLoc.longitude]
  );
  const locationKey = refLoc.roundedKey ?? null;

  const tabBarOffset = insets.bottom + 82;

  /* ---- Queries ---- */

  const {
    data: venues = [],
    refetch: refetchVenues,
    isLoading: venuesLoading
  } = useQuery({
    queryKey: ["explore-venues", session?.tokens.accessToken, locationKey],
    queryFn: () =>
      listExploreVenues(
        session!.tokens.accessToken,
        userLocation?.latitude,
        userLocation?.longitude
      ),
    enabled: Boolean(session),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false
  });

  // v0.11.0 — unified feed: admin events + user-created playdates, merged
  // and date-sorted. The old /explore/events query was replaced by the new
  // /explore/feed endpoint which returns both in one round-trip.
  const {
    data: feed = { events: [], playdates: [] },
    refetch: refetchEvents,
    isLoading: eventsLoading
  } = useQuery({
    queryKey: ["explore-feed", session?.tokens.accessToken, locationKey],
    queryFn: () =>
      listExploreFeed(
        session!.tokens.accessToken,
        userLocation?.latitude,
        userLocation?.longitude
      ),
    enabled: Boolean(session),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false
  });
  const events = feed.events;
  const feedPlaydates = feed.playdates;
  const router = useRouter();

  const { data: pets = [] } = useQuery({
    queryKey: ["discover-my-pets", session?.tokens.accessToken],
    queryFn: () => listMyPets(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const { data: vetClinics = [] } = useQuery({
    queryKey: ["vet-clinics-discover", session?.tokens.accessToken, locationKey],
    queryFn: () =>
      listVetClinics(
        session!.tokens.accessToken,
        userLocation?.latitude ?? 0,
        userLocation?.longitude ?? 0
      ),
    enabled: Boolean(session) && Boolean(userLocation),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false
  });

  const refetchActiveTab = useCallback(async () => {
    // Pull-to-refresh: both re-fetch the active feed and nudge the
    // reference location so a user who has walked further than the grid
    // cell gets fresh nearby venues.
    await refLoc.refresh();
    if (activeTab === "venues") {
      await refetchVenues();
    } else if (activeTab === "events") {
      await refetchEvents();
    } else {
      await refetchVenues();
    }
  }, [activeTab, refetchVenues, refetchEvents, refLoc]);
  const { refreshing, handleRefresh } = useLocalRefresh(refetchActiveTab);

  /* ---- Location ---- */

  // Animate the map to the user once, the first time we know where they are.
  // Further GPS drift is ignored — the map should feel static unless the
  // user actively taps the "center on me" control.
  const hasCenteredRef = useRef(false);
  useEffect(() => {
    if (hasCenteredRef.current) return;
    if (!userLocation || !mapRef.current) return;
    hasCenteredRef.current = true;
    mapRef.current.animateToRegion(
      {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05
      },
      500
    );
  }, [userLocation]);

  /* ---- Derived data ---- */

  const mapVenues = useMemo(
    () =>
      venues.filter(
        (v) =>
          Number.isFinite(v.latitude) &&
          Number.isFinite(v.longitude) &&
          v.latitude !== 0 &&
          v.longitude !== 0
      ),
    [venues]
  );

  const selectedVenue = useMemo(
    () => mapVenues.find((v) => v.id === selectedVenueId) ?? null,
    [mapVenues, selectedVenueId]
  );

  // ── v0.11.1: venue activity map ─────────────────────────────────────
  // Build a lookup from venueId → upcoming events + playdates so the Discover
  // map can highlight venues hosting activity. Legacy playdates that don't
  // have a venueId yet fall back to proximity matching (≤120m) so existing
  // data still lights up on the map.
  const eventsByVenue = useMemo(() => {
    const map: Record<
      string,
      Array<{ id: string; title: string; startsAt: string }>
    > = {};
    for (const e of events) {
      if (!e.venueId) continue;
      const list = map[e.venueId] ?? [];
      list.push({ id: e.id, title: e.title, startsAt: e.startsAt });
      map[e.venueId] = list;
    }
    return map;
  }, [events]);

  const playdatesByVenue = useMemo(() => {
    const PROX_THRESHOLD_M = 120; // 120 metres — "at this venue"
    const map: Record<string, Playdate[]> = {};
    const now = Date.now();
    for (const p of feedPlaydates) {
      // Skip past / cancelled playdates — they shouldn't light up pins.
      if (p.status === "cancelled") continue;
      if (p.date) {
        const when = new Date(p.date).getTime();
        if (!Number.isNaN(when) && when < now) continue;
      }
      let venueId: string | null = p.venueId ?? null;
      if (!venueId && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) {
        // Proximity fallback for legacy playdates. Pick the closest venue
        // within the threshold; otherwise leave the playdate unassigned.
        let bestId: string | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const v of mapVenues) {
          const d = haversineMetres(
            p.latitude!,
            p.longitude!,
            v.latitude,
            v.longitude
          );
          if (d < bestDistance) {
            bestDistance = d;
            bestId = v.id;
          }
        }
        if (bestId && bestDistance <= PROX_THRESHOLD_M) venueId = bestId;
      }
      if (!venueId) continue;
      const list = map[venueId] ?? [];
      list.push(p);
      map[venueId] = list;
    }
    return map;
  }, [feedPlaydates, mapVenues]);

  const venueActivityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [vid, list] of Object.entries(eventsByVenue)) {
      counts[vid] = (counts[vid] ?? 0) + list.length;
    }
    for (const [vid, list] of Object.entries(playdatesByVenue)) {
      counts[vid] = (counts[vid] ?? 0) + list.length;
    }
    return counts;
  }, [eventsByVenue, playdatesByVenue]);

  const selectedVenueEvents = selectedVenueId
    ? eventsByVenue[selectedVenueId] ?? []
    : [];
  const selectedVenuePlaydates = selectedVenueId
    ? playdatesByVenue[selectedVenueId] ?? []
    : [];

  const userCheckedInVenueId = useMemo(() => {
    const uid = session?.user?.id;
    if (!uid) return null;
    for (const v of mapVenues) {
      if (v.currentCheckIns.some((ci: any) => ci.userId === uid)) return v.id;
    }
    return null;
  }, [mapVenues, session?.user?.id]);

  const { data: venuePhotos = [] } = useQuery({
    queryKey: ["venue-photos", selectedVenueId],
    queryFn: async () => {
      if (!selectedVenueId || !session) return [];
      try {
        const res = await fetch(
          `${process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8080"}/v1/venues/${selectedVenueId}/photos`,
          { headers: { Authorization: `Bearer ${session.tokens.accessToken}` } }
        );
        const json = await res.json();
        return (json.data as string[]) ?? [];
      } catch { return []; }
    },
    enabled: Boolean(selectedVenueId) && Boolean(session),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const primaryPetIds = useMemo(
    () => (pets.length > 0 ? [pets[0].id] : []),
    [pets]
  );

  const initialRegion = useMemo<Region>(
    () => ({
      latitude:
        userLocation?.latitude ?? mapVenues[0]?.latitude ?? LONDON_FALLBACK.latitude,
      longitude:
        userLocation?.longitude ?? mapVenues[0]?.longitude ?? LONDON_FALLBACK.longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08
    }),
    [mapVenues, userLocation]
  );

  /* ---- Mutations ---- */

  const checkInMutation = useMutation({
    mutationFn: ({
      venueId,
      petIds: pIds
    }: {
      venueId: string;
      petIds: string[];
    }) =>
      checkInVenue(
        session!.tokens.accessToken,
        venueId,
        pIds,
        userLocation?.latitude,
        userLocation?.longitude
      ),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(t("discover.checkedIn"));
      queryClient.invalidateQueries({
        queryKey: ["explore-venues", session?.tokens.accessToken]
      });
    },
    onError: (error) => {
      showToast(
        error instanceof Error ? error.message : t("discover.unableToCheckIn")
      );
    }
  });

  const rsvpMutation = useMutation({
    mutationFn: (eventId: string) =>
      rsvpEvent(session!.tokens.accessToken, eventId, primaryPetIds),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(t("discover.rsvpSuccess"));
      queryClient.invalidateQueries({
        queryKey: ["explore-events", session?.tokens.accessToken]
      });
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : t("discover.unableToJoin"));
    }
  });

  /* ---- Toast ---- */

  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToastMessage(null), 2500);
  }, []);

  /* ---- Sheet animation ---- */

  // Light haptic on snap-point change for that "professional bottom sheet"
  // feel users expect from the best iOS apps.
  const handleSheetChange = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  /* ---- Map interactions ---- */

  const focusVenue = useCallback(
    (venueId: string) => {
      const venue = mapVenues.find((v) => v.id === venueId);
      if (!venue) return;
      setSelectedVenueId(venue.id);
      // Drop the sheet to peek so the floating venue card stays visible above it.
      sheetRef.current?.snapToIndex(0);
      mapRef.current?.animateToRegion(
        {
          latitude: venue.latitude,
          longitude: venue.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02
        },
        350
      );
    },
    [mapVenues]
  );

  const goToMyLocation = useCallback(() => {
    if (!userLocation) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current?.animateToRegion(
      {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015
      },
      400
    );
  }, [userLocation]);

  /* ---- Check-in flow ---- */

  const handleCheckInPress = useCallback(
    (venueId: string) => {
      if (pets.length === 0) {
        showToast(t("discover.addPetFirstCheckIn"));
        return;
      }
      if (pets.length === 1) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        checkInMutation.mutate({ venueId, petIds: [pets[0].id] });
        return;
      }
      setPetPickerVenueId(venueId);
      setSelectedPetIds(primaryPetIds);
      setPetPickerOpen(true);
    },
    [pets, primaryPetIds, checkInMutation, showToast]
  );

  const togglePetSelection = useCallback((petId: string) => {
    setSelectedPetIds((prev) =>
      prev.includes(petId) ? prev.filter((id) => id !== petId) : [...prev, petId]
    );
  }, []);

  const confirmCheckIn = useCallback(() => {
    if (!petPickerVenueId || selectedPetIds.length === 0) return;
    setPetPickerOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    checkInMutation.mutate({
      venueId: petPickerVenueId,
      petIds: selectedPetIds
    });
  }, [petPickerVenueId, selectedPetIds, checkInMutation]);

  /* ---- RSVP flow ---- */

  const handleRsvpPress = useCallback(
    (eventId: string) => {
      if (primaryPetIds.length === 0) {
        showToast(t("discover.addPetFirstJoin"));
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      rsvpMutation.mutate(eventId);
    },
    [primaryPetIds, rsvpMutation, showToast]
  );

  /* ---- Map padding ---- */

  const mapPadding = useMemo(
    () => ({
      top: insets.top + 72,
      right: 16,
      bottom: tabBarOffset + COLLAPSED_SHEET + 16,
      left: 16
    }),
    [insets.top, tabBarOffset]
  );

  /* ---- Initial loading ---- */

  const isInitialLoading = venuesLoading && eventsLoading;

  /* ================================================================== */
  /*  RENDER                                                             */
  /* ================================================================== */

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* ---------- Map ---------- */}
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        showsUserLocation
        showsCompass={false}
        mapPadding={mapPadding}
      >
        {activeTab === "venues" ? (
          <VenueMarkers
            venues={mapVenues}
            selectedId={selectedVenueId}
            onSelect={focusVenue}
            activityCounts={venueActivityCounts}
          />
        ) : activeTab === "events" ? (
          /* v0.11.1 — Events tab map now shows every venue with at least
             one upcoming event or playdate, using the same activity-aware
             VenueMarkers component. Tapping a pin selects the venue and
             the floating card below lists the events/playdates there. */
          <VenueMarkers
            venues={mapVenues.filter(
              (v) => (venueActivityCounts[v.id] ?? 0) > 0
            )}
            selectedId={selectedVenueId}
            onSelect={focusVenue}
            activityCounts={venueActivityCounts}
          />
        ) : (
          <>
            {vetClinics.map((clinic) =>
              clinic.latitude && clinic.longitude ? (
                <Marker
                  key={clinic.id}
                  coordinate={{ latitude: clinic.latitude, longitude: clinic.longitude }}
                >
                  <View style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: "#A14632",
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.12,
                    shadowRadius: 4,
                    elevation: 4
                  }}>
                    <Stethoscope size={16} color="#FFFFFF" />
                  </View>
                </Marker>
              ) : null
            )}
          </>
        )}
      </MapView>

      {/* ---------- Floating Header ---------- */}
      <View
        style={{
          position: "absolute",
          top: insets.top,
          left: 0,
          right: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingVertical: mobileTheme.spacing.md,
          backgroundColor: "transparent"
        }}
      >
        <Text
          style={{
            fontSize: mobileTheme.typography.heading.fontSize,
            fontWeight: mobileTheme.typography.heading.fontWeight,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          {t("discover.title")}
        </Text>

        <Pressable
          onPress={goToMyLocation}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: theme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.7 : 1,
            ...mobileTheme.shadow.sm
          })}
        >
          <LocateFixed size={18} color={theme.colors.ink} />
        </Pressable>
      </View>

      {/* ---------- Toast ---------- */}
      {toastMessage && (
        <View
          style={{
            position: "absolute",
            top: insets.top + 64,
            left: 24,
            right: 24,
            alignItems: "center",
            zIndex: 100
          }}
        >
          <View
            style={{
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: "rgba(255,255,255,0.95)",
              paddingHorizontal: mobileTheme.spacing.lg,
              paddingVertical: mobileTheme.spacing.sm + 2,
              ...mobileTheme.shadow.sm
            }}
          >
            <Text
              style={{
                color: theme.colors.secondary,
                fontWeight: "600",
                fontSize: mobileTheme.typography.caption.fontSize,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {toastMessage}
            </Text>
          </View>
        </View>
      )}

      {/* ---------- Loading overlay ---------- */}
      {isInitialLoading && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(255,255,255,0.4)"
          }}
        >
          <LottieLoading size={70} />
        </View>
      )}

      {/* ---------- Location FAB ---------- */}
      <Pressable
        onPress={goToMyLocation}
        style={({ pressed }) => ({
          position: "absolute",
          bottom: tabBarOffset + COLLAPSED_SHEET + 16,
          right: 20,
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: theme.colors.surface,
          alignItems: "center",
          justifyContent: "center",
          ...mobileTheme.shadow.md,
          opacity: pressed ? 0.85 : 1
        })}
      >
        <LocateFixed size={22} color={theme.colors.ink} />
      </Pressable>

      {/* ---------- Pet Picker Modal ---------- */}
      <Modal
        visible={petPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPetPickerOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <View
            style={{
              flex: 1,
              padding: mobileTheme.spacing.xl,
              paddingTop: insets.top + mobileTheme.spacing.xl,
              gap: mobileTheme.spacing.lg
            }}
          >
            {/* Modal header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <Text
                style={{
                  fontSize: mobileTheme.typography.heading.fontSize,
                  fontWeight: mobileTheme.typography.heading.fontWeight,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {t("discover.selectPetsCheckIn")}
              </Text>
              <Pressable
                onPress={() => setPetPickerOpen(false)}
                hitSlop={12}
              >
                <X size={22} color={theme.colors.ink} />
              </Pressable>
            </View>

            {/* Pet list */}
            <ScrollView
              contentContainerStyle={{ gap: mobileTheme.spacing.md }}
              showsVerticalScrollIndicator={false}
            >
              {pets.map((pet) => {
                const isSelected = selectedPetIds.includes(pet.id);
                return (
                  <Pressable
                    key={pet.id}
                    onPress={() => togglePetSelection(pet.id)}
                    style={{
                      flexDirection: "row",
                      gap: mobileTheme.spacing.md,
                      padding: mobileTheme.spacing.lg,
                      borderRadius: mobileTheme.radius.lg,
                      backgroundColor: theme.colors.surface,
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected
                        ? theme.colors.primary
                        : theme.colors.border,
                      alignItems: "center",
                      ...mobileTheme.shadow.sm
                    }}
                  >
                    <Avatar
                      uri={pet.photos[0]?.url}
                      name={pet.name}
                      size="md"
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                          fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                          color: theme.colors.ink,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {pet.name}
                      </Text>
                      <Text
                        style={{
                          color: theme.colors.muted,
                          fontSize: mobileTheme.typography.caption.fontSize,
                          fontFamily: "Inter_400Regular"
                        }}
                      >
                        {pet.speciesLabel} {"\u00b7"} {pet.breedLabel}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: isSelected
                          ? theme.colors.primary
                          : "transparent",
                        borderWidth: 2,
                        borderColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.border,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      {isSelected && (
                        <Check size={14} color="#FFFFFF" />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Confirm button */}
            <View style={{ gap: mobileTheme.spacing.sm }}>
              <PrimaryButton
                label={t("discover.confirmCheckIn")}
                disabled={selectedPetIds.length === 0}
                onPress={confirmCheckIn}
              />
              {selectedPetIds.length === 0 && (
                <Text
                  style={{
                    color: theme.colors.danger,
                    textAlign: "center",
                    fontSize: mobileTheme.typography.caption.fontSize,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  {t("discover.selectAtLeastOnePet")}
                </Text>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Venue Detail Card (Floating above sheet) ---------- */}
      {selectedVenue && (() => {
        const isCheckedIn = userCheckedInVenueId === selectedVenue.id;
        const catColor = getCategoryColor(selectedVenue.category);
        const CatIcon = getCategoryIcon(selectedVenue.category);
        // v0.13.7 — public gallery is post-only; cover lives on the hero
        // above and shouldn't double up in the strip below.
        const allPhotos = venuePhotos;
        return (
        <View style={{ position: "absolute", left: 12, right: 12, bottom: tabBarOffset + COLLAPSED_SHEET + 8, borderRadius: 20, backgroundColor: theme.colors.white, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 20, overflow: "hidden" }}>
          {/* Hero Image */}
          {selectedVenue.imageUrl ? (
            <Image source={{ uri: selectedVenue.imageUrl }} style={{ width: "100%", height: 140, backgroundColor: theme.colors.border }} contentFit="cover" transition={250} cachePolicy="memory-disk" />
          ) : (
            <LinearGradient colors={[catColor + "30", catColor + "10"]} style={{ width: "100%", height: 100, alignItems: "center", justifyContent: "center" }}>
              <CatIcon size={36} color={catColor} />
            </LinearGradient>
          )}
          {/* Close button on image */}
          <Pressable onPress={() => setSelectedVenueId(null)} hitSlop={10} style={{ position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" }}>
            <X size={16} color="#FFFFFF" />
          </Pressable>

          <View style={{ padding: 14, gap: 10 }}>
            {/* Name + address */}
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.ink, fontFamily: "Inter_700Bold" }}>{selectedVenue.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MapPin size={12} color={theme.colors.muted} />
                <Text style={{ fontSize: 12, color: theme.colors.muted, fontFamily: "Inter_400Regular", flex: 1 }} numberOfLines={1}>{selectedVenue.address}</Text>
              </View>
            </View>

            {/* Tags */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <View style={{ backgroundColor: catColor + "18", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: catColor, textTransform: "capitalize" }}>{selectedVenue.category}</Text>
              </View>
              {selectedVenue.currentCheckIns.length > 0 && (
                <View style={{ backgroundColor: theme.colors.primaryBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: theme.colors.primary }}>{selectedVenue.currentCheckIns.length} here</Text>
                </View>
              )}
            </View>

            {/* Hours */}
            {selectedVenue.hours ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Clock size={13} color={theme.colors.success} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.colors.success }}>{selectedVenue.hours}</Text>
              </View>
            ) : null}

            {/* Description */}
            {selectedVenue.description ? (
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.colors.muted, lineHeight: 19 }} numberOfLines={3}>{selectedVenue.description}</Text>
            ) : null}

            {/* People here */}
            {selectedVenue.currentCheckIns.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {selectedVenue.currentCheckIns.slice(0, 5).map((ci: any, idx: number) => (
                  <View key={ci.userId || idx} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: theme.colors.primarySoft, borderWidth: 2, borderColor: theme.colors.white, alignItems: "center", justifyContent: "center", marginLeft: idx > 0 ? -8 : 0, zIndex: 5 - idx }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.primary, fontFamily: "Inter_700Bold" }}>{ci.userName?.charAt(0)?.toUpperCase() ?? "?"}</Text>
                  </View>
                ))}
                <Text style={{ fontSize: 11, color: theme.colors.muted, fontFamily: "Inter_500Medium", marginLeft: 6 }}>
                  {selectedVenue.currentCheckIns.length === 1 ? selectedVenue.currentCheckIns[0].userName : `${selectedVenue.currentCheckIns.length} people`}
                </Text>
              </View>
            )}

            {/* Photo Gallery */}
            {allPhotos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {allPhotos.map((url: string, idx: number) => (
                  <Image key={idx} source={{ uri: url }} style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: theme.colors.border }} contentFit="cover" transition={250} cachePolicy="memory-disk" />
                ))}
              </ScrollView>
            )}

            {/* v0.11.1 — Activity at this venue (events + playdates). Shown
                when the venue is linked to at least one upcoming item so
                users can tap a highlighted pin and see what's happening. */}
            {(selectedVenueEvents.length > 0 || selectedVenuePlaydates.length > 0) && (
              <View style={{ gap: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <Text
                  style={{
                    fontSize: 10,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: theme.colors.muted,
                    fontFamily: "Inter_700Bold",
                    paddingTop: 8
                  }}
                >
                  {t("discover.activityHere")}
                </Text>
                {selectedVenueEvents.map((event) => (
                  <Pressable
                    key={event.id}
                    onPress={() => handleRsvpPress(event.id)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: mobileTheme.radius.md,
                      backgroundColor: theme.colors.background,
                      opacity: pressed ? 0.85 : 1
                    })}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: theme.colors.accent + "22",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Calendar size={14} color={theme.colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 13,
                          color: theme.colors.ink,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {event.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: theme.colors.muted,
                          fontFamily: "Inter_500Medium",
                          marginTop: 1
                        }}
                      >
                        {t("discover.kindEvent")} · {formatDateShort(event.startsAt)}
                      </Text>
                    </View>
                    <ChevronDown
                      size={14}
                      color={theme.colors.muted}
                      style={{ transform: [{ rotate: "-90deg" }] }}
                    />
                  </Pressable>
                ))}
                {selectedVenuePlaydates.map((pd) => (
                  <Pressable
                    key={pd.id}
                    onPress={() =>
                      router.push({
                        pathname: "/(app)/playdates/[id]",
                        params: {
                          id: pd.id,
                          initialTitle: pd.title,
                          initialImage: pd.coverImageUrl ?? ""
                        }
                      } as any)
                    }
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: mobileTheme.radius.md,
                      backgroundColor: theme.colors.background,
                      opacity: pressed ? 0.85 : 1
                    })}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: theme.colors.primaryBg,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Users size={14} color={theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 13,
                          color: theme.colors.ink,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {pd.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: theme.colors.muted,
                          fontFamily: "Inter_500Medium",
                          marginTop: 1
                        }}
                      >
                        {t("discover.kindPlaydate")} · {formatDateShort(pd.date)}
                        {pd.maxPets > 0
                          ? ` · ${
                              typeof pd.slotsUsed === "number" && pd.slotsUsed > 0
                                ? pd.slotsUsed
                                : pd.attendees?.length ?? 0
                            }/${pd.maxPets}`
                          : ""}
                      </Text>
                    </View>
                    <ChevronDown
                      size={14}
                      color={theme.colors.muted}
                      style={{ transform: [{ rotate: "-90deg" }] }}
                    />
                  </Pressable>
                ))}
              </View>
            )}

            {/* Action buttons — View Details + Check In side by side */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => router.push(`/venue/${selectedVenue.id}`)}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 12,
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: theme.colors.primary,
                  backgroundColor: pressed ? theme.colors.primaryBg : "transparent"
                })}
              >
                <Text style={{ color: theme.colors.primary, fontFamily: "Inter_700Bold", fontSize: 13 }}>
                  {t("discover.viewDetails", "View Details")}
                </Text>
              </Pressable>

              {isCheckedIn ? (
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 20, backgroundColor: theme.colors.successBg }}>
                  <Check size={15} color={theme.colors.success} />
                  <Text style={{ color: theme.colors.success, fontFamily: "Inter_700Bold", fontSize: 13 }}>{t("discover.checkedInHere")}</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => handleCheckInPress(selectedVenue.id)}
                  disabled={checkInMutation.isPending}
                  style={({ pressed }) => ({
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 12,
                    borderRadius: 20,
                    backgroundColor: theme.colors.primary,
                    opacity: checkInMutation.isPending ? 0.5 : pressed ? 0.85 : 1
                  })}
                >
                  <Check size={15} color="#FFFFFF" />
                  <Text style={{ color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 13 }}>
                    {checkInMutation.isPending ? t("common.loading") : t("discover.checkIn")}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
        );
      })()}

      {/* ---------- Bottom Sheet ----------
          Powered by @gorhom/bottom-sheet — runs on Reanimated worklets so the
          drag is processed on the UI thread. BottomSheetScrollView wires the
          inner ScrollView's gesture into the sheet's pan, eliminating the
          PanResponder/ScrollView responder fight that caused the previous
          glitches. */}
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        onChange={handleSheetChange}
        bottomInset={tabBarOffset - 28}
        enableDynamicSizing={false}
        keyboardBehavior="interactive"
        animateOnMount={false}
        handleIndicatorStyle={{
          backgroundColor: theme.colors.border,
          width: 44,
          height: 5
        }}
        backgroundStyle={{
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -6 },
          elevation: 16
        }}
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -6 },
          elevation: 16
        }}
      >
        {/* Tab Switcher — stays pinned above the scrollable area. */}
        <View
          style={{
            flexDirection: "row",
            marginHorizontal: mobileTheme.spacing.xl,
            marginTop: 4,
            marginBottom: mobileTheme.spacing.md,
            backgroundColor: theme.colors.background,
            borderRadius: mobileTheme.radius.pill,
            padding: 3
          }}
        >
          <Pressable
            onPress={() => setActiveTab("venues")}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: mobileTheme.spacing.sm + 1,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor:
                activeTab === "venues" ? theme.colors.primary : "transparent",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed && activeTab !== "venues" ? 0.7 : 1
            })}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.caption.fontSize,
                fontWeight: "700",
                color:
                  activeTab === "venues" ? "#FFFFFF" : theme.colors.muted,
                fontFamily: "Inter_700Bold"
              }}
            >
              {t("discover.venues")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("events")}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: mobileTheme.spacing.sm + 1,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor:
                activeTab === "events" ? theme.colors.primary : "transparent",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed && activeTab !== "events" ? 0.7 : 1
            })}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.caption.fontSize,
                fontWeight: "700",
                color:
                  activeTab === "events" ? "#FFFFFF" : theme.colors.muted,
                fontFamily: "Inter_700Bold"
              }}
            >
              {t("discover.events")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("vets")}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: mobileTheme.spacing.sm + 1,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor:
                activeTab === "vets" ? theme.colors.primary : "transparent",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed && activeTab !== "vets" ? 0.7 : 1
            })}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.caption.fontSize,
                fontWeight: "700",
                color:
                  activeTab === "vets" ? "#FFFFFF" : theme.colors.muted,
                fontFamily: "Inter_700Bold"
              }}
            >
              {t("discover.vets")}
            </Text>
          </Pressable>
        </View>

        {/* Sheet Content — BottomSheetScrollView ensures the scroll-to-pan
            handoff happens on the UI thread without responder conflicts. */}
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
            />
          }
          contentContainerStyle={{
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingBottom: mobileTheme.spacing["3xl"]
          }}
        >
          {activeTab === "venues" ? (
            <VenuesTab
              venues={mapVenues}
              selectedVenueId={selectedVenueId}
              onVenuePress={focusVenue}
              onOpenDetail={(id) => router.push(`/venue/${id}`)}
              onCheckIn={handleCheckInPress}
              checkInPending={checkInMutation.isPending}
              selectedVenuePhotos={venuePhotos}
            />
          ) : activeTab === "events" ? (
            <EventsTab
              events={events}
              playdates={feedPlaydates}
              onRsvp={handleRsvpPress}
              rsvpPending={rsvpMutation.isPending}
              userId={session?.user?.id}
              onOpenPlaydate={(p) =>
                router.push({
                  pathname: "/(app)/playdates/[id]",
                  params: {
                    id: p.id,
                    initialTitle: p.title,
                    initialImage: p.coverImageUrl ?? ""
                  }
                } as any)
              }
            />
          ) : (
            <VetsTab clinics={vetClinics} />
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

/* ================================================================== */
/*  Venues Tab                                                         */
/* ================================================================== */

function VenuesTab({
  venues,
  selectedVenueId,
  onVenuePress,
  onOpenDetail,
  onCheckIn,
  checkInPending,
  selectedVenuePhotos
}: {
  venues: Array<{
    id: string;
    name: string;
    address: string;
    category: string;
    description?: string;
    hours?: string;
    imageUrl?: string | null;
    currentCheckIns: Array<{
      userId: string;
      userName: string;
      avatarUrl?: string | null;
      petNames: string[];
      checkedInAt: string;
    }>;
  }>;
  selectedVenueId: string | null;
  onVenuePress: (id: string) => void;
  /** Navigate to the full venue detail page (tapping a gallery thumb). */
  onOpenDetail: (id: string) => void;
  onCheckIn: (id: string) => void;
  checkInPending: boolean;
  /** Photo urls for the currently-selected venue, fetched by the parent via
   *  /v1/venues/{id}/photos. Already includes cover + admin-curated + non-hidden
   *  tagged post photos in the order the server returns them. */
  selectedVenuePhotos: string[];
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  if (venues.length === 0) {
    return (
      <View
        style={{
          padding: mobileTheme.spacing["2xl"],
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: "center",
          gap: mobileTheme.spacing.sm,
          marginTop: mobileTheme.spacing.sm
        }}
      >
        <MapPin size={24} color={theme.colors.muted} />
        <Text
          style={{
            color: theme.colors.muted,
            fontSize: mobileTheme.typography.body.fontSize,
            lineHeight: mobileTheme.typography.body.lineHeight,
            textAlign: "center",
            fontFamily: "Inter_400Regular"
          }}
        >
          {t("discover.noVenues")}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: mobileTheme.spacing.md }}>
      {venues.map((venue) => {
        const isSelected = selectedVenueId === venue.id;
        const color = getCategoryColor(venue.category);
        const Icon = getCategoryIcon(venue.category);
        const checkIns = venue.currentCheckIns.length;
        const todayStatus = getTodayStatus(venue.hours);

        return (
          <View
            key={venue.id}
            style={{
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: isSelected
                ? theme.colors.primaryBg
                : theme.colors.surface,
              borderWidth: isSelected ? 1.5 : 1,
              borderColor: isSelected
                ? theme.colors.primary
                : theme.colors.border,
              overflow: "hidden",
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 1
            }}
          >
            {/* Hero image with category chip overlay. Wrapped in a Pressable
                so tapping the photo opens the venue popup — the row below has
                a nested check-in button, so the image is the primary hit
                target for "view details". */}
            {venue.imageUrl ? (
              <Pressable
                onPress={() => onVenuePress(venue.id)}
                style={({ pressed }) => ({
                  position: "relative",
                  opacity: pressed ? 0.92 : 1
                })}
              >
                <Image
                  source={{ uri: venue.imageUrl }}
                  style={{ width: "100%", height: 140, backgroundColor: theme.colors.border }}
                  contentFit="cover"
                  transition={250}
                  cachePolicy="memory-disk"
                />
                {/* Category chip */}
                <View style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingHorizontal: 9,
                  paddingVertical: 5,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: "rgba(0,0,0,0.55)"
                }}>
                  <Icon size={11} color="#FFFFFF" />
                  <Text style={{ fontSize: 10.5, fontFamily: "Inter_700Bold", color: "#FFFFFF", textTransform: "capitalize", letterSpacing: 0.3 }}>
                    {venue.category}
                  </Text>
                </View>
                {/* Open-now status chip */}
                <View style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  paddingHorizontal: 9,
                  paddingVertical: 5,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: todayStatus.open ? "rgba(52, 168, 83, 0.95)" : "rgba(0,0,0,0.55)"
                }}>
                  <Text style={{ fontSize: 10.5, fontFamily: "Inter_700Bold", color: "#FFFFFF", letterSpacing: 0.3 }}>
                    {todayStatus.label}
                  </Text>
                </View>
                {/* Live check-ins badge on image */}
                {checkIns > 0 && (
                  <View style={{
                    position: "absolute",
                    bottom: 10,
                    left: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: mobileTheme.radius.pill,
                    backgroundColor: theme.colors.primary
                  }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#FFFFFF" }} />
                    <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#FFFFFF" }}>
                      {checkIns} {checkIns === 1 ? "here" : "here"}
                    </Text>
                  </View>
                )}
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => onVenuePress(venue.id)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: mobileTheme.spacing.md,
                paddingVertical: mobileTheme.spacing.md,
                paddingHorizontal: mobileTheme.spacing.lg,
                opacity: pressed ? 0.9 : 1
              })}
            >
              {/* Category icon circle */}
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: color,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Icon size={14} color="#FFFFFF" />
              </View>

              {/* Venue info */}
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                    fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                    color: theme.colors.ink,
                    fontFamily: "Inter_600SemiBold"
                  }}
                >
                  {venue.name}
                </Text>
                {venue.address ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: mobileTheme.typography.caption.fontSize,
                      color: theme.colors.muted,
                      fontFamily: "Inter_400Regular"
                    }}
                  >
                    {venue.address}
                  </Text>
                ) : null}
              </View>

              {/* Check-in count */}
              {checkIns > 0 && (
                <View
                  style={{
                    backgroundColor: theme.colors.primaryBg,
                    borderRadius: mobileTheme.radius.pill,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    marginRight: 4
                  }}
                >
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.micro.fontSize,
                      fontWeight: "700",
                      color: theme.colors.primary,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    {checkIns}
                  </Text>
                </View>
              )}

              {/* Check-in button */}
              <Pressable
                onPress={() => onCheckIn(venue.id)}
                disabled={checkInPending}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: mobileTheme.radius.pill,
                  borderWidth: 1,
                  borderColor: theme.colors.borderStrong,
                  opacity: checkInPending ? 0.5 : pressed ? 0.7 : 1
                })}
              >
                <Text
                  style={{
                    fontSize: mobileTheme.typography.micro.fontSize,
                    fontWeight: "600",
                    color: theme.colors.secondary,
                    fontFamily: "Inter_600SemiBold"
                  }}
                >
                  {t("discover.checkIn")}
                </Text>
              </Pressable>
            </Pressable>

            {/* Venue details - shown when venue is selected */}
            {isSelected && (
              <View
                style={{
                  paddingHorizontal: mobileTheme.spacing.lg,
                  paddingBottom: mobileTheme.spacing.md,
                  gap: mobileTheme.spacing.sm
                }}
              >
                <View style={{ height: 1, backgroundColor: theme.colors.border, marginBottom: mobileTheme.spacing.xs }} />

                {/* Category + Hours */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing.sm }}>
                  <View style={{ backgroundColor: `${color}20`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: mobileTheme.radius.pill }}>
                    <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontFamily: "Inter_600SemiBold", color, textTransform: "capitalize" }}>
                      {venue.category}
                    </Text>
                  </View>
                  {venue.hours ? (
                    <View style={{ backgroundColor: theme.colors.successBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: mobileTheme.radius.pill }}>
                      <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontFamily: "Inter_600SemiBold", color: theme.colors.success }}>
                        {venue.hours}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Description */}
                {venue.description ? (
                  <Text style={{ fontSize: mobileTheme.typography.body.fontSize, fontFamily: "Inter_400Regular", color: theme.colors.muted, lineHeight: 20 }} numberOfLines={3}>
                    {venue.description}
                  </Text>
                ) : null}

                {/* Horizontal photo strip. When this venue is selected we
                    fetch its full gallery via /v1/venues/{id}/photos — the
                    server already includes cover + admin-curated + non-hidden
                    tagged posts, so the caller just renders whatever comes
                    back. Tap any thumb to open the full venue detail page. */}
                {(() => {
                  // v0.13.7 — strip is post-only. Cover is rendered as the
                  // card hero above (line ~1697); duplicating it here was the
                  // visible "kapak fotosu galeride yine cikiyor" bug. If the
                  // venue has no tagged-post photos, the strip just doesn't
                  // render — hero alone is enough.
                  const strip = isSelected ? selectedVenuePhotos : [];
                  if (strip.length === 0) return null;
                  return (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingRight: 4 }}
                    >
                      {strip.map((url, idx) => (
                        <Pressable
                          key={`${url}-${idx}`}
                          onPress={() => onOpenDetail(venue.id)}
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.88 : 1,
                            borderRadius: mobileTheme.radius.md,
                            overflow: "hidden"
                          })}
                        >
                          <Image
                            source={{ uri: url }}
                            style={{
                              width: 160,
                              height: 120,
                              backgroundColor: theme.colors.border
                            }}
                            contentFit="cover"
                            transition={250}
                            cachePolicy="memory-disk"
                          />
                        </Pressable>
                      ))}
                    </ScrollView>
                  );
                })()}
              </View>
            )}

            {/* People here section - shown when venue is selected */}
            {isSelected && checkIns > 0 && (
              <View
                style={{
                  paddingHorizontal: mobileTheme.spacing.lg,
                  paddingBottom: mobileTheme.spacing.md,
                  gap: mobileTheme.spacing.sm
                }}
              >
                <View
                  style={{
                    height: 1,
                    backgroundColor: theme.colors.border,
                    marginBottom: mobileTheme.spacing.xs
                  }}
                />
                <Text
                  style={{
                    fontSize: mobileTheme.typography.micro.fontSize,
                    fontWeight: "700",
                    color: theme.colors.muted,
                    fontFamily: "Inter_700Bold",
                    textTransform: "uppercase",
                    letterSpacing: 1.2
                  }}
                >
                  {t("discover.peopleHere")}
                </Text>
                {venue.currentCheckIns.map((checkIn, idx) => (
                  <View
                    key={checkIn.userId || idx}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: mobileTheme.spacing.sm,
                      paddingVertical: 3
                    }}
                  >
                    {checkIn.avatarUrl ? (
                      <Image
                        source={{ uri: checkIn.avatarUrl }}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: theme.colors.border
                        }}
                        contentFit="cover"
                        transition={250}
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: theme.colors.primarySoft,
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "700",
                            color: theme.colors.primary,
                            fontFamily: "Inter_700Bold"
                          }}
                        >
                          {checkIn.userName?.charAt(0)?.toUpperCase() ?? "?"}
                        </Text>
                      </View>
                    )}
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.caption.fontSize,
                        fontWeight: "600",
                        color: theme.colors.ink,
                        fontFamily: "Inter_600SemiBold"
                      }}
                      numberOfLines={1}
                    >
                      {checkIn.userName}
                    </Text>
                    {checkIn.petNames && checkIn.petNames.length > 0 && (
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.micro.fontSize,
                          color: theme.colors.muted,
                          fontFamily: "Inter_400Regular"
                        }}
                        numberOfLines={1}
                      >
                        with {checkIn.petNames.join(", ")}
                      </Text>
                    )}
                    {checkIn.checkedInAt ? (
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.micro.fontSize,
                          color: theme.colors.muted,
                          fontFamily: "Inter_400Regular",
                          marginLeft: "auto"
                        }}
                      >
                        {new Date(checkIn.checkedInAt).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit"
                        })}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/* ================================================================== */
/*  Events Tab                                                         */
/* ================================================================== */

type FeedItem =
  | {
      kind: "event";
      id: string;
      startsAt: string;
      event: {
        id: string;
        title: string;
        description?: string;
        startsAt: string;
        attendeeCount: number;
        petFocus: string;
        audience: string;
        venueName?: string;
        attendees?: Array<{ userId: string }>;
      };
    }
  | {
      kind: "playdate";
      id: string;
      startsAt: string;
      playdate: Playdate;
    };

function EventsTab({
  events,
  playdates,
  onRsvp,
  rsvpPending,
  userId,
  onOpenPlaydate
}: {
  events: Array<{
    id: string;
    title: string;
    description?: string;
    startsAt: string;
    attendeeCount: number;
    petFocus: string;
    audience: string;
    venueName?: string;
    attendees?: Array<{ userId: string }>;
  }>;
  playdates: Playdate[];
  onRsvp: (id: string) => void;
  rsvpPending: boolean;
  userId?: string;
  onOpenPlaydate: (p: Playdate) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  // v0.11.0 — merge admin events + user playdates into one date-sorted feed
  // so the Events tab is the one place users go to find "what's happening".
  const items: FeedItem[] = useMemo(() => {
    const eventItems: FeedItem[] = events.map((e) => ({
      kind: "event",
      id: `event-${e.id}`,
      startsAt: e.startsAt,
      event: e
    }));
    const playdateItems: FeedItem[] = playdates.map((p) => ({
      kind: "playdate",
      id: `playdate-${p.id}`,
      startsAt: p.date,
      playdate: p
    }));
    return [...eventItems, ...playdateItems].sort((a, b) =>
      (a.startsAt || "").localeCompare(b.startsAt || "")
    );
  }, [events, playdates]);

  if (items.length === 0) {
    return (
      <View
        style={{
          padding: mobileTheme.spacing["2xl"],
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: "center",
          gap: mobileTheme.spacing.sm,
          marginTop: mobileTheme.spacing.sm
        }}
      >
        <Calendar size={24} color={theme.colors.muted} />
        <Text
          style={{
            color: theme.colors.muted,
            fontSize: mobileTheme.typography.body.fontSize,
            lineHeight: mobileTheme.typography.body.lineHeight,
            textAlign: "center",
            fontFamily: "Inter_400Regular"
          }}
        >
          {t("discover.noVenues")}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: mobileTheme.spacing.md }}>
      {items.map((item) => {
        if (item.kind === "playdate") {
          return (
            <PlaydateFeedCard
              key={item.id}
              playdate={item.playdate}
              onPress={() => onOpenPlaydate(item.playdate)}
            />
          );
        }
        const event = item.event;
        const hasJoined =
          userId && event.attendees
            ? event.attendees.some((a) => a.userId === userId)
            : false;

        return (
          <View
            key={item.id}
            style={{
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: mobileTheme.spacing.lg,
              gap: mobileTheme.spacing.md,
              ...mobileTheme.shadow.sm
            }}
          >
            {/* v0.11.0 — kind chip so users can tell admin events apart
                from user-created playdates at a glance. */}
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: theme.colors.accent + "22",
                borderRadius: mobileTheme.radius.pill,
                paddingHorizontal: 10,
                paddingVertical: 3
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: theme.colors.accent,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {t("discover.kindEvent")}
              </Text>
            </View>
            {/* Date pill + Title */}
            <View style={{ gap: mobileTheme.spacing.sm }}>
              <View
                style={{
                  alignSelf: "flex-start",
                  backgroundColor: theme.colors.primary,
                  borderRadius: mobileTheme.radius.pill,
                  paddingHorizontal: 10,
                  paddingVertical: 4
                }}
              >
                <Text
                  style={{
                    fontSize: mobileTheme.typography.micro.fontSize,
                    fontWeight: "700",
                    color: "#FFFFFF",
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {formatDateShort(event.startsAt)}
                </Text>
              </View>

              <Text
                numberOfLines={1}
                style={{
                  fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                  fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {event.title}
              </Text>

              {event.description ? (
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: mobileTheme.typography.body.fontSize,
                    lineHeight: mobileTheme.typography.body.lineHeight,
                    color: theme.colors.muted,
                    fontFamily: "Inter_400Regular"
                  }}
                >
                  {event.description}
                </Text>
              ) : null}
            </View>

            {/* Bottom row: attendees, petFocus, join button */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: mobileTheme.spacing.sm
              }}
            >
              <Users size={13} color={theme.colors.muted} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.micro.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium"
                }}
              >
                {t("discover.attendeesGoing", { count: event.attendeeCount })}
              </Text>

              <View
                style={{
                  backgroundColor: theme.colors.secondarySoft,
                  borderRadius: mobileTheme.radius.pill,
                  paddingHorizontal: 8,
                  paddingVertical: 2
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "600",
                    color: theme.colors.secondary,
                    fontFamily: "Inter_600SemiBold"
                  }}
                >
                  {formatLabel(event.petFocus)}
                </Text>
              </View>

              <View style={{ flex: 1 }} />

              {hasJoined ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor: theme.colors.successBg,
                    borderRadius: mobileTheme.radius.pill,
                    paddingHorizontal: 12,
                    paddingVertical: 6
                  }}
                >
                  <Check size={12} color={theme.colors.success} />
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.micro.fontSize,
                      fontWeight: "700",
                      color: theme.colors.success,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    {t("discover.rsvpSuccess")}
                  </Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => onRsvp(event.id)}
                  disabled={rsvpPending}
                  style={({ pressed }) => ({
                    backgroundColor: theme.colors.primary,
                    borderRadius: mobileTheme.radius.pill,
                    paddingHorizontal: 16,
                    paddingVertical: 7,
                    opacity: rsvpPending ? 0.5 : pressed ? 0.85 : 1
                  })}
                >
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.micro.fontSize,
                      fontWeight: "700",
                      color: "#FFFFFF",
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    {t("common.join")}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ================================================================== */
/*  Playdate Feed Card — used by EventsTab for user-created playdates  */
/* ================================================================== */
// v0.11.0 — a compact, brand-consistent card that matches the event card
// footprint so the merged feed reads cleanly. Tapping opens the playdate
// detail page (passed through from DiscoverPage via `onOpenPlaydate`).
function PlaydateFeedCard({
  playdate,
  onPress
}: {
  playdate: Playdate;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const slotsUsed =
    typeof playdate.slotsUsed === "number" && playdate.slotsUsed > 0
      ? playdate.slotsUsed
      : playdate.attendees?.length ?? 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: mobileTheme.radius.lg,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: mobileTheme.spacing.lg,
        gap: mobileTheme.spacing.md,
        opacity: pressed ? 0.92 : 1,
        ...mobileTheme.shadow.sm
      })}
    >
      <View
        style={{
          alignSelf: "flex-start",
          backgroundColor: theme.colors.primaryBg,
          borderRadius: mobileTheme.radius.pill,
          paddingHorizontal: 10,
          paddingVertical: 3
        }}
      >
        <Text
          style={{
            fontSize: 9,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: theme.colors.primary,
            fontFamily: "Inter_700Bold"
          }}
        >
          {t("discover.kindPlaydate")}
        </Text>
      </View>
      <View style={{ gap: 6 }}>
        <View
          style={{
            alignSelf: "flex-start",
            backgroundColor: theme.colors.primary,
            borderRadius: mobileTheme.radius.pill,
            paddingHorizontal: 10,
            paddingVertical: 4
          }}
        >
          <Text
            style={{
              fontSize: mobileTheme.typography.micro.fontSize,
              color: "#FFFFFF",
              fontFamily: "Inter_700Bold"
            }}
          >
            {formatDateShort(playdate.date)}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={{
            fontSize: mobileTheme.typography.bodySemiBold.fontSize,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          {playdate.title}
        </Text>
        {playdate.cityLabel || playdate.location ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              color: theme.colors.muted,
              fontFamily: "Inter_500Medium"
            }}
          >
            {playdate.cityLabel || playdate.location}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.sm
        }}
      >
        <Users size={13} color={theme.colors.muted} />
        <Text
          style={{
            fontSize: mobileTheme.typography.micro.fontSize,
            color: theme.colors.muted,
            fontFamily: "Inter_500Medium"
          }}
        >
          {slotsUsed}
          {playdate.maxPets > 0 ? ` / ${playdate.maxPets}` : ""}
        </Text>
      </View>
    </Pressable>
  );
}

/* ================================================================== */
/*  Vets Tab                                                           */
/* ================================================================== */

function VetsTab({
  clinics
}: {
  clinics: Array<{
    id: string;
    name: string;
    phone: string;
    address: string;
    isEmergency: boolean;
    hours?: string;
    distance?: number;
  }>;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  if (clinics.length === 0) {
    return (
      <View
        style={{
          padding: mobileTheme.spacing["2xl"],
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: "center",
          gap: mobileTheme.spacing.sm,
          marginTop: mobileTheme.spacing.sm
        }}
      >
        <Stethoscope size={24} color={theme.colors.muted} />
        <Text
          style={{
            color: theme.colors.muted,
            fontSize: mobileTheme.typography.body.fontSize,
            lineHeight: mobileTheme.typography.body.lineHeight,
            textAlign: "center",
            fontFamily: "Inter_400Regular"
          }}
        >
          {t("vets.noClinics")}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: mobileTheme.spacing.md }}>
      {clinics.map((clinic) => (
        <View
          key={clinic.id}
          style={{
            borderRadius: mobileTheme.radius.lg,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: mobileTheme.spacing.lg,
            gap: mobileTheme.spacing.sm
          }}
        >
          {/* Header row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: mobileTheme.spacing.md
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: "#A14632",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Stethoscope size={14} color="#FFFFFF" />
            </View>

            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: mobileTheme.spacing.sm }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                    fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                    color: theme.colors.ink,
                    fontFamily: "Inter_600SemiBold",
                    flex: 1
                  }}
                >
                  {clinic.name}
                </Text>
                {clinic.isEmergency && (
                  <View
                    style={{
                      backgroundColor: "#FEF3C7",
                      borderRadius: mobileTheme.radius.pill,
                      paddingHorizontal: 8,
                      paddingVertical: 2
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "700",
                        color: "#D97706",
                        fontFamily: "Inter_700Bold"
                      }}
                    >
                      {t("vets.emergency")}
                    </Text>
                  </View>
                )}
              </View>
              {clinic.address ? (
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    color: theme.colors.muted,
                    fontFamily: "Inter_400Regular"
                  }}
                >
                  {clinic.address}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Distance + Hours */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing.sm }}>
            {clinic.distance != null && clinic.distance > 0 && (
              <View
                style={{
                  backgroundColor: theme.colors.primaryBg,
                  borderRadius: mobileTheme.radius.pill,
                  paddingHorizontal: 8,
                  paddingVertical: 3
                }}
              >
                <Text
                  style={{
                    fontSize: mobileTheme.typography.micro.fontSize,
                    fontFamily: "Inter_600SemiBold",
                    color: theme.colors.primary
                  }}
                >
                  {clinic.distance < 1
                    ? `${Math.round(clinic.distance * 1000)}m`
                    : `${clinic.distance.toFixed(1)}km`}
                </Text>
              </View>
            )}
            {clinic.hours ? (
              <View
                style={{
                  backgroundColor: theme.colors.successBg,
                  borderRadius: mobileTheme.radius.pill,
                  paddingHorizontal: 8,
                  paddingVertical: 3
                }}
              >
                <Text
                  style={{
                    fontSize: mobileTheme.typography.micro.fontSize,
                    fontFamily: "Inter_600SemiBold",
                    color: theme.colors.success
                  }}
                >
                  {clinic.hours}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Call button */}
          {clinic.phone ? (
            <Pressable
              onPress={() => {
                const Linking = require("react-native").Linking;
                Linking.openURL(`tel:${clinic.phone}`);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: mobileTheme.spacing.sm,
                paddingVertical: mobileTheme.spacing.sm,
                borderRadius: mobileTheme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.borderStrong,
                opacity: pressed ? 0.7 : 1
              })}
            >
              <Phone size={14} color={theme.colors.secondary} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.micro.fontSize,
                  fontWeight: "600",
                  color: theme.colors.secondary,
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                {clinic.phone}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}
