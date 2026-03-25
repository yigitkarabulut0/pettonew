import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Heart,
  ImageIcon,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  X
} from "lucide-react-native";

import { PetDetailModal } from "@/components/pet-card";
import { PrimaryButton } from "@/components/primary-button";
import {
  createSwipe,
  getDiscoveryFeed,
  listMatches,
  listMyPets
} from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import type { DiscoveryCard, Pet } from "@petto/contracts";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 80;

type SwipeDirection = "like" | "pass" | "super-like";

const ACTIVITY_LABELS: Record<number, string> = {
  1: "Very calm",
  2: "Relaxed",
  3: "Balanced",
  4: "Active",
  5: "Very active"
};

const DEFAULT_GOOD_WITH = ["Kids", "Dogs", "Cats", "Other pets", "Elderly"];

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return `${Math.floor(diffDay / 7)}w ago`;
}

interface Filters {
  species: string | null;
  distance: string | null;
  activityLevel: number | null;
  goodWith: string[];
  neutered: boolean | null;
}

const DEFAULT_FILTERS: Filters = {
  species: null,
  distance: null,
  activityLevel: null,
  goodWith: [],
  neutered: null
};

export default function MatchesPage() {
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
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

  const { data: matches = [] } = useQuery({
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

  const showPetPicker = myPets.length > 1;

  return (
    <View style={{ flex: 1, backgroundColor: mobileTheme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + mobileTheme.spacing.lg,
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
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: mobileTheme.colors.surface,
                borderRadius: mobileTheme.radius.pill,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderWidth: 1,
                borderColor: mobileTheme.colors.border,
                ...mobileTheme.shadow.sm
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  overflow: "hidden",
                  backgroundColor: mobileTheme.colors.background
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
                    <ImageIcon size={11} color={mobileTheme.colors.muted} />
                  </View>
                )}
              </View>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontFamily: "Inter_600SemiBold",
                  color: mobileTheme.colors.ink,
                  maxWidth: 60
                }}
              >
                {activePet.name}
              </Text>
              <ChevronDown size={12} color={mobileTheme.colors.muted} />
            </Pressable>
          )}

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: mobileTheme.typography.heading.fontSize,
                fontWeight: mobileTheme.typography.heading.fontWeight,
                color: mobileTheme.colors.ink,
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
                  color: mobileTheme.colors.muted,
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
                  color: mobileTheme.colors.primary,
                  marginTop: 2
                }}
              >
                {matches.length} {matches.length === 1 ? "match" : "matches"}
              </Text>
            )}
          </View>

          {tab === "discover" && (
            <Pressable
              onPress={() => setFilterOpen(true)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor:
                  filterCount > 0
                    ? mobileTheme.colors.primaryBg
                    : mobileTheme.colors.surface,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: filterCount > 0 ? 1.5 : 0,
                borderColor: mobileTheme.colors.primary,
                ...mobileTheme.shadow.sm
              }}
            >
              <SlidersHorizontal
                size={18}
                color={
                  filterCount > 0
                    ? mobileTheme.colors.primary
                    : mobileTheme.colors.ink
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
                    backgroundColor: mobileTheme.colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 4
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: mobileTheme.colors.white,
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
          backgroundColor: mobileTheme.colors.surface,
          borderRadius: mobileTheme.radius.pill,
          padding: 3,
          ...mobileTheme.shadow.sm
        }}
      >
        <Pressable
          onPress={() => setTab("discover")}
          style={{
            flex: 1,
            paddingVertical: mobileTheme.spacing.sm,
            borderRadius: mobileTheme.radius.pill,
            backgroundColor:
              tab === "discover" ? mobileTheme.colors.secondary : "transparent",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Text
            style={{
              fontSize: mobileTheme.typography.caption.fontSize,
              fontWeight: "700",
              color:
                tab === "discover"
                  ? mobileTheme.colors.white
                  : mobileTheme.colors.muted,
              fontFamily: "Inter_700Bold"
            }}
          >
            Discover
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("matches")}
          style={{
            flex: 1,
            paddingVertical: mobileTheme.spacing.sm,
            borderRadius: mobileTheme.radius.pill,
            backgroundColor:
              tab === "matches" ? mobileTheme.colors.secondary : "transparent",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Text
            style={{
              fontSize: mobileTheme.typography.caption.fontSize,
              fontWeight: "700",
              color:
                tab === "matches"
                  ? mobileTheme.colors.white
                  : mobileTheme.colors.muted,
              fontFamily: "Inter_700Bold"
            }}
          >
            Matches{matches.length > 0 ? ` ${matches.length}` : ""}
          </Text>
        </Pressable>
      </View>

      {tab === "discover" ? (
        <DiscoveryDeck
          cards={filteredFeed}
          myPets={myPets}
          isLoading={feedLoading}
          accessToken={session?.tokens.accessToken ?? ""}
          onMatch={handleMatch}
          queryClient={queryClient}
          onPetPress={(pet) => setDetailPet(pet)}
        />
      ) : (
        <MatchesList
          matches={matches}
          myPets={myPets}
          insets={insets}
          onStartDiscovering={() => setTab("discover")}
          onMatchPress={() => {}}
        />
      )}

      <MatchCelebrationModal
        visible={matchModal.visible}
        myPet={matchModal.myPet}
        matchedPet={matchModal.matchedPet}
        ownerName={matchModal.ownerName}
        conversationId={matchModal.conversationId}
        onDismiss={handleDismiss}
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

interface PetSelectModalProps {
  visible: boolean;
  pets: Pet[];
  activePetId: string | null;
  onSelect: (pet: Pet) => void;
  onClose: () => void;
}

function PetSelectModal({
  visible,
  pets,
  activePetId,
  onSelect,
  onClose
}: PetSelectModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: mobileTheme.colors.background }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: insets.top + mobileTheme.spacing.md,
            paddingBottom: mobileTheme.spacing.md,
            paddingHorizontal: mobileTheme.spacing.xl
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
            Switch pet
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={22} color={mobileTheme.colors.ink} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingVertical: mobileTheme.spacing.sm,
            gap: mobileTheme.spacing.sm
          }}
        >
          <Text
            style={{
              fontSize: mobileTheme.typography.caption.fontSize,
              fontFamily: "Inter_500Medium",
              color: mobileTheme.colors.muted,
              marginBottom: mobileTheme.spacing.sm
            }}
          >
            Choose which pet to discover with
          </Text>
          {pets.map((pet) => {
            const isActive = pet.id === activePetId;
            return (
              <Pressable
                key={pet.id}
                onPress={() => onSelect(pet)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: mobileTheme.spacing.md,
                  padding: mobileTheme.spacing.lg,
                  borderRadius: mobileTheme.radius.lg,
                  backgroundColor: mobileTheme.colors.surface,
                  borderWidth: isActive ? 2 : 1,
                  borderColor: isActive
                    ? mobileTheme.colors.primary
                    : mobileTheme.colors.border,
                  ...mobileTheme.shadow.sm
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    overflow: "hidden",
                    backgroundColor: mobileTheme.colors.background
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
                        justifyContent: "center",
                        alignItems: "center"
                      }}
                    >
                      <ImageIcon size={20} color={mobileTheme.colors.muted} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.bodySemiBold.fontSize,
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
                    {pet.speciesLabel} &middot; {pet.breedLabel} &middot;{" "}
                    {pet.ageYears}y
                  </Text>
                </View>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: isActive
                      ? mobileTheme.colors.primary
                      : "transparent",
                    borderWidth: 2,
                    borderColor: isActive
                      ? mobileTheme.colors.primary
                      : mobileTheme.colors.border,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {isActive && (
                    <Check size={14} color={mobileTheme.colors.white} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

interface FilterModalProps {
  visible: boolean;
  filters: Filters;
  speciesList: string[];
  goodWithOptions: string[];
  onApply: (filters: Filters) => void;
  onClose: () => void;
}

function FilterModal({
  visible,
  filters,
  speciesList,
  goodWithOptions,
  onApply,
  onClose
}: FilterModalProps) {
  const insets = useSafeAreaInsets();
  const [local, setLocal] = useState<Filters>(filters);

  useEffect(() => {
    if (visible) setLocal(filters);
  }, [visible, filters]);

  const reset = () => setLocal(DEFAULT_FILTERS);

  const toggleGoodWith = (item: string) => {
    setLocal((prev) => ({
      ...prev,
      goodWith: prev.goodWith.includes(item)
        ? prev.goodWith.filter((g) => g !== item)
        : [...prev.goodWith, item]
    }));
  };

  const hasChanges =
    local.species !== filters.species ||
    local.distance !== filters.distance ||
    local.activityLevel !== filters.activityLevel ||
    JSON.stringify(local.goodWith) !== JSON.stringify(filters.goodWith) ||
    local.neutered !== filters.neutered;

  const localCount = useMemo(() => {
    let count = 0;
    if (local.species) count++;
    if (local.distance) count++;
    if (local.activityLevel !== null) count++;
    if (local.goodWith.length > 0) count++;
    if (local.neutered !== null) count++;
    return count;
  }, [local]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: mobileTheme.colors.background }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: insets.top + mobileTheme.spacing.md,
            paddingBottom: mobileTheme.spacing.md,
            paddingHorizontal: mobileTheme.spacing.xl
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
            Filters{localCount > 0 ? ` (${localCount})` : ""}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={22} color={mobileTheme.colors.ink} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingVertical: mobileTheme.spacing.sm,
            gap: mobileTheme.spacing["2xl"]
          }}
        >
          {speciesList.length > 0 && (
            <FilterSection title="Species">
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: mobileTheme.spacing.sm
                }}
              >
                <FilterChip
                  label="All"
                  active={local.species === null}
                  onPress={() => setLocal((p) => ({ ...p, species: null }))}
                />
                {speciesList.map((s) => (
                  <FilterChip
                    key={s}
                    label={s}
                    active={local.species === s}
                    onPress={() =>
                      setLocal((p) => ({
                        ...p,
                        species: p.species === s ? null : s
                      }))
                    }
                  />
                ))}
              </View>
            </FilterSection>
          )}

          <FilterSection title="Distance">
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: mobileTheme.spacing.sm
              }}
            >
              <FilterChip
                label="Any"
                active={local.distance === null}
                onPress={() => setLocal((p) => ({ ...p, distance: null }))}
              />
              {(["5", "10", "25", "50"] as const).map((d) => (
                <FilterChip
                  key={d}
                  label={`< ${d} km`}
                  active={local.distance === d}
                  onPress={() =>
                    setLocal((p) => ({
                      ...p,
                      distance: p.distance === d ? null : d
                    }))
                  }
                />
              ))}
            </View>
          </FilterSection>

          <FilterSection title="Energy level">
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: mobileTheme.spacing.sm
              }}
            >
              <FilterChip
                label="Any"
                active={local.activityLevel === null}
                onPress={() => setLocal((p) => ({ ...p, activityLevel: null }))}
              />
              {([1, 2, 3, 4, 5] as const).map((level) => (
                <FilterChip
                  key={level}
                  label={ACTIVITY_LABELS[level] ?? String(level)}
                  active={local.activityLevel === level}
                  onPress={() =>
                    setLocal((p) => ({
                      ...p,
                      activityLevel: p.activityLevel === level ? null : level
                    }))
                  }
                />
              ))}
            </View>
          </FilterSection>

          <FilterSection title="Good with">
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: mobileTheme.spacing.sm
              }}
            >
              {goodWithOptions.map((item) => (
                <FilterChip
                  key={item}
                  label={item}
                  active={local.goodWith.includes(item)}
                  onPress={() => toggleGoodWith(item)}
                />
              ))}
            </View>
          </FilterSection>

          <FilterSection title="Neutered">
            <View
              style={{
                flexDirection: "row",
                gap: mobileTheme.spacing.sm
              }}
            >
              <FilterChip
                label="Any"
                active={local.neutered === null}
                onPress={() => setLocal((p) => ({ ...p, neutered: null }))}
              />
              <FilterChip
                label="Yes"
                active={local.neutered === true}
                onPress={() =>
                  setLocal((p) => ({
                    ...p,
                    neutered: p.neutered === true ? null : true
                  }))
                }
              />
              <FilterChip
                label="No"
                active={local.neutered === false}
                onPress={() =>
                  setLocal((p) => ({
                    ...p,
                    neutered: p.neutered === false ? null : false
                  }))
                }
              />
            </View>
          </FilterSection>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingVertical: mobileTheme.spacing.lg,
            paddingBottom: insets.bottom + mobileTheme.spacing.lg,
            borderTopWidth: 1,
            borderTopColor: mobileTheme.colors.border,
            gap: mobileTheme.spacing.sm
          }}
        >
          {localCount > 0 && (
            <PrimaryButton
              label="Reset filters"
              onPress={reset}
              variant="ghost"
            />
          )}
          <PrimaryButton
            label={
              hasChanges
                ? `Apply${localCount > 0 ? ` (${localCount})` : ""}`
                : "Done"
            }
            onPress={() => {
              if (hasChanges) {
                onApply(local);
              } else {
                onClose();
              }
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

function FilterSection({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text
        style={{
          fontSize: mobileTheme.typography.label.fontSize,
          fontWeight: mobileTheme.typography.label.fontWeight,
          color: mobileTheme.colors.muted,
          fontFamily: "Inter_700Bold",
          letterSpacing: 0.5,
          textTransform: "uppercase",
          marginBottom: mobileTheme.spacing.md
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: mobileTheme.spacing.lg,
        paddingVertical: mobileTheme.spacing.sm + 2,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: active
          ? mobileTheme.colors.primaryBg
          : mobileTheme.colors.surface,
        borderWidth: 1.5,
        borderColor: active
          ? mobileTheme.colors.primary
          : mobileTheme.colors.border
      }}
    >
      <Text
        style={{
          fontSize: mobileTheme.typography.caption.fontSize,
          fontWeight: "600",
          fontFamily: "Inter_600SemiBold",
          color: active ? mobileTheme.colors.primary : mobileTheme.colors.ink
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface MatchesListProps {
  matches: import("@petto/contracts").MatchPreview[];
  myPets: Pet[];
  insets: { top: number; bottom: number; left: number; right: number };
  onStartDiscovering: () => void;
  onMatchPress: (match: import("@petto/contracts").MatchPreview) => void;
}

function MatchesList({
  matches,
  myPets,
  insets,
  onStartDiscovering,
  onMatchPress
}: MatchesListProps) {
  const [petFilter, setPetFilter] = useState<string | null>(null);

  const filteredMatches = useMemo(() => {
    if (!petFilter) return matches;
    return matches.filter(
      (m) => m.pet.id === petFilter || m.matchedPet.id === petFilter
    );
  }, [matches, petFilter]);

  const newMatches = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return matches.filter(
      (m) =>
        m.status === "active" && new Date(m.createdAt).getTime() > oneDayAgo
    );
  }, [matches]);

  const showPetFilter = myPets.length > 1;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 120 }}
    >
      {newMatches.length > 0 && (
        <View style={{ marginBottom: mobileTheme.spacing.lg }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: mobileTheme.spacing.xl,
              marginBottom: mobileTheme.spacing.md
            }}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.label.fontSize,
                fontWeight: mobileTheme.typography.label.fontWeight,
                color: mobileTheme.colors.ink,
                fontFamily: "Inter_700Bold",
                letterSpacing: 0.5,
                textTransform: "uppercase"
              }}
            >
              New Matches
            </Text>
            <ChevronRight size={16} color={mobileTheme.colors.muted} />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: mobileTheme.spacing.xl,
              gap: mobileTheme.spacing.lg
            }}
          >
            {newMatches.map((match) => {
              const pet = match.matchedPet;
              const photo = pet.photos[0]?.url;
              return (
                <Pressable
                  key={match.id}
                  onPress={() => onMatchPress(match)}
                  style={{ alignItems: "center", width: 80 }}
                >
                  <View
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 36,
                      borderWidth: 3,
                      borderColor: mobileTheme.colors.primary,
                      overflow: "hidden",
                      backgroundColor: mobileTheme.colors.background,
                      ...mobileTheme.shadow.sm
                    }}
                  >
                    {photo ? (
                      <Image
                        source={{ uri: photo }}
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
                        <ImageIcon size={24} color={mobileTheme.colors.muted} />
                      </View>
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: mobileTheme.typography.micro.fontSize,
                      fontFamily: "Inter_600SemiBold",
                      color: mobileTheme.colors.ink,
                      marginTop: 6,
                      maxWidth: 72,
                      textAlign: "center"
                    }}
                  >
                    {pet.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {showPetFilter && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: mobileTheme.spacing.xl,
            gap: mobileTheme.spacing.sm,
            marginBottom: mobileTheme.spacing.md
          }}
        >
          <Pressable
            onPress={() => setPetFilter(null)}
            style={{
              paddingHorizontal: mobileTheme.spacing.lg,
              paddingVertical: mobileTheme.spacing.sm + 2,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: !petFilter
                ? mobileTheme.colors.primaryBg
                : mobileTheme.colors.surface,
              borderWidth: 1,
              borderColor: !petFilter
                ? mobileTheme.colors.primary
                : mobileTheme.colors.border
            }}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.caption.fontSize,
                fontWeight: "600",
                fontFamily: "Inter_600SemiBold",
                color: !petFilter
                  ? mobileTheme.colors.primary
                  : mobileTheme.colors.ink
              }}
            >
              All
            </Text>
          </Pressable>
          {myPets.map((pet) => (
            <Pressable
              key={pet.id}
              onPress={() => setPetFilter(petFilter === pet.id ? null : pet.id)}
              style={{
                paddingHorizontal: mobileTheme.spacing.lg,
                paddingVertical: mobileTheme.spacing.sm + 2,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor:
                  petFilter === pet.id
                    ? mobileTheme.colors.primaryBg
                    : mobileTheme.colors.surface,
                borderWidth: 1,
                borderColor:
                  petFilter === pet.id
                    ? mobileTheme.colors.primary
                    : mobileTheme.colors.border
              }}
            >
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  fontWeight: "600",
                  fontFamily: "Inter_600SemiBold",
                  color:
                    petFilter === pet.id
                      ? mobileTheme.colors.primary
                      : mobileTheme.colors.ink
                }}
              >
                {pet.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View
        style={{
          paddingHorizontal: mobileTheme.spacing.xl,
          marginBottom: mobileTheme.spacing.md
        }}
      >
        <Text
          style={{
            fontSize: mobileTheme.typography.label.fontSize,
            fontWeight: mobileTheme.typography.label.fontWeight,
            color: mobileTheme.colors.ink,
            fontFamily: "Inter_700Bold",
            letterSpacing: 0.5,
            textTransform: "uppercase"
          }}
        >
          Messages
        </Text>
      </View>

      <View
        style={{
          paddingHorizontal: mobileTheme.spacing.xl,
          gap: mobileTheme.spacing.sm
        }}
      >
        {filteredMatches.length === 0 ? (
          <View
            style={{
              padding: mobileTheme.spacing["3xl"],
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: mobileTheme.colors.surface,
              alignItems: "center",
              gap: mobileTheme.spacing.md,
              ...mobileTheme.shadow.sm
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: mobileTheme.colors.primaryBg,
                justifyContent: "center",
                alignItems: "center"
              }}
            >
              <Heart size={32} color={mobileTheme.colors.primary} />
            </View>
            <Text
              style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                fontWeight: mobileTheme.typography.subheading.fontWeight,
                color: mobileTheme.colors.ink,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              No matches yet
            </Text>
            <Text
              style={{
                color: mobileTheme.colors.muted,
                lineHeight: mobileTheme.typography.body.lineHeight,
                textAlign: "center",
                fontSize: mobileTheme.typography.body.fontSize,
                fontFamily: "Inter_400Regular",
                maxWidth: 260
              }}
            >
              Keep swiping to find the perfect playmate for your pet.
            </Text>
            <PrimaryButton
              label="Start Discovering"
              onPress={onStartDiscovering}
              size="sm"
            />
          </View>
        ) : (
          filteredMatches.map((match) => (
            <MatchRow key={match.id} match={match} onPress={onMatchPress} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

interface MatchRowProps {
  match: import("@petto/contracts").MatchPreview;
  onPress: (match: import("@petto/contracts").MatchPreview) => void;
}

function MatchRow({ match, onPress }: MatchRowProps) {
  const myPet = match.pet;
  const theirPet = match.matchedPet;
  const theirPhoto = theirPet.photos[0]?.url;
  const avatarUrl = match.matchedOwnerAvatarUrl || theirPhoto;

  return (
    <Pressable
      onPress={() => onPress(match)}
      style={{
        flexDirection: "row",
        backgroundColor: mobileTheme.colors.surface,
        borderRadius: mobileTheme.radius.lg,
        ...mobileTheme.shadow.sm,
        overflow: "hidden"
      }}
    >
      <View
        style={{
          width: 56,
          justifyContent: "center",
          alignItems: "center",
          marginLeft: mobileTheme.spacing.lg
        }}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              ...mobileTheme.shadow.sm
            }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: mobileTheme.colors.background,
              justifyContent: "center",
              alignItems: "center",
              ...mobileTheme.shadow.sm
            }}
          >
            <ImageIcon size={22} color={mobileTheme.colors.muted} />
          </View>
        )}
      </View>

      <View
        style={{
          flex: 1,
          paddingVertical: mobileTheme.spacing.lg,
          paddingLeft: mobileTheme.spacing.md,
          paddingRight: mobileTheme.spacing.md
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <Text
            style={{
              fontSize: mobileTheme.typography.bodySemiBold.fontSize,
              fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
              color: mobileTheme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            {match.matchedOwnerName}
          </Text>
          <Text
            style={{
              fontSize: mobileTheme.typography.micro.fontSize,
              fontFamily: "Inter_500Medium",
              color: mobileTheme.colors.muted
            }}
          >
            {formatRelativeTime(match.createdAt)}
          </Text>
        </View>

        <Text
          style={{
            fontSize: mobileTheme.typography.caption.fontSize,
            fontFamily: "Inter_500Medium",
            color: mobileTheme.colors.muted,
            marginTop: 1
          }}
        >
          {myPet.name} x {theirPet.name}
        </Text>

        {match.lastMessagePreview &&
          match.lastMessagePreview !== "It's a match. Say hello!" && (
            <Text
              numberOfLines={1}
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                fontFamily: "Inter_400Regular",
                color: mobileTheme.colors.muted,
                marginTop: 3
              }}
            >
              {match.lastMessagePreview}
            </Text>
          )}
      </View>

      <View
        style={{
          justifyContent: "center",
          paddingRight: mobileTheme.spacing.md
        }}
      >
        <ChevronRight size={16} color={mobileTheme.colors.muted} />
      </View>

      {match.unreadCount > 0 && (
        <View
          style={{
            position: "absolute",
            top: 14,
            left: 62,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: mobileTheme.colors.primary,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 4
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: "700",
              color: mobileTheme.colors.white,
              fontFamily: "Inter_700Bold"
            }}
          >
            {match.unreadCount > 99 ? "99+" : match.unreadCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

interface DiscoveryDeckProps {
  cards: DiscoveryCard[];
  myPets: Pet[];
  isLoading: boolean;
  accessToken: string;
  onMatch: (
    myPet: Pet,
    matchedPet: Pet,
    ownerName: string,
    conversationId: string
  ) => void;
  queryClient: ReturnType<typeof useQueryClient>;
  onPetPress: (pet: Pet) => void;
}

function DiscoveryDeck({
  cards,
  myPets,
  isLoading,
  accessToken,
  onMatch,
  queryClient,
  onPetPress
}: DiscoveryDeckProps) {
  const activePetId = useSessionStore((state) => state.activePetId);
  const insets = useSafeAreaInsets();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const swipeLock = useRef(false);

  const activePet = useMemo(() => {
    if (activePetId) {
      return myPets.find((p) => p.id === activePetId) ?? null;
    }
    return myPets.length > 0 ? myPets[0] : null;
  }, [myPets, activePetId]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [cards]);

  const swipeMutation = useMutation({
    mutationFn: ({
      actorPetId,
      targetPetId,
      direction
    }: {
      actorPetId: string;
      targetPetId: string;
      direction: SwipeDirection;
    }) => createSwipe(accessToken, actorPetId, targetPetId, direction),
    onSuccess: (matchResult) => {
      if (matchResult) {
        const card = cards[currentIndex];
        if (card && activePet) {
          onMatch(
            activePet,
            card.pet,
            card.owner.firstName,
            matchResult.conversationId
          );
        }
      }
      queryClient.invalidateQueries({
        queryKey: ["discovery-feed", accessToken]
      });
      queryClient.invalidateQueries({ queryKey: ["matches", accessToken] });
      setCurrentIndex((prev) => prev + 1);
      setIsSwiping(false);
      swipeLock.current = false;
    },
    onError: () => {
      setIsSwiping(false);
      swipeLock.current = false;
    }
  });

  const handleSwipeAction = useCallback(
    (direction: SwipeDirection) => {
      if (swipeLock.current || isSwiping || currentIndex >= cards.length)
        return;
      swipeLock.current = true;
      setIsSwiping(true);
      const card = cards[currentIndex];
      if (!card || !activePet) {
        setIsSwiping(false);
        swipeLock.current = false;
        return;
      }
      swipeMutation.mutate({
        actorPetId: activePet.id,
        targetPetId: card.pet.id,
        direction
      });
    },
    [cards, currentIndex, activePet, isSwiping, swipeMutation, onMatch]
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text
          style={{
            color: mobileTheme.colors.muted,
            fontFamily: "Inter_400Regular"
          }}
        >
          Loading pets...
        </Text>
      </View>
    );
  }

  if (!activePet) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: mobileTheme.spacing.xl
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: mobileTheme.colors.primaryBg,
            justifyContent: "center",
            alignItems: "center",
            marginBottom: mobileTheme.spacing.lg
          }}
        >
          <Plus size={28} color={mobileTheme.colors.primary} />
        </View>
        <Text
          style={{
            fontSize: mobileTheme.typography.subheading.fontSize,
            fontWeight: mobileTheme.typography.subheading.fontWeight,
            color: mobileTheme.colors.ink,
            fontFamily: "Inter_600SemiBold",
            textAlign: "center"
          }}
        >
          Add a pet first
        </Text>
        <Text
          style={{
            color: mobileTheme.colors.muted,
            lineHeight: mobileTheme.typography.body.lineHeight,
            textAlign: "center",
            fontSize: mobileTheme.typography.body.fontSize,
            fontFamily: "Inter_400Regular",
            maxWidth: 260,
            marginTop: mobileTheme.spacing.md
          }}
        >
          You need at least one pet profile to start discovering other pets.
        </Text>
      </View>
    );
  }

  if (!cards.length) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: mobileTheme.spacing.xl
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: mobileTheme.colors.successBg,
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <Search size={28} color={mobileTheme.colors.success} />
        </View>
        <Text
          style={{
            fontSize: mobileTheme.typography.subheading.fontSize,
            fontWeight: mobileTheme.typography.subheading.fontWeight,
            color: mobileTheme.colors.ink,
            fontFamily: "Inter_600SemiBold",
            marginTop: mobileTheme.spacing.md
          }}
        >
          No new pets nearby
        </Text>
        <Text
          style={{
            color: mobileTheme.colors.muted,
            lineHeight: mobileTheme.typography.body.lineHeight,
            textAlign: "center",
            fontSize: mobileTheme.typography.body.fontSize,
            fontFamily: "Inter_400Regular",
            maxWidth: 260,
            marginTop: mobileTheme.spacing.sm
          }}
        >
          Check back later for new pets in your area.
        </Text>
      </View>
    );
  }

  if (currentIndex >= cards.length) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: mobileTheme.spacing.xl
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: mobileTheme.colors.likeGreenBg,
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <Check size={28} color={mobileTheme.colors.likeGreen} />
        </View>
        <Text
          style={{
            fontSize: mobileTheme.typography.subheading.fontSize,
            fontWeight: mobileTheme.typography.subheading.fontWeight,
            color: mobileTheme.colors.ink,
            fontFamily: "Inter_600SemiBold",
            marginTop: mobileTheme.spacing.md
          }}
        >
          No more pets to discover
        </Text>
        <Text
          style={{
            color: mobileTheme.colors.muted,
            lineHeight: mobileTheme.typography.body.lineHeight,
            textAlign: "center",
            fontSize: mobileTheme.typography.body.fontSize,
            fontFamily: "Inter_400Regular",
            maxWidth: 260,
            marginTop: mobileTheme.spacing.sm
          }}
        >
          Check back later for new pets in your area.
        </Text>
        <PrimaryButton
          label="Refresh"
          onPress={() => {
            setCurrentIndex(0);
            queryClient.invalidateQueries({
              queryKey: ["discovery-feed", accessToken]
            });
          }}
          size="sm"
          variant="ghost"
          style={{ marginTop: mobileTheme.spacing.md }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingHorizontal: mobileTheme.spacing.lg }}>
        <SwipeableCard
          card={cards[currentIndex]!}
          onSwipe={handleSwipeAction}
          onPetPress={onPetPress}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          gap: mobileTheme.spacing.xl,
          alignItems: "center",
          justifyContent: "center",
          paddingTop: mobileTheme.spacing.sm,
          paddingBottom: Math.max(insets.bottom, mobileTheme.spacing.lg)
        }}
      >
        <ActionButton
          icon={<X size={24} color={mobileTheme.colors.passRed} />}
          color={mobileTheme.colors.surface}
          borderColor={mobileTheme.colors.passRed}
          size={56}
          onPress={() => handleSwipeAction("pass")}
          disabled={isSwiping}
        />
        <ActionButton
          icon={<Star size={20} color={mobileTheme.colors.starGold} />}
          color={mobileTheme.colors.surface}
          borderColor={mobileTheme.colors.starGold}
          size={44}
          onPress={() => handleSwipeAction("super-like")}
          disabled={isSwiping}
        />
        <ActionButton
          icon={<Heart size={24} color={mobileTheme.colors.white} />}
          color={mobileTheme.colors.primary}
          borderColor={mobileTheme.colors.primary}
          size={56}
          onPress={() => handleSwipeAction("like")}
          disabled={isSwiping}
        />
      </View>
    </View>
  );
}

interface SwipeableCardProps {
  card: DiscoveryCard;
  onSwipe: (direction: SwipeDirection) => void;
  onPetPress: (pet: Pet) => void;
}

function SwipeableCard({ card, onSwipe, onPetPress }: SwipeableCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const cardRotation = useRef(new Animated.Value(0)).current;
  const likeOpacity = useRef(new Animated.Value(0)).current;
  const nopeOpacity = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);
  const isHorizontalSwipe = useRef(false);

  const photos = card.pet.photos.filter((p) => p.url && p.url.length > 0);

  const resetValues = useCallback(() => {
    translateX.setOffset(0);
    cardRotation.setOffset(0);
    translateX.setValue(0);
    cardRotation.setValue(0);
    likeOpacity.setValue(0);
    nopeOpacity.setValue(0);
    animating.current = false;
    isHorizontalSwipe.current = false;
  }, [translateX, cardRotation, likeOpacity, nopeOpacity]);

  const animateOut = useCallback(
    (direction: SwipeDirection) => {
      animating.current = true;
      if (direction === "like") {
        Animated.parallel([
          Animated.timing(translateX, {
            toValue: SCREEN_WIDTH * 1.5,
            duration: 350,
            useNativeDriver: true
          }),
          Animated.timing(likeOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true
          })
        ]).start(() => resetValues());
      } else if (direction === "pass") {
        Animated.parallel([
          Animated.timing(translateX, {
            toValue: -SCREEN_WIDTH * 1.5,
            duration: 350,
            useNativeDriver: true
          }),
          Animated.timing(nopeOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true
          })
        ]).start(() => resetValues());
      } else {
        Animated.timing(translateX, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true
        }).start(() => resetValues());
      }
      onSwipe(direction);
    },
    [translateX, likeOpacity, nopeOpacity, resetValues, onSwipe]
  );

  const springBack = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200
      }),
      Animated.spring(cardRotation, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200
      })
    ]).start();
    Animated.timing(likeOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true
    }).start();
    Animated.timing(nopeOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true
    }).start();
  }, [translateX, cardRotation, likeOpacity, nopeOpacity]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gs) => {
          if (Math.abs(gs.dx) > 10) {
            isHorizontalSwipe.current = true;
          }
          return Math.abs(gs.dx) > 10;
        },
        onPanResponderMove: (_, gs) => {
          if (animating.current) return;
          if (!isHorizontalSwipe.current && Math.abs(gs.dx) < 10) return;
          translateX.setValue(gs.dx);
          cardRotation.setValue(gs.dx / (SCREEN_WIDTH * 2));
          likeOpacity.setValue(gs.dx > 30 ? 1 : 0);
          nopeOpacity.setValue(gs.dx < -30 ? 1 : 0);
        },
        onPanResponderRelease: (_, gs) => {
          if (animating.current) return;
          isHorizontalSwipe.current = false;
          if (gs.dx > SWIPE_THRESHOLD) {
            animateOut("like");
          } else if (gs.dx < -SWIPE_THRESHOLD) {
            animateOut("pass");
          } else {
            springBack();
          }
        },
        onPanResponderTerminate: () => {
          if (animating.current) return;
          isHorizontalSwipe.current = false;
          springBack();
        }
      }),
    [
      translateX,
      cardRotation,
      likeOpacity,
      nopeOpacity,
      animating,
      animateOut,
      springBack
    ]
  );

  const animatedStyle = {
    transform: [
      { translateX },
      {
        rotate: cardRotation.interpolate({
          inputRange: [-0.3, 0, 0.3],
          outputRange: ["-8deg", "0deg", "8deg"]
        })
      }
    ]
  };

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[{ flex: 1 }, animatedStyle]}
    >
      <Pressable onPress={() => onPetPress(card.pet)} style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            borderRadius: mobileTheme.radius.xl,
            overflow: "hidden",
            backgroundColor: mobileTheme.colors.surface,
            ...mobileTheme.shadow.lg
          }}
        >
          {photos.length > 0 ? (
            <Image
              source={{ uri: photos[0]?.url ?? "" }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                flex: 1,
                backgroundColor: mobileTheme.colors.background,
                justifyContent: "center",
                alignItems: "center"
              }}
            >
              <Text style={{ fontSize: 64 }}>{"\uD83D\uDC3E"}</Text>
            </View>
          )}

          {photos.length > 1 && (
            <View
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                zIndex: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: "rgba(0,0,0,0.4)",
                borderRadius: mobileTheme.radius.pill,
                paddingHorizontal: 10,
                paddingVertical: 5
              }}
            >
              <ImageIcon size={11} color={mobileTheme.colors.white} />
              <Text
                style={{
                  color: mobileTheme.colors.white,
                  fontSize: 11,
                  fontWeight: "600",
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                {photos.length}
              </Text>
            </View>
          )}

          <Animated.View
            style={[
              {
                position: "absolute",
                top: 28,
                left: 14,
                zIndex: 10,
                borderRadius: mobileTheme.radius.sm,
                borderWidth: 3,
                borderColor: mobileTheme.colors.likeGreen,
                paddingHorizontal: mobileTheme.spacing.md,
                paddingVertical: mobileTheme.spacing.xs,
                transform: [{ rotate: "-12deg" }]
              },
              { opacity: likeOpacity }
            ]}
          >
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                color: mobileTheme.colors.likeGreen,
                fontFamily: "Inter_800ExtraBold"
              }}
            >
              LIKE
            </Text>
          </Animated.View>

          <Animated.View
            style={[
              {
                position: "absolute",
                top: 28,
                right: 14,
                zIndex: 10,
                borderRadius: mobileTheme.radius.sm,
                borderWidth: 3,
                borderColor: mobileTheme.colors.passRed,
                paddingHorizontal: mobileTheme.spacing.md,
                paddingVertical: mobileTheme.spacing.xs,
                transform: [{ rotate: "12deg" }]
              },
              { opacity: nopeOpacity }
            ]}
          >
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                color: mobileTheme.colors.passRed,
                fontFamily: "Inter_800ExtraBold"
              }}
            >
              NOPE
            </Text>
          </Animated.View>

          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              paddingTop: 40,
              paddingBottom: 16,
              paddingHorizontal: 16,
              backgroundColor: "rgba(0,0,0,0.45)"
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: mobileTheme.typography.heading.fontSize,
                  fontWeight: "800",
                  color: mobileTheme.colors.white,
                  fontFamily: "Inter_800ExtraBold",
                  lineHeight: mobileTheme.typography.heading.lineHeight,
                  textShadowColor: "rgba(0,0,0,0.3)",
                  textShadowOffset: { width: 0, height: 1 },
                  flex: 1
                }}
              >
                {card.pet.name}, {card.pet.ageYears}
              </Text>
              {card.pet.isNeutered && (
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: "rgba(255,255,255,0.2)",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Check size={10} color={mobileTheme.colors.white} />
                </View>
              )}
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                marginTop: 3
              }}
            >
              {card.distanceLabel ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 2
                  }}
                >
                  <MapPin size={11} color={mobileTheme.colors.white} />
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.8)",
                      fontSize: 11,
                      fontFamily: "Inter_500Medium"
                    }}
                  >
                    {card.distanceLabel}
                  </Text>
                </View>
              ) : null}
              {card.distanceLabel && card.pet.breedLabel ? (
                <View
                  style={{
                    width: 2,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor: "rgba(255,255,255,0.5)"
                  }}
                />
              ) : null}
              {card.pet.breedLabel ? (
                <Text
                  style={{
                    color: "rgba(255,255,255,0.8)",
                    fontSize: 11,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  {card.pet.breedLabel}
                </Text>
              ) : null}
            </View>

            {card.pet.bio ? (
              <Text
                numberOfLines={2}
                style={{
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 13,
                  fontFamily: "Inter_400Regular",
                  lineHeight: 18,
                  marginTop: 6
                }}
              >
                {card.pet.bio}
              </Text>
            ) : null}

            {card.prompt ? (
              <Text
                numberOfLines={1}
                style={{
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 11,
                  fontFamily: "Inter_400Regular",
                  lineHeight: 14,
                  marginTop: 3,
                  fontStyle: "italic"
                }}
              >
                &ldquo;{card.prompt}&rdquo;
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  size: number;
  onPress: () => void;
  disabled?: boolean;
}

function ActionButton({
  icon,
  color,
  borderColor,
  size,
  onPress,
  disabled
}: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
        borderWidth: 2,
        borderColor,
        ...mobileTheme.shadow.md
      }}
    >
      {icon}
    </Pressable>
  );
}

interface MatchCelebrationModalProps {
  visible: boolean;
  myPet: Pet | null;
  matchedPet: Pet | null;
  ownerName: string;
  conversationId: string;
  onDismiss: () => void;
}

function MatchCelebrationModal({
  visible,
  myPet,
  matchedPet,
  ownerName,
  conversationId,
  onDismiss
}: MatchCelebrationModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onDismiss}
    >
      <Pressable
        onPress={onDismiss}
        style={{
          flex: 1,
          backgroundColor: "rgba(22,21,20,0.5)",
          justifyContent: "center",
          alignItems: "center"
        }}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View
            style={{
              borderRadius: mobileTheme.radius.xl,
              backgroundColor: mobileTheme.colors.surface,
              paddingVertical: mobileTheme.spacing["3xl"],
              paddingHorizontal: mobileTheme.spacing["2xl"],
              alignItems: "center",
              gap: mobileTheme.spacing.lg,
              width: SCREEN_WIDTH * 0.85,
              ...mobileTheme.shadow.lg
            }}
          >
            <View
              style={{
                position: "absolute",
                top: -60,
                width: 120,
                height: 120,
                borderRadius: 60,
                backgroundColor: mobileTheme.colors.primarySoft,
                opacity: 0.6
              }}
            />

            <View
              style={{
                flexDirection: "row",
                gap: mobileTheme.spacing.xl,
                alignItems: "center"
              }}
            >
              {myPet?.photos[0]?.url ? (
                <View style={{ alignItems: "center" }}>
                  <Image
                    source={{ uri: myPet.photos[0].url }}
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: 44,
                      borderWidth: 3,
                      borderColor: mobileTheme.colors.primary,
                      ...mobileTheme.shadow.md
                    }}
                    resizeMode="cover"
                  />
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.caption.fontSize,
                      fontFamily: "Inter_600SemiBold",
                      color: mobileTheme.colors.ink,
                      marginTop: 6
                    }}
                  >
                    {myPet.name}
                  </Text>
                </View>
              ) : null}

              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: mobileTheme.colors.primaryBg,
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 10
                }}
              >
                <Heart size={16} color={mobileTheme.colors.primary} />
              </View>

              {matchedPet?.photos[0]?.url ? (
                <View style={{ alignItems: "center" }}>
                  <Image
                    source={{ uri: matchedPet.photos[0].url }}
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: 44,
                      borderWidth: 3,
                      borderColor: mobileTheme.colors.primary,
                      ...mobileTheme.shadow.md
                    }}
                    resizeMode="cover"
                  />
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.caption.fontSize,
                      fontFamily: "Inter_600SemiBold",
                      color: mobileTheme.colors.ink,
                      marginTop: 6
                    }}
                  >
                    {matchedPet.name}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text
              style={{
                fontSize: mobileTheme.typography.heading.fontSize,
                fontWeight: mobileTheme.typography.heading.fontWeight,
                color: mobileTheme.colors.ink,
                textAlign: "center",
                fontFamily: "Inter_700Bold"
              }}
            >
              It&apos;s a Match!
            </Text>

            <Text
              style={{
                color: mobileTheme.colors.muted,
                textAlign: "center",
                lineHeight: mobileTheme.typography.body.lineHeight,
                fontSize: mobileTheme.typography.body.fontSize,
                fontFamily: "Inter_400Regular",
                maxWidth: 260
              }}
            >
              {myPet && matchedPet
                ? `${myPet.name} and ${matchedPet.name} like each other! Start a conversation now.`
                : "Your pets like each other! Start a conversation now."}
            </Text>

            <View
              style={{
                width: "100%",
                gap: mobileTheme.spacing.sm,
                marginTop: mobileTheme.spacing.sm
              }}
            >
              <PrimaryButton label="Send Message" onPress={onDismiss} />
              <PrimaryButton
                label="Keep Swiping"
                onPress={onDismiss}
                variant="ghost"
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
