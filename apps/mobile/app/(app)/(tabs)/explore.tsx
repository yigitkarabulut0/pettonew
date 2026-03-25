import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Calendar,
  Check,
  ChevronDown,
  LocateFixed,
  MapPin,
  X
} from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { PrimaryButton } from "@/components/primary-button";
import {
  checkInVenue,
  listExploreEvents,
  listExploreVenues,
  listMyPets,
  rsvpEvent
} from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const WINDOW_HEIGHT = Dimensions.get("window").height;
const COLLAPSED_SHEET = 180;
const EXPANDED_SHEET = Math.min(540, Math.round(WINDOW_HEIGHT * 0.65));
const SHEET_TRAVEL = EXPANDED_SHEET - COLLAPSED_SHEET;

function formatLabel(value: string) {
  return value
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function PinMarker({ selected, count }: { selected: boolean; count: number }) {
  return (
    <View style={{ alignItems: "center" }}>
      <View
        style={{
          width: selected ? 40 : 36,
          height: selected ? 40 : 36,
          borderRadius: 20,
          backgroundColor: selected
            ? mobileTheme.colors.primary
            : mobileTheme.colors.white,
          alignItems: "center",
          justifyContent: "center",
          ...mobileTheme.shadow.md,
          borderWidth: 2,
          borderColor: selected
            ? mobileTheme.colors.primaryDark
            : mobileTheme.colors.white
        }}
      >
        <MapPin
          size={selected ? 20 : 18}
          color={
            selected ? mobileTheme.colors.white : mobileTheme.colors.primary
          }
          fill={
            selected ? mobileTheme.colors.white : mobileTheme.colors.primarySoft
          }
        />
      </View>
      {count > 0 && (
        <View
          style={{
            marginTop: -8,
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: mobileTheme.colors.primary,
            borderWidth: 2,
            borderColor: mobileTheme.colors.white,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 4
          }}
        >
          <Text
            style={{
              color: mobileTheme.colors.white,
              fontSize: 10,
              fontWeight: "700",
              fontFamily: "Inter_700Bold"
            }}
          >
            {count}
          </Text>
        </View>
      )}
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: selected
            ? mobileTheme.colors.primaryDark
            : mobileTheme.colors.border,
          marginTop: 2
        }}
      />
    </View>
  );
}

const MemoPinMarker = memo(PinMarker);

type VenueMarkerItem = {
  id: string;
  latitude: number;
  longitude: number;
  currentCheckIns: Array<unknown>;
};

const VenueMarkers = memo(function VenueMarkers({
  venues,
  selectedId,
  onSelect
}: {
  venues: VenueMarkerItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {venues.map((venue) => (
        <Marker
          key={venue.id}
          coordinate={{ latitude: venue.latitude, longitude: venue.longitude }}
          onPress={() => onSelect(venue.id)}
        >
          <MemoPinMarker
            selected={selectedId === venue.id}
            count={venue.currentCheckIns.length}
          />
        </Marker>
      ))}
    </>
  );
});

export default function ExplorePage() {
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const sheetAnim = useRef(new Animated.Value(SHEET_TRAVEL)).current;
  const dragStart = useRef(SHEET_TRAVEL);
  const dragCurrent = useRef(SHEET_TRAVEL);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [petPickerOpen, setPetPickerOpen] = useState(false);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const { data: venues = [] } = useQuery({
    queryKey: ["explore-venues", session?.tokens.accessToken],
    queryFn: () => listExploreVenues(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const { data: events = [] } = useQuery({
    queryKey: ["explore-events", session?.tokens.accessToken],
    queryFn: () => listExploreEvents(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const { data: pets = [] } = useQuery({
    queryKey: ["explore-my-pets", session?.tokens.accessToken],
    queryFn: () => listMyPets(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude
        });
      }
    })();
  }, []);

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

  const primaryPetIds = useMemo(
    () => pets.slice(0, 1).map((p) => p.id),
    [pets]
  );
  const selectedVenue = mapVenues.find((v) => v.id === selectedVenueId) ?? null;
  const tabBarOffset = insets.bottom + 82;
  const visibleSheetHeight = sheetExpanded ? EXPANDED_SHEET : COLLAPSED_SHEET;

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: sheetExpanded ? 0 : SHEET_TRAVEL,
      useNativeDriver: true,
      damping: 24,
      stiffness: 220,
      mass: 0.6
    }).start();
  }, [sheetExpanded, sheetAnim]);

  const openPetPicker = () => {
    if (pets.length <= 1) return;
    setSelectedPetIds(primaryPetIds);
    setPetPickerOpen(true);
  };

  const togglePetSelection = (petId: string) => {
    setSelectedPetIds((prev) =>
      prev.includes(petId)
        ? prev.filter((id) => id !== petId)
        : [...prev, petId]
    );
  };

  const checkInPetIds =
    selectedPetIds.length > 0 ? selectedPetIds : primaryPetIds;
  const activeCheckInPetIds =
    selectedPetIds.length > 0 ? selectedPetIds : primaryPetIds;

  const checkInMutation = useMutation({
    mutationFn: (venueId: string) =>
      checkInVenue(
        session!.tokens.accessToken,
        venueId,
        checkInPetIds,
        userLocation?.latitude,
        userLocation?.longitude
      ),
    onSuccess: (venue) => {
      setSelectedVenueId(venue.id);
      setFeedbackMessage("Checked in successfully!");
      queryClient.invalidateQueries({
        queryKey: ["explore-venues", session?.tokens.accessToken]
      });
    },
    onError: (error) => {
      setFeedbackMessage(
        error instanceof Error ? error.message : "Unable to check in right now."
      );
    }
  });

  const rsvpMutation = useMutation({
    mutationFn: (eventId: string) =>
      rsvpEvent(session!.tokens.accessToken, eventId, primaryPetIds),
    onSuccess: () => {
      setFeedbackMessage("You're on the list!");
      queryClient.invalidateQueries({
        queryKey: ["explore-events", session?.tokens.accessToken]
      });
    },
    onError: (error) => {
      setFeedbackMessage(
        error instanceof Error ? error.message : "Unable to join this event."
      );
    }
  });

  const initialRegion = useMemo(
    () => ({
      latitude: userLocation?.latitude ?? mapVenues[0]?.latitude ?? 51.5074,
      longitude: userLocation?.longitude ?? mapVenues[0]?.longitude ?? -0.1278,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08
    }),
    [mapVenues, userLocation]
  );

  const handlePan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dy) > 5 && Math.abs(gs.dy) > Math.abs(gs.dx),
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
          const shouldExpand = gs.dy < -28 || projected < SHEET_TRAVEL / 2;
          setSheetExpanded(shouldExpand);
        },
        onPanResponderTerminate: () => {
          setSheetExpanded(dragCurrent.current < SHEET_TRAVEL / 2);
        }
      }),
    [sheetAnim]
  );

  const focusVenue = useCallback(
    (venueId?: string) => {
      if (!venueId) return;
      const venue = mapVenues.find((v) => v.id === venueId);
      if (!venue) return;
      setSelectedVenueId(venue.id);
      setFeedbackMessage(null);
      mapRef.current?.animateToRegion(
        {
          latitude: venue.latitude,
          longitude: venue.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02
        },
        300
      );
    },
    [mapVenues]
  );

  const goToMyLocation = useCallback(() => {
    if (!userLocation) return;
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

  const mapPadding = useMemo(
    () => ({
      top: insets.top + 72,
      right: 16,
      bottom: tabBarOffset + visibleSheetHeight + 60,
      left: 16
    }),
    [insets.top, tabBarOffset, visibleSheetHeight]
  );

  const legalLabelInsets = useMemo(
    () => ({
      top: insets.top + 64,
      right: 0,
      bottom: tabBarOffset + visibleSheetHeight + 16,
      left: 0
    }),
    [insets.top, tabBarOffset, visibleSheetHeight]
  );

  return (
    <View style={{ flex: 1, backgroundColor: mobileTheme.colors.background }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        showsUserLocation
        showsCompass={false}
        mapPadding={{
          top: insets.top + 72,
          right: 16,
          bottom: tabBarOffset + visibleSheetHeight + 60,
          left: 16
        }}
        legalLabelInsets={{
          top: insets.top + 64,
          right: 0,
          bottom: tabBarOffset + visibleSheetHeight + 16,
          left: 0
        }}
      >
        <VenueMarkers
          venues={mapVenues}
          selectedId={selectedVenueId}
          onSelect={(id) => focusVenue(id)}
        />
      </MapView>

      <Pressable
        onPress={goToMyLocation}
        style={{
          position: "absolute",
          bottom: tabBarOffset + visibleSheetHeight + 12,
          right: 16,
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: mobileTheme.colors.white,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: mobileTheme.colors.border,
          ...mobileTheme.shadow.md
        }}
      >
        <LocateFixed size={20} color={mobileTheme.colors.ink} />
      </Pressable>

      <View
        style={{
          position: "absolute",
          top: insets.top + 12,
          left: 16,
          right: 16,
          gap: mobileTheme.spacing.sm
        }}
      >
        {selectedVenue ? (
          <View
            style={{
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: "rgba(255,255,255,0.97)",
              borderWidth: 1,
              borderColor: mobileTheme.colors.border,
              padding: mobileTheme.spacing.lg,
              gap: mobileTheme.spacing.md,
              ...mobileTheme.shadow.md
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: mobileTheme.spacing.md
              }}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  numberOfLines={2}
                  style={{
                    color: mobileTheme.colors.ink,
                    fontSize: mobileTheme.typography.subheading.fontSize,
                    fontWeight: mobileTheme.typography.subheading.fontWeight,
                    fontFamily: "Inter_600SemiBold"
                  }}
                >
                  {selectedVenue.name}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: mobileTheme.spacing.xs
                  }}
                >
                  <MapPin size={12} color={mobileTheme.colors.muted} />
                  <Text
                    style={{
                      color: mobileTheme.colors.muted,
                      fontSize: mobileTheme.typography.caption.fontSize,
                      fontFamily: "Inter_400Regular"
                    }}
                  >
                    {formatLabel(selectedVenue.category)}
                    {selectedVenue.address ? ` · ${selectedVenue.address}` : ""}
                  </Text>
                </View>
              </View>
              <Pressable onPress={() => setSelectedVenueId(null)} hitSlop={12}>
                <X size={18} color={mobileTheme.colors.muted} />
              </Pressable>
            </View>

            {selectedVenue.currentCheckIns.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: mobileTheme.spacing.sm }}
              >
                {selectedVenue.currentCheckIns.map((ci) => (
                  <View
                    key={ci.userId}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: mobileTheme.spacing.sm,
                      backgroundColor: mobileTheme.colors.background,
                      borderRadius: mobileTheme.radius.pill,
                      paddingHorizontal: mobileTheme.spacing.sm + 2,
                      paddingVertical: mobileTheme.spacing.xs + 2
                    }}
                  >
                    <Avatar uri={ci.avatarUrl} name={ci.userName} size="xs" />
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: mobileTheme.typography.micro.fontSize,
                        fontWeight: "600",
                        color: mobileTheme.colors.ink,
                        fontFamily: "Inter_600SemiBold",
                        maxWidth: 80
                      }}
                    >
                      {ci.userName}
                    </Text>
                    {ci.petNames.length > 0 && (
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 10,
                          color: mobileTheme.colors.muted,
                          fontFamily: "Inter_400Regular",
                          maxWidth: 80
                        }}
                      >
                        · {ci.petNames.join(", ")}
                      </Text>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: mobileTheme.spacing.sm
              }}
            >
              <PrimaryButton
                label={checkInMutation.isPending ? "Checking in..." : "I'm in"}
                onPress={() => checkInMutation.mutate(selectedVenue.id)}
                disabled={
                  !activeCheckInPetIds.length ||
                  checkInMutation.isPending ||
                  !userLocation
                }
                size="sm"
              />
              {pets.length > 1 ? (
                <Pressable
                  onPress={openPetPicker}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: mobileTheme.spacing.xs,
                    paddingHorizontal: mobileTheme.spacing.md,
                    paddingVertical: mobileTheme.spacing.sm + 2,
                    borderRadius: mobileTheme.radius.pill,
                    backgroundColor: mobileTheme.colors.background,
                    borderWidth: 1,
                    borderColor: mobileTheme.colors.border
                  }}
                >
                  <Text
                    style={{
                      color: mobileTheme.colors.ink,
                      fontWeight: "600",
                      fontSize: mobileTheme.typography.micro.fontSize,
                      fontFamily: "Inter_600SemiBold"
                    }}
                  >
                    {activeCheckInPetIds.length} pet
                    {activeCheckInPetIds.length !== 1 ? "s" : ""}
                  </Text>
                  <ChevronDown size={12} color={mobileTheme.colors.muted} />
                </Pressable>
              ) : null}
            </View>

            {!userLocation && (
              <Text
                style={{
                  color: mobileTheme.colors.danger,
                  fontSize: mobileTheme.typography.micro.fontSize,
                  fontFamily: "Inter_500Medium"
                }}
              >
                Enable location to check in.
              </Text>
            )}
          </View>
        ) : (
          <View
            style={{
              alignSelf: "center",
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: "rgba(255,255,255,0.95)",
              paddingHorizontal: mobileTheme.spacing.lg,
              paddingVertical: mobileTheme.spacing.sm + 2,
              ...mobileTheme.shadow.sm
            }}
          >
            <Text
              style={{
                color: mobileTheme.colors.ink,
                fontWeight: "600",
                fontSize: mobileTheme.typography.caption.fontSize,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {mapVenues.length
                ? "Tap a pin to see details"
                : "No venues added yet"}
            </Text>
          </View>
        )}

        {feedbackMessage && (
          <View
            style={{
              alignSelf: "center",
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: "rgba(255,255,255,0.95)",
              paddingHorizontal: mobileTheme.spacing.md,
              paddingVertical: mobileTheme.spacing.sm,
              ...mobileTheme.shadow.sm
            }}
          >
            <Text
              style={{
                color: mobileTheme.colors.secondary,
                fontWeight: "600",
                fontSize: mobileTheme.typography.caption.fontSize,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {feedbackMessage}
            </Text>
          </View>
        )}
      </View>

      <Modal
        visible={petPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPetPickerOpen(false)}
      >
        <View
          style={{ flex: 1, backgroundColor: mobileTheme.colors.background }}
        >
          <View
            style={{
              padding: mobileTheme.spacing.xl,
              gap: mobileTheme.spacing.lg,
              paddingBottom: 36,
              flex: 1
            }}
          >
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
                  color: mobileTheme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                Check in with
              </Text>
              <Pressable onPress={() => setPetPickerOpen(false)}>
                <X size={20} color={mobileTheme.colors.ink} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: mobileTheme.spacing.md }}>
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
                      backgroundColor: mobileTheme.colors.white,
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected
                        ? mobileTheme.colors.primary
                        : mobileTheme.colors.border,
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
                          fontSize:
                            mobileTheme.typography.bodySemiBold.fontSize,
                          fontWeight:
                            mobileTheme.typography.bodySemiBold.fontWeight,
                          color: mobileTheme.colors.ink,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {pet.name}
                      </Text>
                      <Text
                        style={{
                          color: mobileTheme.colors.muted,
                          fontSize: mobileTheme.typography.caption.fontSize,
                          fontFamily: "Inter_400Regular"
                        }}
                      >
                        {pet.speciesLabel} &middot; {pet.breedLabel}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: isSelected
                          ? mobileTheme.colors.primary
                          : "transparent",
                        borderWidth: 2,
                        borderColor: isSelected
                          ? mobileTheme.colors.primary
                          : mobileTheme.colors.border,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      {isSelected && (
                        <Check size={14} color={mobileTheme.colors.white} />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={{ gap: mobileTheme.spacing.sm }}>
              <PrimaryButton
                label="Confirm check-in"
                disabled={selectedPetIds.length === 0}
                onPress={() => {
                  setPetPickerOpen(false);
                  if (selectedVenue) {
                    checkInMutation.mutate(selectedVenue.id);
                  }
                }}
              />
              {selectedPetIds.length === 0 && (
                <Text
                  style={{
                    color: mobileTheme.colors.danger,
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

      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: tabBarOffset - 24,
          height: EXPANDED_SHEET,
          transform: [{ translateY: sheetAnim }]
        }}
      >
        <View
          style={{
            flex: 1,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            backgroundColor: mobileTheme.colors.white,
            shadowColor: "#000",
            shadowOpacity: 0.08,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: -4 },
            elevation: 12
          }}
        >
          <View
            {...handlePan.panHandlers}
            style={{
              alignItems: "center",
              paddingTop: 10,
              paddingBottom: 4
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: mobileTheme.colors.border
              }}
            />
          </View>

          <View
            style={{
              paddingHorizontal: mobileTheme.spacing.xl,
              paddingBottom: mobileTheme.spacing.md,
              paddingTop: mobileTheme.spacing.sm,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <View>
              <Text
                style={{
                  color: mobileTheme.colors.ink,
                  fontSize: mobileTheme.typography.subheading.fontSize,
                  fontWeight: mobileTheme.typography.subheading.fontWeight,
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                Events
              </Text>
              <Text
                style={{
                  color: mobileTheme.colors.muted,
                  fontSize: mobileTheme.typography.micro.fontSize,
                  fontFamily: "Inter_500Medium"
                }}
              >
                Upcoming near you
              </Text>
            </View>
            {events.length > 0 && (
              <Pressable onPress={() => setSheetExpanded((e) => !e)}>
                <Text
                  style={{
                    color: mobileTheme.colors.primary,
                    fontWeight: "600",
                    fontSize: mobileTheme.typography.caption.fontSize,
                    fontFamily: "Inter_600SemiBold"
                  }}
                >
                  {sheetExpanded ? "Collapse" : "See all"}
                </Text>
              </Pressable>
            )}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            scrollEnabled={sheetExpanded}
            contentContainerStyle={{
              gap: mobileTheme.spacing.md,
              paddingHorizontal: mobileTheme.spacing.xl,
              paddingBottom: mobileTheme.spacing.xl
            }}
          >
            {events.length ? (
              events.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => focusVenue(event.venueId)}
                  style={{
                    gap: mobileTheme.spacing.sm,
                    padding: mobileTheme.spacing.lg,
                    borderRadius: mobileTheme.radius.lg,
                    backgroundColor: mobileTheme.colors.background,
                    borderWidth: 1,
                    borderColor: mobileTheme.colors.border
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      gap: mobileTheme.spacing.md,
                      alignItems: "flex-start"
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={{
                          color: mobileTheme.colors.ink,
                          fontSize:
                            mobileTheme.typography.bodySemiBold.fontSize,
                          fontWeight:
                            mobileTheme.typography.bodySemiBold.fontWeight,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {event.title}
                      </Text>
                      <Text
                        style={{
                          color: mobileTheme.colors.muted,
                          fontSize: mobileTheme.typography.caption.fontSize,
                          fontFamily: "Inter_500Medium"
                        }}
                      >
                        {formatLabel(event.audience)} &middot;{" "}
                        {formatLabel(event.petFocus)}
                      </Text>
                    </View>
                    <View style={{ width: 80 }}>
                      <PrimaryButton
                        label={rsvpMutation.isPending ? "..." : "Join"}
                        variant="ghost"
                        onPress={() => rsvpMutation.mutate(event.id)}
                        disabled={
                          !primaryPetIds.length || rsvpMutation.isPending
                        }
                        size="sm"
                      />
                    </View>
                  </View>

                  {event.description ? (
                    <Text
                      numberOfLines={2}
                      style={{
                        color: mobileTheme.colors.muted,
                        lineHeight: mobileTheme.typography.body.lineHeight,
                        fontSize: mobileTheme.typography.body.fontSize,
                        fontFamily: "Inter_400Regular"
                      }}
                    >
                      {event.description}
                    </Text>
                  ) : null}

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: mobileTheme.spacing.sm
                    }}
                  >
                    <Calendar size={14} color={mobileTheme.colors.muted} />
                    <Text
                      style={{
                        color: mobileTheme.colors.muted,
                        fontSize: mobileTheme.typography.micro.fontSize,
                        fontFamily: "Inter_500Medium"
                      }}
                    >
                      {new Date(event.startsAt).toLocaleString("en-GB")}
                    </Text>
                    {event.venueName && (
                      <Text
                        style={{
                          color: mobileTheme.colors.muted,
                          fontSize: mobileTheme.typography.micro.fontSize,
                          fontFamily: "Inter_500Medium"
                        }}
                      >
                        &middot; {event.venueName}
                      </Text>
                    )}
                    <View style={{ flex: 1 }} />
                    <Text
                      style={{
                        color: mobileTheme.colors.secondary,
                        fontWeight: "600",
                        fontSize: mobileTheme.typography.micro.fontSize,
                        fontFamily: "Inter_600SemiBold"
                      }}
                    >
                      {event.attendeeCount} going
                    </Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <View
                style={{
                  padding: mobileTheme.spacing.xl,
                  borderRadius: mobileTheme.radius.lg,
                  backgroundColor: mobileTheme.colors.background,
                  borderWidth: 1,
                  borderColor: mobileTheme.colors.border,
                  alignItems: "center",
                  gap: mobileTheme.spacing.sm
                }}
              >
                <Calendar size={24} color={mobileTheme.colors.muted} />
                <Text
                  style={{
                    color: mobileTheme.colors.muted,
                    lineHeight: mobileTheme.typography.body.lineHeight,
                    textAlign: "center",
                    fontSize: mobileTheme.typography.body.fontSize,
                    fontFamily: "Inter_400Regular"
                  }}
                >
                  Events will appear here once added from the admin panel.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}
