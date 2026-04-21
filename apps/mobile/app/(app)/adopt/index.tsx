// Fetcht adopter discovery home. Top surface for the adoption
// module: category tabs, persistent quick filters, 5 curated rails
// (Near you / Recently added / Urgent / Long-term residents /
// Featured shelters), and a relevance-sorted main grid. Everything
// persists through AsyncStorage so the user's last tab + filters
// survive a cold launch.
//
// Rails are client-side slices over ONE list fetch — keeps the page
// snappy. Only Featured Shelters needs its own request (they're
// shelter objects, not pet objects).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Localization from "expo-localization";
import {
  AlertTriangle,
  BadgeCheck,
  Clock,
  Heart,
  Inbox,
  MapPin,
  PawPrint,
  Search,
  Sparkles,
  Stethoscope,
  X
} from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { AdoptablePetCard } from "@/components/adoptable-pet-card";
import { LottieLoading } from "@/components/lottie-loading";
import {
  addFavorite,
  listAdoptablePets,
  listFavorites,
  listFeaturedShelters,
  removeFavorite
} from "@/lib/api";
import { getCachedLocation, refreshLocation } from "@/lib/location";
import { resolveDistanceUnit } from "@/lib/adoption-format";
import {
  ageBucketsToMonths,
  DEFAULT_PREFS,
  distanceKmValue,
  loadDiscoveryPrefs,
  saveDiscoveryPrefs,
  speciesFilterForTab,
  type AgeBucket,
  type DiscoveryPrefs,
  type DistanceKey,
  type SexValue,
  type SizeBucket,
  type SpeciesTab
} from "@/lib/discovery-prefs";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import type { Shelter, ShelterPet } from "@petto/contracts";

// ── Static option lists ────────────────────────────────────────────

const SPECIES_TABS: { value: SpeciesTab; label: string }[] = [
  { value: "dog", label: "Dogs" },
  { value: "cat", label: "Cats" },
  { value: "other", label: "Other" }
];

const AGE_OPTIONS: { value: AgeBucket; label: string }[] = [
  { value: "puppy", label: "Puppy / Kitten" },
  { value: "young", label: "Young (6m–2y)" },
  { value: "adult", label: "Adult (2–7y)" },
  { value: "senior", label: "Senior (7y+)" }
];

const SIZE_OPTIONS: { value: SizeBucket; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "xl", label: "XL" }
];

const SEX_OPTIONS: { value: SexValue; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" }
];

const DISTANCE_OPTIONS: { value: DistanceKey; label: string }[] = [
  { value: "5", label: "5 km" },
  { value: "10", label: "10 km" },
  { value: "25", label: "25 km" },
  { value: "50", label: "50 km" },
  { value: "any", label: "Any" }
];

// ── Component ──────────────────────────────────────────────────────

export default function DiscoveryHomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const token = session?.tokens.accessToken ?? "";
  const queryClient = useQueryClient();

  // Persisted prefs. Load once, save on every change.
  const [prefs, setPrefs] = useState<DiscoveryPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    void loadDiscoveryPrefs().then((p) => {
      setPrefs(p);
      setPrefsLoaded(true);
    });
  }, []);
  const updatePrefs = useCallback((patch: Partial<DiscoveryPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      void saveDiscoveryPrefs(next);
      return next;
    });
  }, []);

  // Locale-aware distance unit + cached user location (opt-in on
  // first permission grant).
  const distanceUnit = useMemo(
    () => resolveDistanceUnit(Localization.getLocales()[0]?.languageTag),
    []
  );
  const [userLoc, setUserLoc] = useState<
    { latitude: number; longitude: number } | null
  >(null);
  useEffect(() => {
    void (async () => {
      const cached = await getCachedLocation();
      if (cached) {
        setUserLoc({ latitude: cached.latitude, longitude: cached.longitude });
      } else {
        const res = await refreshLocation();
        if (res.status === "granted") {
          setUserLoc({ latitude: res.location.latitude, longitude: res.location.longitude });
        }
      }
    })();
  }, []);

  // API filters derived from prefs. Age buckets collapse to min/max
  // months; sex/size multi-select = client-side filter because the
  // current backend column equality only supports one value at a time
  // and the UI needs multi.
  const ageRange = useMemo(() => ageBucketsToMonths(prefs.age), [prefs.age]);
  const maxDistanceKm = useMemo(() => distanceKmValue(prefs.distance), [prefs.distance]);

  const { data: pets = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["adoption-pets", prefs, userLoc],
    queryFn: () =>
      listAdoptablePets(
        token,
        {
          species: speciesFilterForTab(prefs.species),
          sex: prefs.sex.length === 1 ? prefs.sex[0] : undefined,
          size: prefs.size.length === 1 ? prefs.size[0] : undefined,
          minAgeMonths: ageRange?.minAgeMonths,
          maxAgeMonths: ageRange?.maxAgeMonths,
          specialNeedsOnly: prefs.specialNeedsOnly,
          maxDistanceKm: maxDistanceKm > 0 ? maxDistanceKm : undefined,
          limit: 100
        },
        userLoc ?? undefined
      ),
    enabled: Boolean(token) && prefsLoaded,
    staleTime: 60_000
  });

  // Client-side narrowing when the user picks more than one sex/size.
  const filteredPets = useMemo(() => {
    let list = pets;
    if (prefs.sex.length > 1) {
      list = list.filter((p) => prefs.sex.includes(p.sex as SexValue));
    }
    if (prefs.size.length > 1) {
      list = list.filter((p) => prefs.size.includes(p.size as SizeBucket));
    }
    return list;
  }, [pets, prefs.sex, prefs.size]);

  // Rails — memoised slices over the filtered list.
  const nearYou = useMemo(
    () =>
      userLoc
        ? filteredPets
            .filter((p) => p.distanceKm != null && p.distanceKm! < 10)
            .slice(0, 15)
        : [],
    [filteredPets, userLoc]
  );
  const recentlyAdded = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return filteredPets
      .filter((p) => {
        const ts = new Date(p.publishedAt ?? p.createdAt).getTime();
        return Number.isFinite(ts) && ts > cutoff;
      })
      .slice(0, 15);
  }, [filteredPets]);
  const urgent = useMemo(
    () => filteredPets.filter((p) => p.isUrgent === true).slice(0, 15),
    [filteredPets]
  );
  const longTerm = useMemo(() => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    return filteredPets
      .filter((p) => {
        const ts = new Date(p.publishedAt ?? p.createdAt).getTime();
        return Number.isFinite(ts) && ts < cutoff;
      })
      .slice(0, 15);
  }, [filteredPets]);

  // Featured shelters — its own tiny query.
  const { data: featured = [] } = useQuery({
    queryKey: ["featured-shelters"],
    queryFn: listFeaturedShelters,
    staleTime: 10 * 60_000
  });

  // Main grid = filteredPets minus rails-already-shown, sorted by
  // composite recency+distance. No re-sort when location is null.
  const railIds = useMemo(() => {
    const ids = new Set<string>();
    for (const list of [nearYou, recentlyAdded, urgent, longTerm]) {
      for (const p of list) ids.add(p.id);
    }
    return ids;
  }, [nearYou, recentlyAdded, urgent, longTerm]);
  const mainGrid = useMemo(() => {
    const rest = filteredPets.filter((p) => !railIds.has(p.id));
    if (!userLoc) return rest;
    const now = Date.now();
    return rest
      .map((p) => {
        const ts = new Date(p.publishedAt ?? p.createdAt).getTime();
        const ageDays = Number.isFinite(ts) ? (now - ts) / (1000 * 60 * 60 * 24) : 365;
        const recencyBonus = Math.max(0, 30 - ageDays);
        const distancePenalty = p.distanceKm ?? 50;
        return { p, score: recencyBonus - distancePenalty };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);
  }, [filteredPets, railIds, userLoc]);

  // Favorites with optimistic UI.
  const { data: favorites = [] } = useQuery({
    queryKey: ["favorites"],
    queryFn: () => listFavorites(token),
    enabled: Boolean(token),
    staleTime: 60_000
  });
  const favSet = useMemo(() => new Set(favorites.map((p) => p.id)), [favorites]);
  const toggleFav = useMutation({
    mutationFn: async (petId: string) => {
      if (favSet.has(petId)) await removeFavorite(token, petId);
      else await addFavorite(token, petId);
    },
    onMutate: (petId: string) => {
      const previous = queryClient.getQueryData<typeof favorites>(["favorites"]);
      queryClient.setQueryData<typeof favorites>(["favorites"], (cur) => {
        const list = cur ?? [];
        if (favSet.has(petId)) return list.filter((p) => p.id !== petId);
        const stub = filteredPets.find((p) => p.id === petId);
        return stub ? [...list, stub as any] : list;
      });
      return { previous };
    },
    onError: (_err, _petId, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["favorites"], ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    }
  });

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={["top"]}
    >
      <Header
        theme={theme}
        onOpenFavorites={() => router.push("/(app)/favorites" as any)}
        onOpenMyApps={() => router.push("/(app)/my-applications" as any)}
      />

      <FlatList
        data={mainGrid}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{
          gap: mobileTheme.spacing.sm,
          paddingHorizontal: mobileTheme.spacing.xl
        }}
        contentContainerStyle={{
          paddingBottom: 40,
          paddingTop: 8,
          gap: mobileTheme.spacing.sm
        }}
        ListHeaderComponent={
          <View>
            <CategoryTabs
              value={prefs.species}
              onChange={(v) => updatePrefs({ species: v })}
              theme={theme}
            />
            <QuickFilters
              prefs={prefs}
              onChange={updatePrefs}
              showDistance={!!userLoc}
              theme={theme}
            />
            {nearYou.length > 0 && (
              <Rail
                title="Near you"
                icon={<MapPin size={13} color={theme.colors.primary} />}
                pets={nearYou}
                favSet={favSet}
                onFavToggle={(id) => toggleFav.mutate(id)}
                onPetPress={(id) => router.push(`/(app)/adopt/${id}` as any)}
                distanceUnit={distanceUnit}
                theme={theme}
              />
            )}
            {recentlyAdded.length > 0 && (
              <Rail
                title="Recently added"
                icon={<Sparkles size={13} color={theme.colors.primary} />}
                pets={recentlyAdded}
                favSet={favSet}
                onFavToggle={(id) => toggleFav.mutate(id)}
                onPetPress={(id) => router.push(`/(app)/adopt/${id}` as any)}
                distanceUnit={distanceUnit}
                theme={theme}
              />
            )}
            {urgent.length > 0 && (
              <Rail
                title="Urgent"
                icon={<AlertTriangle size={13} color="#DC2626" />}
                pets={urgent}
                favSet={favSet}
                onFavToggle={(id) => toggleFav.mutate(id)}
                onPetPress={(id) => router.push(`/(app)/adopt/${id}` as any)}
                distanceUnit={distanceUnit}
                theme={theme}
              />
            )}
            {longTerm.length > 0 && (
              <Rail
                title="Long-term residents"
                icon={<Clock size={13} color={theme.colors.primary} />}
                pets={longTerm}
                favSet={favSet}
                onFavToggle={(id) => toggleFav.mutate(id)}
                onPetPress={(id) => router.push(`/(app)/adopt/${id}` as any)}
                distanceUnit={distanceUnit}
                theme={theme}
              />
            )}
            {featured.length > 0 && (
              <FeaturedSheltersRail
                shelters={featured}
                onShelterPress={(id) =>
                  router.push(`/(app)/shelter/${id}` as any)
                }
                theme={theme}
              />
            )}
            {mainGrid.length > 0 && (
              <View
                style={{
                  paddingHorizontal: mobileTheme.spacing.xl,
                  paddingTop: mobileTheme.spacing.lg,
                  paddingBottom: mobileTheme.spacing.sm
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: "Inter_700Bold",
                    color: theme.colors.muted,
                    letterSpacing: 0.6,
                    textTransform: "uppercase"
                  }}
                >
                  All listings
                </Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={{ paddingVertical: 60, alignItems: "center" }}>
              <LottieLoading />
            </View>
          ) : (
            <View
              style={{
                paddingVertical: 60,
                alignItems: "center",
                paddingHorizontal: mobileTheme.spacing.xl
              }}
            >
              <PawPrint size={32} color={theme.colors.muted} />
              <Text
                style={{
                  marginTop: 10,
                  fontSize: 14,
                  fontFamily: "Inter_600SemiBold",
                  color: theme.colors.ink
                }}
              >
                No pets match those filters
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  fontFamily: "Inter_400Regular",
                  color: theme.colors.muted,
                  textAlign: "center"
                }}
              >
                Try widening your search — more pets are added every week.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <AdoptablePetCard
            pet={item}
            favorited={favSet.has(item.id)}
            onToggleFavorite={() => toggleFav.mutate(item.id)}
            onPress={() => router.push(`/(app)/adopt/${item.id}` as any)}
            distanceUnit={distanceUnit}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      />
    </SafeAreaView>
  );
}

// ── Header ───────────────────────────────────────────────────────

function Header({
  theme,
  onOpenFavorites,
  onOpenMyApps
}: {
  theme: ReturnType<typeof useTheme>;
  onOpenFavorites: () => void;
  onOpenMyApps: () => void;
}) {
  return (
    <View
      style={{
        paddingHorizontal: mobileTheme.spacing.xl,
        paddingVertical: mobileTheme.spacing.md,
        flexDirection: "row",
        alignItems: "center",
        gap: mobileTheme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.surface
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 10,
            fontFamily: "Inter_700Bold",
            color: theme.colors.primary,
            letterSpacing: 0.6,
            textTransform: "uppercase"
          }}
        >
          Adopt
        </Text>
        <Text
          style={{
            marginTop: 1,
            fontSize: 19,
            fontFamily: "Inter_700Bold",
            color: theme.colors.ink
          }}
        >
          Find your match
        </Text>
      </View>
      <Pressable
        onPress={onOpenFavorites}
        hitSlop={6}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.primaryBg,
          opacity: pressed ? 0.7 : 1
        })}
        accessibilityLabel="Favorites"
      >
        <Heart size={17} color={theme.colors.primary} />
      </Pressable>
      <Pressable
        onPress={onOpenMyApps}
        hitSlop={6}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.primaryBg,
          opacity: pressed ? 0.7 : 1
        })}
        accessibilityLabel="My applications"
      >
        <Inbox size={17} color={theme.colors.primary} />
      </Pressable>
    </View>
  );
}

// ── Category tabs ────────────────────────────────────────────────

function CategoryTabs({
  value,
  onChange,
  theme
}: {
  value: SpeciesTab;
  onChange: (v: SpeciesTab) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: mobileTheme.spacing.xl,
        paddingTop: mobileTheme.spacing.md,
        paddingBottom: mobileTheme.spacing.sm
      }}
    >
      {SPECIES_TABS.map((t) => {
        const on = value === t.value;
        return (
          <Pressable
            key={t.value}
            onPress={() => onChange(t.value)}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 10,
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: on ? theme.colors.primary : theme.colors.surface,
              borderWidth: 1,
              borderColor: on ? theme.colors.primary : theme.colors.border,
              alignItems: "center",
              opacity: pressed ? 0.85 : 1
            })}
          >
            <Text
              style={{
                fontSize: 12,
                fontFamily: "Inter_700Bold",
                color: on ? "#FFFFFF" : theme.colors.ink
              }}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Quick filters bar ─────────────────────────────────────────────

function QuickFilters({
  prefs,
  onChange,
  showDistance,
  theme
}: {
  prefs: DiscoveryPrefs;
  onChange: (patch: Partial<DiscoveryPrefs>) => void;
  showDistance: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const [open, setOpen] = useState<"age" | "size" | "sex" | "distance" | null>(null);
  const hasAny =
    prefs.age.length > 0 ||
    prefs.size.length > 0 ||
    prefs.sex.length > 0 ||
    prefs.distance !== "any" ||
    prefs.specialNeedsOnly;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: 6,
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingVertical: 6
        }}
      >
        <FilterChip
          label={prefs.age.length > 0 ? `Age · ${prefs.age.length}` : "Age"}
          active={prefs.age.length > 0}
          onPress={() => setOpen("age")}
          theme={theme}
        />
        <FilterChip
          label={prefs.size.length > 0 ? `Size · ${prefs.size.length}` : "Size"}
          active={prefs.size.length > 0}
          onPress={() => setOpen("size")}
          theme={theme}
        />
        <FilterChip
          label={prefs.sex.length > 0 ? `Sex · ${prefs.sex.length}` : "Sex"}
          active={prefs.sex.length > 0}
          onPress={() => setOpen("sex")}
          theme={theme}
        />
        {showDistance && (
          <FilterChip
            label={prefs.distance === "any" ? "Distance" : `${prefs.distance} km`}
            active={prefs.distance !== "any"}
            onPress={() => setOpen("distance")}
            theme={theme}
          />
        )}
        <FilterChip
          label="Special needs"
          active={prefs.specialNeedsOnly}
          onPress={() => onChange({ specialNeedsOnly: !prefs.specialNeedsOnly })}
          icon={
            <Stethoscope
              size={11}
              color={prefs.specialNeedsOnly ? "#FFFFFF" : theme.colors.ink}
            />
          }
          theme={theme}
        />
        {hasAny && (
          <FilterChip
            label="Clear"
            active={false}
            onPress={() =>
              onChange({
                age: [],
                size: [],
                sex: [],
                distance: "any",
                specialNeedsOnly: false
              })
            }
            icon={<X size={11} color={theme.colors.muted} />}
            theme={theme}
          />
        )}
      </ScrollView>

      <FilterModal
        open={open !== null}
        title={
          open === "age"
            ? "Age"
            : open === "size"
              ? "Size"
              : open === "sex"
                ? "Sex"
                : "Distance"
        }
        onClose={() => setOpen(null)}
        theme={theme}
      >
        {open === "age" && (
          <MultiSelect
            options={AGE_OPTIONS}
            value={prefs.age}
            onChange={(v) => onChange({ age: v })}
            theme={theme}
          />
        )}
        {open === "size" && (
          <MultiSelect
            options={SIZE_OPTIONS}
            value={prefs.size}
            onChange={(v) => onChange({ size: v })}
            theme={theme}
          />
        )}
        {open === "sex" && (
          <MultiSelect
            options={SEX_OPTIONS}
            value={prefs.sex}
            onChange={(v) => onChange({ sex: v })}
            theme={theme}
          />
        )}
        {open === "distance" && (
          <SingleSelect
            options={DISTANCE_OPTIONS}
            value={prefs.distance}
            onChange={(v) => {
              onChange({ distance: v });
              setOpen(null);
            }}
            theme={theme}
          />
        )}
      </FilterModal>
    </>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  icon,
  theme
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: mobileTheme.radius.pill,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary : theme.colors.border,
        backgroundColor: active ? theme.colors.primary : theme.colors.surface,
        opacity: pressed ? 0.85 : 1
      })}
    >
      {icon}
      <Text
        style={{
          fontSize: 11,
          fontFamily: "Inter_700Bold",
          color: active ? "#FFFFFF" : theme.colors.ink
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FilterModal({
  open,
  title,
  onClose,
  theme,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.4)",
          justifyContent: "flex-end"
        }}
      >
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingTop: mobileTheme.spacing.xl,
            paddingBottom: mobileTheme.spacing.xl,
            gap: mobileTheme.spacing.md
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
              style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: theme.colors.ink }}
            >
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={18} color={theme.colors.ink} />
            </Pressable>
          </View>
          {children}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({
              paddingVertical: 12,
              alignItems: "center",
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: theme.colors.primary,
              opacity: pressed ? 0.9 : 1
            })}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontFamily: "Inter_700Bold" }}>
              Done
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function MultiSelect<T extends string>({
  options,
  value,
  onChange,
  theme
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ gap: 6 }}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value]);
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 12,
              paddingHorizontal: mobileTheme.spacing.md,
              borderRadius: mobileTheme.radius.md,
              borderWidth: 1,
              borderColor: on ? theme.colors.primary : theme.colors.border,
              backgroundColor: on ? theme.colors.primaryBg : "transparent",
              opacity: pressed ? 0.85 : 1
            })}
          >
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Inter_600SemiBold",
                color: theme.colors.ink
              }}
            >
              {o.label}
            </Text>
            {on ? (
              <BadgeCheck size={16} color={theme.colors.primary} />
            ) : (
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border
                }}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function SingleSelect<T extends string>({
  options,
  value,
  onChange,
  theme
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ gap: 6 }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 12,
              paddingHorizontal: mobileTheme.spacing.md,
              borderRadius: mobileTheme.radius.md,
              borderWidth: 1,
              borderColor: on ? theme.colors.primary : theme.colors.border,
              backgroundColor: on ? theme.colors.primaryBg : "transparent",
              opacity: pressed ? 0.85 : 1
            })}
          >
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Inter_600SemiBold",
                color: theme.colors.ink
              }}
            >
              {o.label}
            </Text>
            {on && <BadgeCheck size={16} color={theme.colors.primary} />}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Rail ──────────────────────────────────────────────────────────

function Rail({
  title,
  icon,
  pets,
  favSet,
  onFavToggle,
  onPetPress,
  distanceUnit,
  theme
}: {
  title: string;
  icon: React.ReactNode;
  pets: ShelterPet[];
  favSet: Set<string>;
  onFavToggle: (id: string) => void;
  onPetPress: (id: string) => void;
  distanceUnit: "km" | "mi";
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ marginTop: mobileTheme.spacing.lg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: mobileTheme.spacing.xl,
          marginBottom: 8
        }}
      >
        {icon}
        <Text
          style={{
            fontSize: 12,
            fontFamily: "Inter_700Bold",
            color: theme.colors.ink,
            letterSpacing: 0.2
          }}
        >
          {title}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: mobileTheme.spacing.sm,
          paddingHorizontal: mobileTheme.spacing.xl
        }}
      >
        {pets.map((pet) => (
          <View key={pet.id} style={{ width: 160 }}>
            <AdoptablePetCard
              pet={pet}
              favorited={favSet.has(pet.id)}
              onToggleFavorite={() => onFavToggle(pet.id)}
              onPress={() => onPetPress(pet.id)}
              distanceUnit={distanceUnit}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function FeaturedSheltersRail({
  shelters,
  onShelterPress,
  theme
}: {
  shelters: Shelter[];
  onShelterPress: (id: string) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ marginTop: mobileTheme.spacing.lg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: mobileTheme.spacing.xl,
          marginBottom: 8
        }}
      >
        <BadgeCheck size={13} color={theme.colors.primary} />
        <Text
          style={{
            fontSize: 12,
            fontFamily: "Inter_700Bold",
            color: theme.colors.ink,
            letterSpacing: 0.2
          }}
        >
          Featured shelters
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: mobileTheme.spacing.sm,
          paddingHorizontal: mobileTheme.spacing.xl
        }}
      >
        {shelters.map((sh) => (
          <Pressable
            key={sh.id}
            onPress={() => onShelterPress(sh.id)}
            style={({ pressed }) => ({
              width: 140,
              padding: mobileTheme.spacing.md,
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: "center",
              gap: 6,
              opacity: pressed ? 0.85 : 1
            })}
          >
            <Avatar uri={sh.logoUrl ?? undefined} name={sh.name} size="md" />
            <Text
              numberOfLines={1}
              style={{
                fontSize: 12,
                fontFamily: "Inter_700Bold",
                color: theme.colors.ink,
                textAlign: "center"
              }}
            >
              {sh.name}
            </Text>
            {sh.cityLabel ? (
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 10,
                  fontFamily: "Inter_500Medium",
                  color: theme.colors.muted
                }}
              >
                {sh.cityLabel}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
