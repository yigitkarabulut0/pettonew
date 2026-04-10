import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { LottieLoading } from "@/components/lottie-loading";
import MapView, { Marker, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

import { Avatar } from "@/components/avatar";
import { PrimaryButton } from "@/components/primary-button";
import {
  checkInVenue,
  listExploreEvents,
  listExploreVenues,
  listMyPets,
  listVetClinics,
  rsvpEvent
} from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const { height: WINDOW_HEIGHT } = Dimensions.get("window");
const COLLAPSED_SHEET = 180;
const EXPANDED_SHEET = Math.round(WINDOW_HEIGHT * 0.65);
const SHEET_TRAVEL = EXPANDED_SHEET - COLLAPSED_SHEET;

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

/* ------------------------------------------------------------------ */
/*  Pin Marker (circle style)                                          */
/* ------------------------------------------------------------------ */

interface PinMarkerProps {
  selected: boolean;
  checkInCount: number;
  category: string;
}

const PinMarker = React.memo(function PinMarker({
  selected,
  checkInCount,
  category
}: PinMarkerProps) {
  const color = getCategoryColor(category);
  const Icon = getCategoryIcon(category);
  const size = selected ? 44 : 36;

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
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

      {checkInCount > 0 && (
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
      )}
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
  onSelect
}: {
  venues: MarkerVenue[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {venues.map((venue) => {
        const isSelected = selectedId === venue.id;
        return (
          <Marker
            key={venue.id}
            coordinate={{
              latitude: venue.latitude,
              longitude: venue.longitude
            }}
            tracksViewChanges={isSelected}
            onPress={() => onSelect(venue.id)}
          >
            <PinMarker
              selected={isSelected}
              checkInCount={venue.currentCheckIns.length}
              category={venue.category}
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
  const theme = useTheme();
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapView | null>(null);
  const sheetAnim = useRef(new Animated.Value(SHEET_TRAVEL)).current;
  const dragStart = useRef(SHEET_TRAVEL);
  const dragCurrent = useRef(SHEET_TRAVEL);

  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"venues" | "events" | "vets">("venues");
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [petPickerOpen, setPetPickerOpen] = useState(false);
  const [petPickerVenueId, setPetPickerVenueId] = useState<string | null>(null);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const tabBarOffset = insets.bottom + 82;

  /* ---- Queries ---- */

  const {
    data: venues = [],
    refetch: refetchVenues,
    isRefetching: venuesRefetching,
    isLoading: venuesLoading
  } = useQuery({
    queryKey: ["explore-venues", session?.tokens.accessToken, userLocation?.latitude, userLocation?.longitude],
    queryFn: () => listExploreVenues(session!.tokens.accessToken, userLocation?.latitude, userLocation?.longitude),
    enabled: Boolean(session)
  });

  const {
    data: events = [],
    refetch: refetchEvents,
    isRefetching: eventsRefetching,
    isLoading: eventsLoading
  } = useQuery({
    queryKey: ["explore-events", session?.tokens.accessToken],
    queryFn: () => listExploreEvents(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const { data: pets = [] } = useQuery({
    queryKey: ["discover-my-pets", session?.tokens.accessToken],
    queryFn: () => listMyPets(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const { data: vetClinics = [] } = useQuery({
    queryKey: ["vet-clinics-discover", session?.tokens.accessToken, userLocation?.latitude],
    queryFn: () => listVetClinics(session!.tokens.accessToken, userLocation?.latitude ?? 0, userLocation?.longitude ?? 0),
    enabled: Boolean(session) && Boolean(userLocation)
  });

  /* ---- Location ---- */

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude
        });
        if (mapRef.current && loc) {
          mapRef.current.animateToRegion({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05
          }, 500);
        }
      }
    })();
  }, []);

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

  const userCheckedInVenueId = useMemo(() => {
    const uid = session?.user?.id;
    if (!uid) return null;
    for (const v of mapVenues) {
      if (v.currentCheckIns.some((ci: any) => ci.userId === uid)) return v.id;
    }
    return null;
  }, [mapVenues, session?.user?.id]);

  const { data: venuePhotos = [] } = useQuery({
    queryKey: ["venue-photos", selectedVenueId, session?.tokens.accessToken],
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
    enabled: Boolean(selectedVenueId) && Boolean(session)
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
      showToast("Checked in!");
      queryClient.invalidateQueries({
        queryKey: ["explore-venues", session?.tokens.accessToken]
      });
    },
    onError: (error) => {
      showToast(
        error instanceof Error ? error.message : "Unable to check in."
      );
    }
  });

  const rsvpMutation = useMutation({
    mutationFn: (eventId: string) =>
      rsvpEvent(session!.tokens.accessToken, eventId, primaryPetIds),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("You're on the list!");
      queryClient.invalidateQueries({
        queryKey: ["explore-events", session?.tokens.accessToken]
      });
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : "Unable to join.");
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

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: sheetExpanded ? 0 : SHEET_TRAVEL,
      tension: 68,
      friction: 12,
      useNativeDriver: true
    }).start();
  }, [sheetExpanded, sheetAnim]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dy) > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
        onPanResponderGrant: () => {
          sheetAnim.stopAnimation((val) => {
            dragStart.current = val;
          });
        },
        onPanResponderMove: (_, gs) => {
          const next = Math.max(
            0,
            Math.min(SHEET_TRAVEL, dragStart.current + gs.dy)
          );
          dragCurrent.current = next;
          sheetAnim.setValue(next);
        },
        onPanResponderRelease: (_, gs) => {
          const projected = Math.max(
            0,
            Math.min(SHEET_TRAVEL, dragStart.current + gs.dy)
          );
          dragCurrent.current = projected;
          const shouldExpand = gs.dy < -30 || projected < SHEET_TRAVEL / 2;
          setSheetExpanded(shouldExpand);
        },
        onPanResponderTerminate: () => {
          setSheetExpanded(dragCurrent.current < SHEET_TRAVEL / 2);
        }
      }),
    [sheetAnim]
  );

  /* ---- Map interactions ---- */

  const focusVenue = useCallback(
    (venueId: string) => {
      const venue = mapVenues.find((v) => v.id === venueId);
      if (!venue) return;
      setSelectedVenueId(venue.id);
      setSheetExpanded(false);
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
        showToast("Add a pet first to check in.");
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
        showToast("Add a pet first to join.");
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
          />
        ) : activeTab === "events" ? (
          <>
            {events.filter((e: any) => e.venueId).map((event: any) => {
              const venue = mapVenues.find((v) => v.id === event.venueId);
              if (!venue) return null;
              return (
                <Marker
                  key={event.id}
                  coordinate={{ latitude: venue.latitude, longitude: venue.longitude }}
                >
                  <View style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: theme.colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.12,
                    shadowRadius: 4,
                    elevation: 4
                  }}>
                    <Calendar size={16} color="#FFFFFF" />
                  </View>
                </Marker>
              );
            })}
          </>
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
          Discover
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
                Check in with
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
                label="Confirm Check-in"
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
                  Select at least one pet to check in.
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
        const allPhotos = [
          ...(selectedVenue.imageUrl ? [selectedVenue.imageUrl] : []),
          ...venuePhotos
        ];
        return (
        <View style={{ position: "absolute", left: 12, right: 12, bottom: tabBarOffset + COLLAPSED_SHEET + 8, borderRadius: 20, backgroundColor: theme.colors.white, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 20, overflow: "hidden" }}>
          {/* Hero Image */}
          {selectedVenue.imageUrl ? (
            <Image source={{ uri: selectedVenue.imageUrl }} style={{ width: "100%", height: 140, backgroundColor: theme.colors.border }} resizeMode="cover" />
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
                  <Image key={idx} source={{ uri: url }} style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: theme.colors.border }} resizeMode="cover" />
                ))}
              </ScrollView>
            )}

            {/* Action buttons */}
            {isCheckedIn ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 20, backgroundColor: theme.colors.successBg }}>
                  <Check size={15} color={theme.colors.success} />
                  <Text style={{ color: theme.colors.success, fontFamily: "Inter_700Bold", fontSize: 13 }}>Checked in</Text>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => handleCheckInPress(selectedVenue.id)} disabled={checkInMutation.isPending} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 20, backgroundColor: theme.colors.primary, opacity: checkInMutation.isPending ? 0.5 : pressed ? 0.85 : 1 })}>
                <Check size={15} color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 13 }}>{checkInMutation.isPending ? "Checking in..." : "Check in here"}</Text>
              </Pressable>
            )}
          </View>
        </View>
        );
      })()}

      {/* ---------- Bottom Sheet ---------- */}
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: tabBarOffset - 28,
          height: EXPANDED_SHEET,
          transform: [{ translateY: sheetAnim }]
        }}
      >
        <View
          style={{
            flex: 1,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            backgroundColor: theme.colors.surface,
            shadowColor: "#000",
            shadowOpacity: 0.08,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: -6 },
            elevation: 16
          }}
        >
          {/* Drag handle */}
          <View
            {...panResponder.panHandlers}
            style={{
              alignItems: "center",
              paddingTop: 12,
              paddingBottom: 8
            }}
          >
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: "rgba(22,21,20,0.15)"
              }}
            />
          </View>

          {/* Tab Switcher */}
          <View
            style={{
              flexDirection: "row",
              marginHorizontal: mobileTheme.spacing.xl,
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
                    activeTab === "venues"
                      ? "#FFFFFF"
                      : theme.colors.muted,
                  fontFamily: "Inter_700Bold"
                }}
              >
                Venues
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
                    activeTab === "events"
                      ? "#FFFFFF"
                      : theme.colors.muted,
                  fontFamily: "Inter_700Bold"
                }}
              >
                Events
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
                    activeTab === "vets"
                      ? "#FFFFFF"
                      : theme.colors.muted,
                  fontFamily: "Inter_700Bold"
                }}
              >
                Vets
              </Text>
            </Pressable>
          </View>

          {/* Sheet Content */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            scrollEnabled={sheetExpanded}
            refreshControl={
              <RefreshControl
                refreshing={
                  activeTab === "venues" ? venuesRefetching : eventsRefetching
                }
                onRefresh={
                  activeTab === "venues" ? refetchVenues : activeTab === "events" ? refetchEvents : refetchVenues
                }
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
                onCheckIn={handleCheckInPress}
                checkInPending={checkInMutation.isPending}
              />
            ) : activeTab === "events" ? (
              <EventsTab
                events={events}
                onRsvp={handleRsvpPress}
                rsvpPending={rsvpMutation.isPending}
                userId={session?.user?.id}
              />
            ) : (
              <VetsTab clinics={vetClinics} />
            )}
          </ScrollView>
        </View>
      </Animated.View>
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
  onCheckIn,
  checkInPending
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
  onCheckIn: (id: string) => void;
  checkInPending: boolean;
}) {
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
          No venues found nearby. Check back soon!
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
              overflow: "hidden"
            }}
          >
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
                  Check in
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

                {/* Venue image */}
                {venue.imageUrl ? (
                  <Image
                    source={{ uri: venue.imageUrl }}
                    style={{ width: "100%", height: 120, borderRadius: mobileTheme.radius.md, backgroundColor: theme.colors.border }}
                    resizeMode="cover"
                  />
                ) : null}
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
                  People here
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

function EventsTab({
  events,
  onRsvp,
  rsvpPending,
  userId
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
  onRsvp: (id: string) => void;
  rsvpPending: boolean;
  userId?: string;
}) {
  const theme = useTheme();

  if (events.length === 0) {
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
          No upcoming events. Check back soon!
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: mobileTheme.spacing.md }}>
      {events.map((event) => {
        const hasJoined =
          userId && event.attendees
            ? event.attendees.some((a) => a.userId === userId)
            : false;

        return (
          <View
            key={event.id}
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
                {event.attendeeCount} going
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
                    Joined
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
                    Join
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
          No vet clinics found nearby. Check back soon!
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
                      Emergency
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
