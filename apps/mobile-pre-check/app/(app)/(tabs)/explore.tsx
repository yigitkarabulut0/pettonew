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
  StyleSheet,
  Text,
  View
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
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

const f = mobileTheme.fontFamily;
const c = mobileTheme.colors;

const windowHeight = Dimensions.get("window").height;
const COLLAPSED_SHEET_HEIGHT = 214;
const EXPANDED_SHEET_HEIGHT = Math.min(520, Math.round(windowHeight * 0.62));

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.canvas
  },
  markerOuter: {
    alignItems: "center",
    justifyContent: "center"
  },
  markerInner: {
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7A4C31",
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 18,
    elevation: 6
  },
  markerInnerSelected: {
    width: 58,
    height: 58,
    backgroundColor: c.secondary,
    borderColor: c.surface
  },
  markerInnerDefault: {
    width: 52,
    height: 52,
    backgroundColor: "#FFF7EF",
    borderColor: "rgba(164, 121, 86, 0.20)"
  },
  markerBadge: {
    position: "absolute",
    right: -4,
    bottom: -6,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: c.primary,
    borderWidth: 2,
    borderColor: "#FFF8F1",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5
  },
  markerBadgeText: {
    color: c.surface,
    fontSize: 11,
    fontWeight: "800",
    fontFamily: f
  },
  topCardsContainer: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    gap: 12
  },
  venuePanel: {
    borderRadius: 20,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    padding: 18,
    gap: 12,
    shadowColor: "#8A5B3D",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 20,
    elevation: 4
  },
  venueHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12
  },
  venueTitle: {
    color: c.ink,
    fontSize: 19,
    fontWeight: "800",
    fontFamily: f
  },
  venueSubtitle: {
    color: c.secondary,
    fontWeight: "700",
    fontFamily: f
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center"
  },
  venueAddress: {
    color: c.muted,
    lineHeight: 20,
    fontFamily: f
  },
  checkInSectionLabel: {
    color: c.secondary,
    fontWeight: "700",
    fontSize: 14,
    fontFamily: f
  },
  checkInAvatarOuter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8
  },
  checkInPhotoContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.surface,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center"
  },
  checkInPhotoInitial: {
    color: c.secondary,
    fontWeight: "700",
    fontSize: 13,
    fontFamily: f
  },
  checkInName: {
    fontSize: 14,
    fontWeight: "700",
    color: c.ink,
    fontFamily: f
  },
  checkInPetNames: {
    fontSize: 12,
    color: c.muted,
    fontFamily: f
  },
  noCheckInText: {
    color: c.muted,
    lineHeight: 20,
    fontFamily: f
  },
  petPickerTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  petPickerLabel: {
    color: c.ink,
    fontWeight: "600",
    fontSize: 14,
    fontFamily: f
  },
  petPickerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: c.surface,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border
  },
  petPickerAvatarInitial: {
    fontSize: 11,
    fontWeight: "700",
    color: c.secondary,
    fontFamily: f
  },
  locationWarning: {
    color: c.danger,
    fontWeight: "600",
    lineHeight: 20,
    fontFamily: f
  },
  addPetWarning: {
    color: c.danger,
    lineHeight: 20,
    fontFamily: f
  },
  hintPill: {
    alignSelf: "center",
    borderRadius: 999,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  hintPillText: {
    color: c.ink,
    fontWeight: "700",
    fontFamily: f
  },
  feedbackPill: {
    borderRadius: 18,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  feedbackPillText: {
    color: c.secondary,
    fontWeight: "700",
    fontFamily: f
  },
  modalContainer: {
    flex: 1,
    backgroundColor: c.canvas
  },
  modalContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 36,
    flex: 1
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  modalOverline: {
    color: c.secondary,
    fontWeight: "700",
    letterSpacing: 1,
    fontFamily: f
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: c.ink,
    fontFamily: f
  },
  modalCancelBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: c.surface
  },
  modalCancelText: {
    color: c.secondary,
    fontWeight: "700",
    fontFamily: f
  },
  petPickerItem: {
    flexDirection: "row",
    gap: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center"
  },
  petPickerItemSelected: {
    borderWidth: 2,
    borderColor: c.secondary
  },
  petPickerPhoto: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: c.surface,
    overflow: "hidden"
  },
  petPickerPhotoInitial: {
    fontSize: 22,
    fontWeight: "700",
    color: c.secondary,
    fontFamily: f
  },
  petPickerName: {
    fontSize: 18,
    fontWeight: "700",
    color: c.ink,
    fontFamily: f
  },
  petPickerBreed: {
    color: c.muted,
    fontSize: 14,
    fontFamily: f
  },
  petPickerCheck: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center"
  },
  petPickerCheckSelected: {
    backgroundColor: c.secondary,
    borderColor: c.secondary
  },
  petPickerValidation: {
    color: c.danger,
    textAlign: "center",
    fontSize: 14,
    fontFamily: f
  },
  bottomSheetOuter: {
    position: "absolute",
    left: 0,
    right: 0,
    height: EXPANDED_SHEET_HEIGHT
  },
  bottomSheetInner: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    paddingTop: 10,
    shadowColor: "#8A5B3D",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: -10 },
    shadowRadius: 20,
    elevation: 8
  },
  sheetHandleArea: {
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 14
  },
  sheetHandle: {
    width: 58,
    height: 6,
    borderRadius: 999,
    backgroundColor: c.border
  },
  sectionTitle: {
    color: c.secondary,
    fontWeight: "800",
    letterSpacing: 1,
    fontFamily: f
  },
  sectionHeading: {
    color: c.ink,
    fontSize: 24,
    fontWeight: "800",
    fontFamily: f
  },
  sectionDescription: {
    color: c.muted,
    lineHeight: 21,
    fontFamily: f
  },
  eventCard: {
    gap: 10,
    padding: 16,
    borderRadius: 20,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border
  },
  eventCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start"
  },
  eventTitle: {
    color: c.ink,
    fontSize: 17,
    fontWeight: "800",
    fontFamily: f
  },
  eventAudience: {
    color: c.secondary,
    fontWeight: "700",
    fontFamily: f
  },
  eventDescription: {
    color: c.muted,
    lineHeight: 21,
    fontFamily: f
  },
  eventMeta: {
    color: c.muted,
    lineHeight: 20,
    fontFamily: f
  },
  eventAttendeeCount: {
    color: c.secondary,
    fontWeight: "800",
    fontFamily: f
  },
  emptyEventCard: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border
  },
  emptyEventTitle: {
    color: c.ink,
    fontSize: 18,
    fontWeight: "800",
    fontFamily: f
  },
  emptyEventDescription: {
    color: c.muted,
    lineHeight: 21,
    marginTop: 6,
    fontFamily: f
  }
});

function formatLabel(value: string) {
  return value.replaceAll("-", " ");
}

function markerIcon(category: string) {
  switch (category) {
    case "park":
      return "leaf" as const;
    case "cafe":
      return "cafe-outline" as const;
    case "bar":
      return "wine-outline" as const;
    case "beach":
      return "sunny-outline" as const;
    case "trail":
      return "print-outline" as const;
    default:
      return "paw-outline" as const;
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
    <View style={styles.container}>
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
              <View style={styles.markerOuter}>
                <View
                  style={[
                    styles.markerInner,
                    isSelected
                      ? styles.markerInnerSelected
                      : styles.markerInnerDefault
                  ]}
                >
                  <Ionicons
                    name={markerIcon(venue.category)}
                    size={22}
                    color={isSelected ? c.surface : c.secondary}
                  />
                </View>
                <View style={styles.markerBadge}>
                  <Text style={styles.markerBadgeText}>
                    {venue.currentCheckIns.length}
                  </Text>
                </View>
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={[styles.topCardsContainer, { top: insets.top + 14 }]}>
        {selectedVenue ? (
          <View style={styles.venuePanel}>
            <View style={styles.venueHeaderRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text numberOfLines={2} style={styles.venueTitle}>
                  {selectedVenue.name}
                </Text>
                <Text style={styles.venueSubtitle}>
                  {formatLabel(selectedVenue.category)} •{" "}
                  {selectedVenue.currentCheckIns.length} checked in
                </Text>
              </View>
              <Pressable onPress={() => setSelectedVenueId(null)} hitSlop={12}>
                <View style={styles.closeButton}>
                  <Ionicons name="close" size={18} color={c.muted} />
                </View>
              </Pressable>
            </View>

            <Text numberOfLines={2} style={styles.venueAddress}>
              {selectedVenue.address}
            </Text>

            {selectedVenue.currentCheckIns.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={styles.checkInSectionLabel}>Who&apos;s here</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ gap: 12 }}
                >
                  {selectedVenue.currentCheckIns.map((checkIn) => (
                    <View
                      key={checkIn.userId}
                      style={styles.checkInAvatarOuter}
                    >
                      <View style={styles.checkInPhotoContainer}>
                        {checkIn.avatarUrl ? (
                          <Image
                            source={{ uri: checkIn.avatarUrl }}
                            style={{ width: "100%", height: "100%" }}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text style={styles.checkInPhotoInitial}>
                            {(checkIn.userName || "U")
                              .slice(0, 1)
                              .toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={{ gap: 2 }}>
                        <Text style={styles.checkInName}>
                          {checkIn.userName}
                        </Text>
                        <Text style={styles.checkInPetNames}>
                          with {checkIn.petNames.join(", ")}
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <Text numberOfLines={3} style={styles.noCheckInText}>
                Nobody has checked in yet. Be the first person people see at
                this pet-friendly spot.
              </Text>
            )}

            {pets.length > 1 ? (
              <Pressable
                onPress={openPetPicker}
                style={styles.petPickerTrigger}
              >
                <Text style={styles.petPickerLabel}>Checking in with: </Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {activeCheckInPetIds.map((petId) => {
                    const pet = pets.find((p) => p.id === petId);
                    return pet ? (
                      <View key={pet.id} style={styles.petPickerAvatar}>
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
                            <Text style={styles.petPickerAvatarInitial}>
                              {pet.name.slice(0, 1)}
                            </Text>
                          </View>
                        )}
                      </View>
                    ) : null;
                  })}
                </View>
                <Ionicons name="chevron-down" size={16} color={c.muted} />
              </Pressable>
            ) : null}

            {!userLocation ? (
              <Text style={styles.locationWarning}>
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
              <Text style={styles.addPetWarning}>
                Add at least one pet profile before checking in.
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.hintPill}>
            <Text style={styles.hintPillText}>
              {mapVenues.length
                ? "Tap one of your venue pins to see who is there"
                : "Add pet-friendly venues from the admin panel to bring this map to life"}
            </Text>
          </View>
        )}

        {feedbackMessage ? (
          <View style={styles.feedbackPill}>
            <Text style={styles.feedbackPillText}>{feedbackMessage}</Text>
          </View>
        ) : null}
      </View>

      <Modal
        visible={petPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPetPickerOpen(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderRow}>
              <View style={{ gap: 4 }}>
                <Text style={styles.modalOverline}>CHECK IN WITH</Text>
                <Text style={styles.modalTitle}>Select your pet</Text>
              </View>
              <Pressable
                onPress={() => setPetPickerOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: 12 }}>
              {pets.map((pet) => {
                const isSelected = selectedPetIds.includes(pet.id);
                return (
                  <Pressable
                    key={pet.id}
                    onPress={() => togglePetSelection(pet.id)}
                    style={[
                      styles.petPickerItem,
                      isSelected && styles.petPickerItemSelected
                    ]}
                  >
                    <View style={styles.petPickerPhoto}>
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
                          <Text style={styles.petPickerPhotoInitial}>
                            {pet.name.slice(0, 1)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.petPickerName}>{pet.name}</Text>
                      <Text style={styles.petPickerBreed}>
                        {pet.speciesLabel} • {pet.breedLabel}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.petPickerCheck,
                        isSelected && styles.petPickerCheckSelected
                      ]}
                    >
                      {isSelected ? (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={c.surface}
                        />
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
                <Text style={styles.petPickerValidation}>
                  Select at least one pet to check in.
                </Text>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Animated.View
        style={[
          styles.bottomSheetOuter,
          {
            bottom: tabBarOffset - 30,
            transform: [{ translateY }]
          }
        ]}
      >
        <View style={styles.bottomSheetInner}>
          <View
            {...handlePanResponder.panHandlers}
            style={styles.sheetHandleArea}
          >
            <View style={styles.sheetHandle} />
          </View>

          <View style={{ paddingHorizontal: 18, paddingBottom: 14, gap: 6 }}>
            <Text style={styles.sectionTitle}>EVENTS</Text>
            <Text style={styles.sectionHeading}>
              Upcoming pet-friendly plans
            </Text>
            <Text style={styles.sectionDescription}>
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
                  style={styles.eventCard}
                >
                  <View style={styles.eventCardRow}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.eventTitle}>{event.title}</Text>
                      <Text style={styles.eventAudience}>
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

                  <Text style={styles.eventDescription}>
                    {event.description}
                  </Text>

                  <Text style={styles.eventMeta}>
                    {new Date(event.startsAt).toLocaleString("en-GB")} •{" "}
                    {event.venueName || event.cityLabel}
                  </Text>

                  <Text style={styles.eventAttendeeCount}>
                    {event.attendeeCount} attending
                  </Text>
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyEventCard}>
                <Text style={styles.emptyEventTitle}>No events yet</Text>
                <Text style={styles.emptyEventDescription}>
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
