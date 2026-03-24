import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
import type { ExploreVenue } from "@petto/contracts";

const windowHeight = Dimensions.get("window").height;
const COLLAPSED_SHEET_HEIGHT = 214;
const EXPANDED_SHEET_HEIGHT = Math.min(520, Math.round(windowHeight * 0.62));

function formatLabel(value: string) {
  return value.replaceAll("-", " ");
}

function markerIcon(category: string) {
  switch (category) {
    case "park":
      return "🌿";
    case "cafe":
      return "☕";
    case "bar":
      return "🍷";
    case "beach":
      return "☀️";
    case "trail":
      return "🥾";
    default:
      return "🐾";
  }
}

export default function ExplorePage() {
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const translateY = useRef(
    new Animated.Value(EXPANDED_SHEET_HEIGHT - COLLAPSED_SHEET_HEIGHT)
  ).current;
  const dragStartOffsetRef = useRef(
    EXPANDED_SHEET_HEIGHT - COLLAPSED_SHEET_HEIGHT
  );
  const currentOffsetRef = useRef(
    EXPANDED_SHEET_HEIGHT - COLLAPSED_SHEET_HEIGHT
  );
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
        (venue) =>
          Number.isFinite(venue.latitude) &&
          Number.isFinite(venue.longitude) &&
          venue.latitude !== 0 &&
          venue.longitude !== 0
      ),
    [venues]
  );

  const primaryPetIds = useMemo(
    () => pets.slice(0, 1).map((pet) => pet.id),
    [pets]
  );
  const selectedVenue =
    mapVenues.find((venue) => venue.id === selectedVenueId) ?? null;
  const tabBarOffset = insets.bottom + 82;
  const sheetTravel = EXPANDED_SHEET_HEIGHT - COLLAPSED_SHEET_HEIGHT;
  const visibleSheetHeight = sheetExpanded
    ? EXPANDED_SHEET_HEIGHT
    : COLLAPSED_SHEET_HEIGHT;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: sheetExpanded ? 0 : sheetTravel,
      useNativeDriver: true,
      damping: 20,
      stiffness: 180,
      mass: 0.8
    }).start();
  }, [sheetExpanded, sheetTravel, translateY]);

  const openPetPicker = () => {
    if (pets.length <= 1) {
      return;
    }
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
      setFeedbackMessage("You are checked in at this spot.");
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
      setFeedbackMessage("You are on the attendee list.");
      queryClient.invalidateQueries({
        queryKey: ["explore-events", session?.tokens.accessToken]
      });
    },
    onError: (error) => {
      setFeedbackMessage(
        error instanceof Error
          ? error.message
          : "Unable to join this event right now."
      );
    }
  });

  const initialRegion = useMemo(
    () => ({
      latitude:
        userLocation?.latitude ??
        selectedVenue?.latitude ??
        mapVenues[0]?.latitude ??
        51.5074,
      longitude:
        userLocation?.longitude ??
        selectedVenue?.longitude ??
        mapVenues[0]?.longitude ??
        -0.1278,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08
    }),
    [selectedVenue, mapVenues, userLocation]
  );

  const handlePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 6 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderGrant: () => {
          translateY.stopAnimation((value) => {
            dragStartOffsetRef.current = value;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const nextValue = Math.max(
            0,
            Math.min(sheetTravel, dragStartOffsetRef.current + gestureState.dy)
          );
          currentOffsetRef.current = nextValue;
          translateY.setValue(nextValue);
        },
        onPanResponderRelease: (_, gestureState) => {
          const projectedValue = Math.max(
            0,
            Math.min(sheetTravel, dragStartOffsetRef.current + gestureState.dy)
          );
          currentOffsetRef.current = projectedValue;
          const shouldExpand =
            gestureState.dy < -32 || projectedValue < sheetTravel / 2;
          setSheetExpanded(shouldExpand);
        },
        onPanResponderTerminate: () => {
          setSheetExpanded(currentOffsetRef.current < sheetTravel / 2);
        }
      }),
    [sheetTravel, translateY]
  );

  function focusVenue(venueId?: string) {
    if (!venueId) {
      return;
    }

    const venue = mapVenues.find((item) => item.id === venueId);
    if (!venue) {
      return;
    }

    setSelectedVenueId(venue.id);
    setFeedbackMessage(null);
    mapRef.current?.animateToRegion(
      {
        latitude: venue.latitude,
        longitude: venue.longitude,
        latitudeDelta: 0.026,
        longitudeDelta: 0.026
      },
      320
    );
  }

  const activeCheckInPetIds =
    selectedPetIds.length > 0 ? selectedPetIds : primaryPetIds;

  return (
    <View style={{ flex: 1, backgroundColor: mobileTheme.colors.background }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
        showsCompass={false}
        mapPadding={{
          top: insets.top + 104,
          right: 16,
          bottom: tabBarOffset + visibleSheetHeight + 18,
          left: 16
        }}
      >
        {mapVenues.map((venue) => {
          const isSelected = selectedVenueId === venue.id;
          return (
            <Marker
              key={venue.id}
              coordinate={{
                latitude: venue.latitude,
                longitude: venue.longitude
              }}
              onPress={() => focusVenue(venue.id)}
            >
              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <View
                  style={{
                    width: isSelected ? 58 : 52,
                    height: isSelected ? 58 : 52,
                    borderRadius: 18,
                    backgroundColor: isSelected
                      ? mobileTheme.colors.secondary
                      : "#FFF7EF",
                    borderWidth: 2,
                    borderColor: isSelected
                      ? "#FFF5ED"
                      : "rgba(164, 121, 86, 0.20)",
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: "#7A4C31",
                    shadowOpacity: 0.16,
                    shadowOffset: { width: 0, height: 12 },
                    shadowRadius: 18,
                    elevation: 6
                  }}
                >
                  <Text
                    selectable={false}
                    style={{
                      fontSize: 22,
                      color: isSelected
                        ? "#FFFFFF"
                        : mobileTheme.colors.secondary,
                      textAlign: "center",
                      lineHeight: 22
                    }}
                  >
                    {markerIcon(venue.category)}
                  </Text>
                </View>
                <View
                  style={{
                    position: "absolute",
                    right: -4,
                    bottom: -6,
                    minWidth: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: mobileTheme.colors.primary,
                    borderWidth: 2,
                    borderColor: "#FFF8F1",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 5
                  }}
                >
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: 11,
                      fontWeight: "800"
                    }}
                  >
                    {venue.currentCheckIns.length}
                  </Text>
                </View>
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View
        style={{
          position: "absolute",
          top: insets.top + 14,
          left: 16,
          right: 16,
          gap: 12
        }}
      >
        {selectedVenue ? (
          <View
            style={{
              borderRadius: 26,
              backgroundColor: "rgba(255, 249, 243, 0.97)",
              borderWidth: 1,
              borderColor: mobileTheme.colors.border,
              padding: 18,
              gap: 12,
              shadowColor: "#8A5B3D",
              shadowOpacity: 0.08,
              shadowOffset: { width: 0, height: 12 },
              shadowRadius: 20,
              elevation: 4
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12
              }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  numberOfLines={2}
                  style={{
                    color: mobileTheme.colors.ink,
                    fontSize: 21,
                    fontWeight: "800"
                  }}
                >
                  {selectedVenue.name}
                </Text>
                <Text
                  style={{
                    color: mobileTheme.colors.secondary,
                    fontWeight: "700"
                  }}
                >
                  {formatLabel(selectedVenue.category)} •{" "}
                  {selectedVenue.currentCheckIns.length} checked in
                </Text>
              </View>
              <Pressable onPress={() => setSelectedVenueId(null)} hitSlop={12}>
                <Text
                  selectable={false}
                  style={{
                    fontSize: 22,
                    color: mobileTheme.colors.muted,
                    lineHeight: 22
                  }}
                >
                  ✕
                </Text>
              </Pressable>
            </View>

            <Text
              numberOfLines={2}
              style={{ color: mobileTheme.colors.muted, lineHeight: 20 }}
            >
              {selectedVenue.address}
            </Text>

            {selectedVenue.currentCheckIns.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text
                  selectable
                  style={{
                    color: mobileTheme.colors.secondary,
                    fontWeight: "700",
                    fontSize: 14
                  }}
                >
                  Who&apos;s here
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ gap: 12 }}
                >
                  {selectedVenue.currentCheckIns.map((checkIn) => (
                    <View
                      key={checkIn.userId}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        backgroundColor: "#FFFFFF",
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: mobileTheme.colors.border,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        marginRight: 8
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 999,
                          backgroundColor: mobileTheme.colors.surface,
                          overflow: "hidden",
                          borderWidth: 1,
                          borderColor: mobileTheme.colors.border,
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >
                        {checkIn.avatarUrl ? (
                          <Image
                            source={{ uri: checkIn.avatarUrl }}
                            style={{ width: "100%", height: "100%" }}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text
                            style={{
                              color: mobileTheme.colors.secondary,
                              fontWeight: "700",
                              fontSize: 13
                            }}
                          >
                            {(checkIn.userName || "U")
                              .slice(0, 1)
                              .toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={{ gap: 2 }}>
                        <Text
                          selectable
                          style={{
                            fontSize: 14,
                            fontWeight: "700",
                            color: mobileTheme.colors.ink
                          }}
                        >
                          {checkIn.userName}
                        </Text>
                        <Text
                          selectable
                          style={{
                            fontSize: 12,
                            color: mobileTheme.colors.muted
                          }}
                        >
                          with {checkIn.petNames.join(", ")}
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <Text
                numberOfLines={3}
                style={{ color: mobileTheme.colors.muted, lineHeight: 20 }}
              >
                Nobody has checked in yet. Be the first person people see at
                this pet-friendly spot.
              </Text>
            )}

            {pets.length > 1 ? (
              <Pressable
                onPress={openPetPicker}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 16,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: mobileTheme.colors.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10
                }}
              >
                <Text
                  selectable
                  style={{
                    color: mobileTheme.colors.ink,
                    fontWeight: "600",
                    fontSize: 14
                  }}
                >
                  Checking in with:{" "}
                </Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {activeCheckInPetIds.map((petId) => {
                    const pet = pets.find((p) => p.id === petId);
                    return pet ? (
                      <View
                        key={pet.id}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          backgroundColor: mobileTheme.colors.surface,
                          overflow: "hidden",
                          borderWidth: 1,
                          borderColor: mobileTheme.colors.border
                        }}
                      >
                        {pet.photos[0]?.url ? (
                          <Image
                            source={{ uri: pet.photos[0].url }}
                            style={{ width: "100%", height: "100%" }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View
                            style={{
                              flex: 1,
                              alignItems: "center",
                              justifyContent: "center"
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "700",
                                color: mobileTheme.colors.secondary
                              }}
                            >
                              {pet.name.slice(0, 1)}
                            </Text>
                          </View>
                        )}
                      </View>
                    ) : null;
                  })}
                </View>
                <Text
                  selectable={false}
                  style={{
                    fontSize: 16,
                    color: mobileTheme.colors.muted,
                    lineHeight: 16
                  }}
                >
                  ▼
                </Text>
              </Pressable>
            ) : null}

            {!userLocation ? (
              <Text
                selectable
                style={{
                  color: mobileTheme.colors.danger,
                  fontWeight: "600",
                  lineHeight: 20
                }}
              >
                Location access is required to check in. Please enable it.
              </Text>
            ) : null}

            <PrimaryButton
              label={checkInMutation.isPending ? "Checking in..." : "I'm in"}
              onPress={() => checkInMutation.mutate(selectedVenue.id)}
              disabled={
                !activeCheckInPetIds.length ||
                checkInMutation.isPending ||
                !userLocation
              }
            />

            {!activeCheckInPetIds.length ? (
              <Text
                style={{ color: mobileTheme.colors.danger, lineHeight: 20 }}
              >
                Add at least one pet profile before checking in.
              </Text>
            ) : null}
          </View>
        ) : (
          <View
            style={{
              alignSelf: "center",
              borderRadius: 999,
              backgroundColor: "rgba(255, 249, 243, 0.97)",
              borderWidth: 1,
              borderColor: mobileTheme.colors.border,
              paddingHorizontal: 16,
              paddingVertical: 10
            }}
          >
            <Text style={{ color: mobileTheme.colors.ink, fontWeight: "700" }}>
              {mapVenues.length
                ? "Tap one of your venue pins to see who is there"
                : "Add pet-friendly venues from the admin panel to bring this map to life"}
            </Text>
          </View>
        )}

        {feedbackMessage ? (
          <View
            style={{
              borderRadius: 18,
              backgroundColor: "rgba(255, 249, 243, 0.97)",
              borderWidth: 1,
              borderColor: mobileTheme.colors.border,
              paddingHorizontal: 14,
              paddingVertical: 10
            }}
          >
            <Text
              style={{ color: mobileTheme.colors.secondary, fontWeight: "700" }}
            >
              {feedbackMessage}
            </Text>
          </View>
        ) : null}
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
          <View style={{ padding: 20, gap: 16, paddingBottom: 36, flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <View style={{ gap: 4 }}>
                <Text
                  selectable
                  style={{
                    color: mobileTheme.colors.secondary,
                    fontWeight: "700",
                    letterSpacing: 1
                  }}
                >
                  CHECK IN WITH
                </Text>
                <Text
                  selectable
                  style={{
                    fontSize: 28,
                    fontWeight: "800",
                    color: mobileTheme.colors.ink
                  }}
                >
                  Select your pet
                </Text>
              </View>
              <Pressable
                onPress={() => setPetPickerOpen(false)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: mobileTheme.colors.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  backgroundColor: "#FFFFFF"
                }}
              >
                <Text
                  selectable
                  style={{
                    color: mobileTheme.colors.secondary,
                    fontWeight: "700"
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: 12 }}>
              {pets.map((pet) => {
                const isSelected = selectedPetIds.includes(pet.id);
                return (
                  <Pressable
                    key={pet.id}
                    onPress={() => togglePetSelection(pet.id)}
                    style={{
                      flexDirection: "row",
                      gap: 14,
                      padding: 14,
                      borderRadius: 24,
                      backgroundColor: "#FFFFFF",
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected
                        ? mobileTheme.colors.secondary
                        : mobileTheme.colors.border,
                      alignItems: "center"
                    }}
                  >
                    <View
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: 18,
                        backgroundColor: mobileTheme.colors.surface,
                        overflow: "hidden"
                      }}
                    >
                      {pet.photos[0]?.url ? (
                        <Image
                          source={{ uri: pet.photos[0].url }}
                          style={{ width: "100%", height: "100%" }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={{
                            flex: 1,
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 22,
                              fontWeight: "700",
                              color: mobileTheme.colors.secondary
                            }}
                          >
                            {pet.name.slice(0, 1)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        selectable
                        style={{
                          fontSize: 18,
                          fontWeight: "700",
                          color: mobileTheme.colors.ink
                        }}
                      >
                        {pet.name}
                      </Text>
                      <Text
                        selectable
                        style={{
                          color: mobileTheme.colors.muted,
                          fontSize: 14
                        }}
                      >
                        {pet.speciesLabel} • {pet.breedLabel}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        backgroundColor: isSelected
                          ? mobileTheme.colors.secondary
                          : "transparent",
                        borderWidth: 2,
                        borderColor: isSelected
                          ? mobileTheme.colors.secondary
                          : mobileTheme.colors.border,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      {isSelected ? (
                        <Text
                          selectable={false}
                          style={{
                            fontSize: 16,
                            color: "#FFFFFF",
                            fontWeight: "700",
                            lineHeight: 16
                          }}
                        >
                          ✓
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={{ gap: 10 }}>
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
                    fontSize: 14
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
          bottom: tabBarOffset - 30,
          height: EXPANDED_SHEET_HEIGHT,
          transform: [{ translateY }]
        }}
      >
        <View
          style={{
            flex: 1,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            backgroundColor: "rgba(255, 248, 242, 0.985)",
            borderWidth: 1,
            borderColor: mobileTheme.colors.border,
            paddingTop: 10,
            shadowColor: "#8A5B3D",
            shadowOpacity: 0.12,
            shadowOffset: { width: 0, height: -10 },
            shadowRadius: 20,
            elevation: 8
          }}
        >
          <View
            {...handlePanResponder.panHandlers}
            style={{
              alignItems: "center",
              paddingTop: 6,
              paddingBottom: 14
            }}
          >
            <View
              style={{
                width: 58,
                height: 6,
                borderRadius: 999,
                backgroundColor: mobileTheme.colors.border
              }}
            />
          </View>

          <View style={{ paddingHorizontal: 18, paddingBottom: 14, gap: 6 }}>
            <Text
              style={{
                color: mobileTheme.colors.secondary,
                fontWeight: "800",
                letterSpacing: 1
              }}
            >
              EVENTS
            </Text>
            <Text
              style={{
                color: mobileTheme.colors.ink,
                fontSize: 24,
                fontWeight: "800"
              }}
            >
              Upcoming pet-friendly plans
            </Text>
            <Text style={{ color: mobileTheme.colors.muted, lineHeight: 21 }}>
              Pull up from the handle to open the full event list, pull it back
              down from the same handle to minimize.
            </Text>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            scrollEnabled={sheetExpanded}
            contentContainerStyle={{
              gap: 12,
              paddingHorizontal: 18,
              paddingBottom: 18
            }}
          >
            {events.length ? (
              events.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => focusVenue(event.venueId)}
                  style={{
                    gap: 10,
                    padding: 16,
                    borderRadius: 24,
                    backgroundColor: "#FFFFFF",
                    borderWidth: 1,
                    borderColor: mobileTheme.colors.border
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "flex-start"
                    }}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={{
                          color: mobileTheme.colors.ink,
                          fontSize: 18,
                          fontWeight: "800"
                        }}
                      >
                        {event.title}
                      </Text>
                      <Text
                        style={{
                          color: mobileTheme.colors.secondary,
                          fontWeight: "700"
                        }}
                      >
                        {formatLabel(event.audience)} •{" "}
                        {formatLabel(event.petFocus)}
                      </Text>
                    </View>
                    <View style={{ width: 96 }}>
                      <PrimaryButton
                        label={rsvpMutation.isPending ? "Joining..." : "I'm in"}
                        variant="ghost"
                        onPress={() => rsvpMutation.mutate(event.id)}
                        disabled={
                          !primaryPetIds.length || rsvpMutation.isPending
                        }
                      />
                    </View>
                  </View>

                  <Text
                    style={{ color: mobileTheme.colors.muted, lineHeight: 21 }}
                  >
                    {event.description}
                  </Text>

                  <Text
                    style={{ color: mobileTheme.colors.muted, lineHeight: 20 }}
                  >
                    {new Date(event.startsAt).toLocaleString("en-GB")} •{" "}
                    {event.venueName || event.cityLabel}
                  </Text>

                  <Text
                    style={{
                      color: mobileTheme.colors.secondary,
                      fontWeight: "800"
                    }}
                  >
                    {event.attendeeCount} attending
                  </Text>
                </Pressable>
              ))
            ) : (
              <View
                style={{
                  borderRadius: 24,
                  padding: 18,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: mobileTheme.colors.border
                }}
              >
                <Text
                  style={{
                    color: mobileTheme.colors.ink,
                    fontSize: 18,
                    fontWeight: "800"
                  }}
                >
                  No events yet
                </Text>
                <Text
                  style={{
                    color: mobileTheme.colors.muted,
                    lineHeight: 21,
                    marginTop: 6
                  }}
                >
                  Admin-created events will appear here automatically once you
                  add them from the panel.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}
