import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { LottieLoading } from "@/components/lottie-loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ChevronDown, ImageIcon, MessageCircle, SlidersHorizontal } from "lucide-react-native";

import { PetDetailModal } from "@/components/pet-card";
import { DiscoveryDeck } from "@/components/match/discovery-deck";
import { MatchesList } from "@/components/match/matches-list";
import { MatchTutorial } from "@/components/match/match-tutorial";
import {
  FilterModal,
  DEFAULT_FILTERS,
  ACTIVITY_LABELS
} from "@/components/match/filter-modal";
import type { Filters } from "@/components/match/filter-modal";
import { MatchCelebrationModal } from "@/components/match/match-celebration";
import { PetSelectModal } from "@/components/match/pet-select-modal";
import { getDiscoveryFeed, listMatches, listMyPets } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import type { Pet } from "@petto/contracts";

const TUTORIAL_STORAGE_KEY = "petto_match_tutorial_seen";
const DEFAULT_GOOD_WITH = ["Kids", "Dogs", "Cats", "Other pets", "Elderly"];

export default function MatchesPage() {
  const theme = useTheme();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const matchTutorialSeen = useSessionStore((state) => state.matchTutorialSeen);
  const setMatchTutorialSeen = useSessionStore((state) => state.setMatchTutorialSeen);
  const [tutorialLoading, setTutorialLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_STORAGE_KEY).then((value) => {
      if (value === "true") {
        setMatchTutorialSeen(true);
      }
      setTutorialLoading(false);
    });
  }, [setMatchTutorialSeen]);

  const handleTutorialComplete = useCallback(() => {
    setMatchTutorialSeen(true);
    AsyncStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
  }, [setMatchTutorialSeen]);

  const [tab, setTab] = useState<"discover" | "matches">("discover");
  const [matchModal, setMatchModal] = useState<{
    visible: boolean;
    myPet: Pet | null;
    matchedPet: Pet | null;
    ownerName: string;
    conversationId: string;
  }>({
    visible: false,
    myPet: null,
    matchedPet: null,
    ownerName: "",
    conversationId: ""
  });
  const [detailPet, setDetailPet] = useState<Pet | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [petPickerOpen, setPetPickerOpen] = useState(false);

  const activePetId = useSessionStore((state) => state.activePetId);
  const setActivePetId = useSessionStore((state) => state.setActivePetId);

  const { data: myPets = [] } = useQuery({
    queryKey: ["my-pets-discovery", session?.tokens.accessToken],
    queryFn: () => listMyPets(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const { data: feed = [], isLoading: feedLoading } = useQuery({
    queryKey: ["discovery-feed", session?.tokens.accessToken, activePetId],
    queryFn: () =>
      getDiscoveryFeed(session!.tokens.accessToken, activePetId ?? undefined),
    enabled: Boolean(session)
  });

  const { data: matches = [], refetch: refetchMatches, isRefetching: matchesRefetching } = useQuery({
    queryKey: ["matches", session?.tokens.accessToken],
    queryFn: () => listMatches(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const activePet = useMemo(() => {
    if (activePetId) {
      return myPets.find((p) => p.id === activePetId) ?? null;
    }
    return myPets.length > 0 ? myPets[0] : null;
  }, [myPets, activePetId]);

  const speciesList = useMemo(() => {
    const set = new Set(feed.map((c) => c.pet.speciesLabel).filter(Boolean));
    return Array.from(set).sort();
  }, [feed]);

  const goodWithOptions = useMemo(() => {
    const set = new Set<string>();
    feed.forEach((c) => c.pet.goodWith.forEach((gw) => set.add(gw)));
    if (set.size === 0) return DEFAULT_GOOD_WITH;
    return Array.from(set).sort();
  }, [feed]);

  const filteredFeed = useMemo(() => {
    return feed.filter((card) => {
      if (filters.species && card.pet.speciesLabel !== filters.species)
        return false;
      if (filters.distance && filters.distance !== "any") {
        const maxDist = parseFloat(filters.distance);
        if (!isNaN(maxDist)) {
          const label = card.distanceLabel.toLowerCase();
          if (label.includes("km") || label.includes("mi")) {
            const dist = parseFloat(label);
            if (!isNaN(dist) && dist > maxDist) return false;
          }
        }
      }
      if (
        filters.activityLevel !== null &&
        card.pet.activityLevel !== filters.activityLevel
      )
        return false;
      if (filters.goodWith.length > 0) {
        const hasAll = filters.goodWith.every((gw) =>
          card.pet.goodWith.includes(gw)
        );
        if (!hasAll) return false;
      }
      if (filters.neutered !== null && card.pet.isNeutered !== filters.neutered)
        return false;
      return true;
    });
  }, [feed, filters]);

  const filterCount = useMemo(() => {
    let count = 0;
    if (filters.species) count++;
    if (filters.distance) count++;
    if (filters.activityLevel !== null) count++;
    if (filters.goodWith.length > 0) count++;
    if (filters.neutered !== null) count++;
    return count;
  }, [filters]);

  const handleMatch = useCallback(
    (
      myPet: Pet,
      matchedPet: Pet,
      ownerName: string,
      conversationId: string
    ) => {
      setMatchModal({
        visible: true,
        myPet,
        matchedPet,
        ownerName,
        conversationId
      });
    },
    []
  );

  const handleDismiss = useCallback(() => {
    setMatchModal({
      visible: false,
      myPet: null,
      matchedPet: null,
      ownerName: "",
      conversationId: ""
    });
  }, []);

  const handleSendMessage = useCallback(
    (conversationId: string) => {
      handleDismiss();
      router.push(`/(app)/conversation/${conversationId}`);
    },
    [handleDismiss]
  );

  const handleMatchPress = useCallback((match: { conversationId: string }) => {
    router.push(`/(app)/conversation/${match.conversationId}`);
  }, []);

  const showPetPicker = myPets.length > 1;

  if (!tutorialLoading && !matchTutorialSeen) {
    return <MatchTutorial onComplete={handleTutorialComplete} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.sm,
          paddingHorizontal: mobileTheme.spacing.xl
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: mobileTheme.spacing.md
          }}
        >
          {showPetPicker && activePet && (
            <Pressable
              onPress={() => setPetPickerOpen(true)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: theme.colors.surface,
                borderRadius: mobileTheme.radius.pill,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderWidth: 1,
                borderColor: theme.colors.border,
                ...mobileTheme.shadow.sm,
                opacity: pressed ? 0.85 : 1
              })}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  overflow: "hidden",
                  backgroundColor: theme.colors.background
                }}
              >
                {activePet.photos[0]?.url ? (
                  <Image
                    source={{ uri: activePet.photos[0].url }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={{
                      flex: 1,
                      justifyContent: "center",
                      alignItems: "center"
                    }}
                  >
                    <ImageIcon size={11} color={theme.colors.muted} />
                  </View>
                )}
              </View>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontFamily: "Inter_600SemiBold",
                  color: theme.colors.ink,
                  maxWidth: 60
                }}
              >
                {activePet.name}
              </Text>
              <ChevronDown size={12} color={theme.colors.muted} />
            </Pressable>
          )}

          <View style={{ flex: 1 }}>
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
            {tab === "discover" && !feedLoading && (
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  fontFamily: "Inter_500Medium",
                  color: theme.colors.muted,
                  marginTop: 2
                }}
              >
                {filteredFeed.length} pets near you
              </Text>
            )}
            {tab === "matches" && matches.length > 0 && (
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  fontFamily: "Inter_500Medium",
                  color: theme.colors.primary,
                  marginTop: 2
                }}
              >
                {matches.length} {matches.length === 1 ? "match" : "matches"}
              </Text>
            )}
          </View>

          <Pressable
            onPress={() => router.push("/(app)/conversations")}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: theme.colors.surface,
              alignItems: "center",
              justifyContent: "center",
              ...mobileTheme.shadow.sm,
              opacity: pressed ? 0.85 : 1
            })}
          >
            <MessageCircle size={18} color={theme.colors.ink} />
          </Pressable>

          {tab === "discover" && (
            <Pressable
              onPress={() => setFilterOpen(true)}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor:
                  filterCount > 0
                    ? theme.colors.primaryBg
                    : theme.colors.surface,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: filterCount > 0 ? 1.5 : 0,
                borderColor: theme.colors.primary,
                ...mobileTheme.shadow.sm,
                opacity: pressed ? 0.85 : 1
              })}
            >
              <SlidersHorizontal
                size={18}
                color={
                  filterCount > 0
                    ? theme.colors.primary
                    : theme.colors.ink
                }
              />
              {filterCount > 0 && (
                <View
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: theme.colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 4
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: theme.colors.white,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    {filterCount}
                  </Text>
                </View>
              )}
            </Pressable>
          )}
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          marginHorizontal: mobileTheme.spacing.xl,
          marginBottom: mobileTheme.spacing.sm,
          backgroundColor: theme.colors.surface,
          borderRadius: mobileTheme.radius.pill,
          padding: 3,
          ...mobileTheme.shadow.sm
        }}
      >
        <Pressable
          onPress={() => setTab("discover")}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: mobileTheme.spacing.sm,
            borderRadius: mobileTheme.radius.pill,
            backgroundColor:
              tab === "discover" ? theme.colors.primary : "transparent",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed && tab !== "discover" ? 0.7 : 1
          })}
        >
          <Text
            style={{
              fontSize: mobileTheme.typography.caption.fontSize,
              fontWeight: "700",
              color:
                tab === "discover"
                  ? theme.colors.white
                  : theme.colors.muted,
              fontFamily: "Inter_700Bold"
            }}
          >
            Discover
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("matches")}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: mobileTheme.spacing.sm,
            borderRadius: mobileTheme.radius.pill,
            backgroundColor:
              tab === "matches" ? theme.colors.primary : "transparent",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed && tab !== "matches" ? 0.7 : 1
          })}
        >
          <Text
            style={{
              fontSize: mobileTheme.typography.caption.fontSize,
              fontWeight: "700",
              color:
                tab === "matches"
                  ? theme.colors.white
                  : theme.colors.muted,
              fontFamily: "Inter_700Bold"
            }}
          >
            Matches{matches.length > 0 ? ` ${matches.length}` : ""}
          </Text>
        </Pressable>
      </View>

      {tab === "discover" ? (
        feedLoading && filteredFeed.length === 0 ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 }}>
            <LottieLoading size={70} />
          </View>
        ) : (
        <DiscoveryDeck
          cards={filteredFeed}
          myPets={myPets}
          isLoading={feedLoading}
          accessToken={session?.tokens.accessToken ?? ""}
          onMatch={handleMatch}
          queryClient={queryClient}
          onPetPress={(pet) => setDetailPet(pet)}
        />
        )
      ) : (
        <MatchesList
          matches={matches}
          myPets={myPets}
          insets={insets}
          onStartDiscovering={() => setTab("discover")}
          onMatchPress={handleMatchPress}
          onRefresh={refetchMatches}
          isRefreshing={matchesRefetching}
        />
      )}

      <MatchCelebrationModal
        visible={matchModal.visible}
        myPet={matchModal.myPet}
        matchedPet={matchModal.matchedPet}
        ownerName={matchModal.ownerName}
        conversationId={matchModal.conversationId}
        onDismiss={handleDismiss}
        onSendMessage={handleSendMessage}
      />

      <PetDetailModal
        pet={detailPet}
        visible={Boolean(detailPet)}
        onClose={() => setDetailPet(null)}
      />

      <FilterModal
        visible={filterOpen}
        filters={filters}
        speciesList={speciesList}
        goodWithOptions={goodWithOptions}
        onApply={(newFilters) => {
          setFilters(newFilters);
          setFilterOpen(false);
        }}
        onClose={() => setFilterOpen(false)}
      />

      <PetSelectModal
        visible={petPickerOpen}
        pets={myPets}
        activePetId={activePet?.id ?? null}
        onSelect={(pet) => {
          setActivePetId(pet.id);
          setPetPickerOpen(false);
          queryClient.invalidateQueries({
            queryKey: ["discovery-feed", session?.tokens.accessToken]
          });
        }}
        onClose={() => setPetPickerOpen(false)}
      />
    </View>
  );
}
