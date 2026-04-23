// Adoption listing detail — the adopter-facing page inside the
// fetcht mobile app. Rebuilt from an earlier version now that the
// server returns a bundled {pet, microchipPresent, shelter,
// disclosure} payload with jurisdiction disclosures, denormalised
// shelter fields and a stripped microchip ID.
//
// Rules this screen enforces:
//   - Only listings in `published` state render (server returns 404
//     otherwise)
//   - Microchip ID never displayed — only the "Microchipped" badge
//   - Weight + distance render in locale-aware units (kg/km for
//     TR/EU, lbs/mi for GB/US)
//   - Favorite updates optimistically with silent rollback on error

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Localization from "expo-localization";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronRight,
  Flag,
  Heart,
  HeartHandshake,
  Info,
  MapPin,
  PawPrint,
  Share2,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
  X
} from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { LottieLoading } from "@/components/lottie-loading";
import {
  addAdoptionFavorite,
  createAdoptionApplication,
  getAdoptablePet,
  listAdoptionFavorites,
  listMyAdoptionApplications,
  removeAdoptionFavorite,
  trackPetView
} from "@/lib/api";
import { getCachedLocation } from "@/lib/location";
import {
  formatAge,
  formatDistance,
  formatWeight,
  humanChildren,
  humanExperience,
  humanHome,
  humanOtherPets,
  humanSex,
  humanVaccination,
  parseRequirements,
  resolveDistanceUnit,
  resolveWeightUnit
} from "@/lib/adoption-format";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import type { AdoptionApplicationInput } from "@petto/contracts";

export default function AdoptPetDetailPage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const token = session?.tokens.accessToken ?? "";

  const { petId } = useLocalSearchParams<{ petId: string }>();
  const id = Array.isArray(petId) ? petId[0] : petId;

  // Locale-aware unit resolution — runs once on mount.
  const distanceUnit = useMemo(
    () => resolveDistanceUnit(Localization.getLocales()[0]?.languageTag),
    []
  );
  const weightUnit = useMemo(
    () => resolveWeightUnit(Localization.getLocales()[0]?.languageTag),
    []
  );

  // User location for the distance badge — best-effort from cache.
  const [userLoc, setUserLoc] = useState<
    { latitude: number; longitude: number } | null
  >(null);
  useEffect(() => {
    void getCachedLocation().then((cached) => {
      if (cached) setUserLoc({ latitude: cached.latitude, longitude: cached.longitude });
    });
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["adoption-pet", id, userLoc],
    queryFn: () => getAdoptablePet(token, id as string, userLoc ?? undefined),
    enabled: Boolean(token && id),
    retry: false,
    staleTime: 30_000
  });

  // View tracking — fire once per load.
  const viewTrackedRef = useRef(false);
  useEffect(() => {
    if (data?.pet?.id && !viewTrackedRef.current) {
      viewTrackedRef.current = true;
      void trackPetView(data.pet.id);
    }
  }, [data?.pet?.id]);

  // Existing applications — hides Apply CTA if the user already has
  // one (active or declined) for this listing. Per spec.
  const { data: myApps = [] } = useQuery({
    queryKey: ["my-applications"],
    queryFn: () => listMyAdoptionApplications(token),
    enabled: Boolean(token),
    staleTime: 60_000
  });
  const hasExistingApplication = useMemo(
    () => myApps.some((a) => a.petId === id),
    [myApps, id]
  );

  // Favorites with optimistic UI + silent rollback per spec.
  // Uses the adoption-specific endpoint (shelter_pets), not the social
  // /v1/favorites which targets owner-Pet rows.
  const { data: favorites = [] } = useQuery({
    queryKey: ["adoption-favorites"],
    queryFn: () => listAdoptionFavorites(token),
    enabled: Boolean(token),
    staleTime: 60_000
  });
  const favorited = useMemo(
    () => favorites.some((p) => p.id === id),
    [favorites, id]
  );
  const toggleFav = useMutation({
    mutationFn: async () => {
      if (!id) return;
      if (favorited) await removeAdoptionFavorite(token, id);
      else await addAdoptionFavorite(token, id);
    },
    onMutate: () => {
      const previous = queryClient.getQueryData<typeof favorites>([
        "adoption-favorites"
      ]);
      queryClient.setQueryData<typeof favorites>(
        ["adoption-favorites"],
        (cur) => {
          const list = cur ?? [];
          if (favorited) return list.filter((p) => p.id !== id);
          if (data?.pet) return [...list, data.pet];
          return list;
        }
      );
      return { previous };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.previous)
        queryClient.setQueryData(["adoption-favorites"], ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["adoption-favorites"] });
    }
  });

  const [applyOpen, setApplyOpen] = useState(false);
  const applyMutation = useMutation({
    mutationFn: (input: AdoptionApplicationInput) =>
      createAdoptionApplication(token, input),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setApplyOpen(false);
      queryClient.invalidateQueries({ queryKey: ["my-applications"] });
      Alert.alert(
        "Application sent",
        "The shelter will review your request. You'll get a message when they open the chat."
      );
    },
    onError: (err: Error) => {
      Alert.alert("Could not send", err.message || "Please try again.");
    }
  });

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <LottieLoading />
      </View>
    );
  }

  // 404 state — server returns 404 for any non-published listing so
  // paused / adopted / archived / rejected all land here. Generic
  // copy so we don't leak the underlying state.
  if (isError || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + 20, paddingHorizontal: mobileTheme.spacing.xl }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ marginBottom: 16 }}>
          <ArrowLeft size={22} color={theme.colors.ink} />
        </Pressable>
        <View style={{ alignItems: "center", paddingTop: 40 }}>
          <PawPrint size={36} color={theme.colors.muted} />
          <Text style={{ marginTop: 12, fontSize: 18, fontFamily: "Inter_700Bold", color: theme.colors.ink }}>
            Listing not available
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13, fontFamily: "Inter_400Regular", color: theme.colors.muted, textAlign: "center" }}>
            This listing may have been rehomed, paused, or removed. Explore more adoptable pets to find your match.
          </Text>
          <Pressable
            onPress={() => router.replace("/(app)/adopt" as any)}
            style={{
              marginTop: 20,
              paddingHorizontal: 18,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: theme.colors.primary
            }}
          >
            <Text style={{ color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 13 }}>
              Browse more pets
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const { pet, microchipPresent, shelter, disclosure } = data;
  const requirements = parseRequirements(pet.characterTags ?? []);
  const weightLabel = formatWeight(requirements.weightKg, weightUnit);
  const distanceLabel = formatDistance(pet.distanceKm, distanceUnit);
  const ageLabel = formatAge(pet.ageMonths);

  const reserved = pet.status === "reserved";

  const onShare = async () => {
    try {
      await Share.share({
        title: pet.name,
        message: `Meet ${pet.name} on Petto — available for adoption at ${shelter.name}.`
      });
    } catch {
      /* user cancelled */
    }
  };

  const hasRequirements =
    requirements.homeTypes.length > 0 ||
    !!requirements.otherPets ||
    !!requirements.children ||
    !!requirements.experience ||
    !!requirements.other;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Photo gallery (swipeable) ────────────────── */}
        <PhotoGallery photos={pet.photos ?? []} name={pet.name} />

        {/* ── Back button ─────────────────────────────── */}
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 12,
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.92)"
          }}
        >
          <ArrowLeft size={18} color="#16141A" />
        </Pressable>

        {/* ── Title + quick facts + actions ─────────────── */}
        <View style={{ paddingHorizontal: mobileTheme.spacing.xl, paddingTop: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 28, fontFamily: "Inter_700Bold", color: theme.colors.ink }}>
                {pet.name}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 13, fontFamily: "Inter_500Medium", color: theme.colors.muted }}>
                {[pet.species, pet.breed].filter(Boolean).join(" · ") || "—"}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 8, gap: 10 }}>
                <QuickFact label={humanSex(pet.sex)} theme={theme} />
                {pet.size ? <QuickFact label={pet.size} theme={theme} /> : null}
                {ageLabel ? <QuickFact label={ageLabel} theme={theme} /> : null}
                {distanceLabel ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <MapPin size={11} color={theme.colors.muted} />
                    <Text style={{ fontSize: 11, color: theme.colors.muted, fontFamily: "Inter_500Medium" }}>
                      {distanceLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ gap: 8, alignItems: "flex-end" }}>
              <Pressable
                onPress={() => toggleFav.mutate()}
                hitSlop={8}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.colors.white,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.75 : 1
                })}
                accessibilityLabel={favorited ? "Remove from favorites" : "Add to favorites"}
                accessibilityState={{ selected: favorited }}
              >
                <Heart
                  size={18}
                  color={favorited ? "#DC2626" : theme.colors.ink}
                  fill={favorited ? "#DC2626" : "transparent"}
                />
              </Pressable>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <IconButton Icon={Share2} onPress={onShare} theme={theme} label="Share" />
                <IconButton
                  Icon={Flag}
                  onPress={() =>
                    Alert.alert(
                      "Report listing",
                      "Tell us what's wrong with this listing. Our team reviews reports within 48 hours.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Report",
                          style: "destructive",
                          onPress: () => {
                            // TODO: wire to POST /reports flow once UI exists.
                            Alert.alert("Thanks — we'll review this listing.");
                          }
                        }
                      ]
                    )
                  }
                  theme={theme}
                  label="Report"
                />
              </View>
            </View>
          </View>
        </View>

        {/* ── Jurisdiction disclosure banner ───────────── */}
        {disclosure ? (
          <View
            style={{
              marginHorizontal: mobileTheme.spacing.xl,
              marginTop: 16,
              padding: 14,
              borderRadius: 16,
              backgroundColor: "rgba(2, 132, 199, 0.08)",
              borderWidth: 1,
              borderColor: "rgba(2, 132, 199, 0.25)",
              flexDirection: "row",
              gap: 10
            }}
          >
            <Info size={16} color="#0284C7" style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#0369A1" }}>
                {disclosure.title}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 17, color: "#0369A1", fontFamily: "Inter_400Regular" }}>
                {disclosure.body}
              </Text>
              {disclosure.linkUrl ? (
                <Pressable
                  onPress={() => Linking.openURL(disclosure.linkUrl!)}
                  style={{ marginTop: 6 }}
                >
                  <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#0369A1" }}>
                    Learn more →
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ── Facts ─────────────────────────────────────── */}
        <Section title="At a glance" theme={theme}>
          <View style={{ gap: 2 }}>
            <Row label="Species" value={pet.species || "—"} theme={theme} />
            {pet.breed ? <Row label="Breed" value={pet.breed} theme={theme} /> : null}
            {ageLabel ? <Row label="Age" value={ageLabel} theme={theme} /> : null}
            <Row label="Sex" value={humanSex(pet.sex)} theme={theme} />
            {pet.size ? <Row label="Size" value={pet.size} theme={theme} /> : null}
            {weightLabel ? <Row label="Weight" value={weightLabel} theme={theme} /> : null}
            {pet.color ? <Row label="Colour" value={pet.color} theme={theme} /> : null}
          </View>
        </Section>

        {/* ── Health ────────────────────────────────────── */}
        <Section title="Health" theme={theme}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <HealthPill
              Icon={Syringe}
              label={`Vaccination: ${humanVaccination(requirements.vaccination)}`}
              tone="blue"
            />
            <HealthPill
              Icon={Sparkles}
              label={pet.isNeutered ? "Neutered / spayed" : "Not neutered"}
              tone={pet.isNeutered ? "green" : "slate"}
            />
            {microchipPresent ? (
              <HealthPill Icon={ShieldCheck} label="Microchipped" tone="slate" />
            ) : null}
            {pet.specialNeeds ? (
              <HealthPill Icon={Stethoscope} label="Special needs" tone="amber" />
            ) : null}
            {pet.isUrgent ? (
              <HealthPill Icon={AlertTriangle} label="Urgent" tone="red" />
            ) : null}
          </View>
          {pet.specialNeeds ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Special needs
              </Text>
              <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 19, color: theme.colors.ink, fontFamily: "Inter_400Regular" }}>
                {pet.specialNeeds}
              </Text>
            </View>
          ) : null}
        </Section>

        {/* ── About ─────────────────────────────────────── */}
        {pet.description ? (
          <Section title={`About ${pet.name}`} theme={theme}>
            <Text style={{ fontSize: 14, lineHeight: 21, color: theme.colors.ink, fontFamily: "Inter_400Regular" }}>
              {pet.description}
            </Text>
          </Section>
        ) : null}

        {/* ── Adoption requirements ───────────────────── */}
        {hasRequirements ? (
          <Section title="Adoption requirements" theme={theme}>
            <View style={{ gap: 8 }}>
              {requirements.homeTypes.length > 0 ? (
                <RequirementRow label="Home" theme={theme}>
                  {requirements.homeTypes.map((h) => (
                    <Chip key={h} label={humanHome(h)} theme={theme} />
                  ))}
                </RequirementRow>
              ) : null}
              {requirements.otherPets ? (
                <RequirementRow label="Other pets" theme={theme}>
                  <Chip label={humanOtherPets(requirements.otherPets)} theme={theme} />
                </RequirementRow>
              ) : null}
              {requirements.children ? (
                <RequirementRow label="Children" theme={theme}>
                  <Chip label={humanChildren(requirements.children)} theme={theme} />
                </RequirementRow>
              ) : null}
              {requirements.experience ? (
                <RequirementRow label="Experience" theme={theme}>
                  <Chip label={humanExperience(requirements.experience)} theme={theme} />
                </RequirementRow>
              ) : null}
              {requirements.other ? (
                <View>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Other
                  </Text>
                  <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 19, color: theme.colors.ink, fontFamily: "Inter_400Regular" }}>
                    {requirements.other}
                  </Text>
                </View>
              ) : null}
            </View>
          </Section>
        ) : null}

        {/* ── Shelter mini-card ─────────────────────────── */}
        <Section title="From" theme={theme}>
          <Pressable
            onPress={() => router.push(`/(app)/shelter/${shelter.id}` as any)}
            style={({ pressed }) => ({
              padding: 14,
              borderRadius: 16,
              backgroundColor: theme.colors.white,
              borderWidth: 1,
              borderColor: theme.colors.border,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              opacity: pressed ? 0.9 : 1
            })}
          >
            <Avatar uri={shelter.logoUrl ?? undefined} name={shelter.name} size="md" />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text
                  style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: theme.colors.ink }}
                  numberOfLines={1}
                >
                  {shelter.name}
                </Text>
                {shelter.verifiedAt ? (
                  <BadgeCheck size={13} color={theme.colors.success} />
                ) : null}
              </View>
              {shelter.cityLabel ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
                  <MapPin size={11} color={theme.colors.muted} />
                  <Text
                    style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.colors.muted }}
                    numberOfLines={1}
                  >
                    {shelter.cityLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            <ChevronRight size={16} color={theme.colors.muted} />
          </Pressable>
        </Section>
      </ScrollView>

      {/* ── Sticky apply CTA ──────────────────────────── */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: 10,
          paddingBottom: insets.bottom + 10,
          paddingHorizontal: mobileTheme.spacing.xl,
          backgroundColor: theme.colors.white,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border
        }}
      >
        {hasExistingApplication ? (
          <Pressable
            onPress={() => router.push("/(app)/my-applications" as any)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 14,
              borderRadius: 999,
              backgroundColor: theme.colors.border
            }}
          >
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: theme.colors.ink }}>
              You've already applied — view status
            </Text>
          </Pressable>
        ) : reserved ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 14,
              borderRadius: 999,
              backgroundColor: theme.colors.border
            }}
          >
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: theme.colors.muted }}>
              Already reserved
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => setApplyOpen(true)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 14,
              borderRadius: 999,
              backgroundColor: theme.colors.primary,
              opacity: pressed ? 0.9 : 1
            })}
          >
            <HeartHandshake size={18} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_700Bold" }}>
              Apply to adopt {pet.name}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Application modal */}
      <ApplicationModal
        visible={applyOpen}
        petId={pet.id}
        petName={pet.name}
        pending={applyMutation.isPending}
        onClose={() => setApplyOpen(false)}
        onSubmit={(input) => applyMutation.mutate(input)}
      />
    </View>
  );
}

// ── Photo gallery ────────────────────────────────────────────────

function PhotoGallery({ photos, name }: { photos: string[]; name: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const width = Dimensions.get("window").width;
  const [active, setActive] = useState(0);
  const safe = photos.filter((p) => !!p);

  if (safe.length === 0) {
    return (
      <View
        style={{
          width,
          height: 360,
          backgroundColor: theme.colors.primaryBg,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <PawPrint size={48} color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ position: "relative" }}>
      <FlatList
        data={safe}
        keyExtractor={(url, i) => `${url}-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setActive(idx);
        }}
        renderItem={({ item }) => (
          <Image
            source={{ uri: item }}
            style={{ width, height: 380, backgroundColor: theme.colors.border }}
            contentFit="cover"
            transition={220}
            cachePolicy="memory-disk"
            accessibilityLabel={`${name} photo`}
          />
        )}
      />
      {/* Top gradient for back button legibility */}
      <LinearGradient
        colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)"]}
        style={{ position: "absolute", left: 0, right: 0, top: 0, height: 90 }}
        pointerEvents="none"
      />
      {/* Dot pagination + counter */}
      {safe.length > 1 ? (
        <>
          <View
            style={{
              position: "absolute",
              bottom: 12,
              left: 0,
              right: 0,
              flexDirection: "row",
              justifyContent: "center",
              gap: 5,
              pointerEvents: "none"
            }}
            pointerEvents="none"
          >
            {safe.map((_, i) => (
              <View
                key={i}
                style={{
                  height: 6,
                  width: i === active ? 20 : 6,
                  borderRadius: 3,
                  backgroundColor: i === active ? "#FFFFFF" : "rgba(255,255,255,0.5)"
                }}
              />
            ))}
          </View>
          <View
            style={{
              position: "absolute",
              top: insets.top + 10,
              right: 12,
              paddingHorizontal: 9,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: "rgba(0,0,0,0.55)"
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
              {active + 1} / {safe.length}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

// ── Small building blocks ───────────────────────────────────────

function QuickFact({ label, theme }: { label: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.colors.muted }}>
      {label}
    </Text>
  );
}

function IconButton({
  Icon,
  onPress,
  theme,
  label
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.white,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.75 : 1
      })}
    >
      <Icon size={15} color={theme.colors.ink} />
    </Pressable>
  );
}

function Section({
  title,
  theme,
  children
}: {
  title: string;
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: mobileTheme.spacing.xl, marginTop: mobileTheme.spacing.xl }}>
      <Text
        style={{
          fontSize: 11,
          fontFamily: "Inter_700Bold",
          color: theme.colors.muted,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 10
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  theme
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border
      }}
    >
      <Text style={{ fontSize: 13, color: theme.colors.muted, fontFamily: "Inter_500Medium" }}>
        {label}
      </Text>
      <Text
        style={{
          flex: 1,
          marginLeft: 12,
          fontSize: 13,
          textAlign: "right",
          color: theme.colors.ink,
          fontFamily: "Inter_600SemiBold"
        }}
      >
        {value}
      </Text>
    </View>
  );
}

type Tone = "green" | "blue" | "slate" | "amber" | "red";
function HealthPill({
  Icon,
  label,
  tone
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  tone: Tone;
}) {
  const palette: Record<Tone, { bg: string; fg: string; border: string }> = {
    green: { bg: "rgba(63, 125, 78, 0.1)", fg: "#3F7D4E", border: "rgba(63, 125, 78, 0.3)" },
    blue: { bg: "rgba(2, 132, 199, 0.1)", fg: "#0369A1", border: "rgba(2, 132, 199, 0.3)" },
    slate: { bg: "rgba(71, 85, 105, 0.1)", fg: "#475569", border: "rgba(71, 85, 105, 0.3)" },
    amber: { bg: "rgba(217, 119, 6, 0.1)", fg: "#B45309", border: "rgba(217, 119, 6, 0.3)" },
    red: { bg: "rgba(220, 38, 38, 0.1)", fg: "#B91C1C", border: "rgba(220, 38, 38, 0.3)" }
  };
  const p = palette[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: p.bg,
        borderWidth: 1,
        borderColor: p.border
      }}
    >
      <Icon size={11} color={p.fg} />
      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: p.fg }}>{label}</Text>
    </View>
  );
}

function Chip({ label, theme }: { label: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: theme.colors.white,
        borderWidth: 1,
        borderColor: theme.colors.border
      }}
    >
      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.colors.ink }}>
        {label}
      </Text>
    </View>
  );
}

function RequirementRow({
  label,
  theme,
  children
}: {
  label: string;
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text
        style={{
          fontSize: 11,
          fontFamily: "Inter_700Bold",
          color: theme.colors.muted,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{children}</View>
    </View>
  );
}

// ── Apply form modal ─────────────────────────────────────────────
// Kept as a child component so the core screen stays readable; form
// fields follow the existing mobile modal conventions.

function ApplicationModal({
  visible,
  petId,
  petName,
  pending,
  onClose,
  onSubmit
}: {
  visible: boolean;
  petId: string;
  petName: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: AdoptionApplicationInput) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [housing, setHousing] = useState("apartment");
  const [otherPets, setOtherPets] = useState(false);
  const [otherDetail, setOtherDetail] = useState("");
  const [experience, setExperience] = useState("");
  const [message, setMessage] = useState("");

  function submit() {
    onSubmit({
      petId,
      housingType: housing,
      hasOtherPets: otherPets,
      otherPetsDetail: otherDetail,
      experience,
      message
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: theme.colors.white,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingTop: mobileTheme.spacing.xl,
            paddingBottom: insets.bottom + mobileTheme.spacing.xl,
            gap: mobileTheme.spacing.md,
            maxHeight: "90%"
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.colors.ink }}>
              Apply for {petName}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <X size={18} color={theme.colors.ink} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 14 }}>
            <FormField label="Housing" theme={theme}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {(["apartment", "house", "farm", "other"] as const).map((opt) => {
                  const on = housing === opt;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setHousing(opt)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: on ? theme.colors.primary : theme.colors.border,
                        backgroundColor: on ? theme.colors.primaryBg : "transparent"
                      }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: on ? theme.colors.primary : theme.colors.ink, textTransform: "capitalize" }}>
                        {opt}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </FormField>

            <FormField label="Do you have other pets?" theme={theme}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {[true, false].map((b) => {
                  const on = otherPets === b;
                  return (
                    <Pressable
                      key={String(b)}
                      onPress={() => setOtherPets(b)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: on ? theme.colors.primary : theme.colors.border,
                        backgroundColor: on ? theme.colors.primaryBg : "transparent"
                      }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: on ? theme.colors.primary : theme.colors.ink }}>
                        {b ? "Yes" : "No"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {otherPets ? (
                <TextInput
                  value={otherDetail}
                  onChangeText={setOtherDetail}
                  placeholder="Tell us about them…"
                  placeholderTextColor={theme.colors.muted}
                  style={modalInputStyle(theme)}
                />
              ) : null}
            </FormField>

            <FormField label="Experience with pets" theme={theme}>
              <TextInput
                value={experience}
                onChangeText={setExperience}
                placeholder="e.g. had a retriever for 8 years"
                placeholderTextColor={theme.colors.muted}
                style={modalInputStyle(theme)}
              />
            </FormField>

            <FormField label="Message to the shelter" theme={theme}>
              <TextInput
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={4}
                placeholder="Why would you be a great match?"
                placeholderTextColor={theme.colors.muted}
                style={{ ...modalInputStyle(theme), minHeight: 100, textAlignVertical: "top" }}
              />
            </FormField>

            <Pressable
              onPress={submit}
              disabled={pending}
              style={({ pressed }) => ({
                paddingVertical: 14,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                backgroundColor: theme.colors.primary,
                opacity: pressed ? 0.9 : pending ? 0.6 : 1,
                flexDirection: "row",
                gap: 6
              })}
            >
              {pending ? <ActivityIndicator color="#FFFFFF" /> : <Check size={16} color="#FFFFFF" />}
              <Text style={{ color: "#FFFFFF", fontSize: 14, fontFamily: "Inter_700Bold" }}>
                Send application
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FormField({
  label,
  theme,
  children
}: {
  label: string;
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: theme.colors.ink }}>
        {label}
      </Text>
      <View style={{ gap: 6 }}>{children}</View>
    </View>
  );
}

function modalInputStyle(theme: ReturnType<typeof useTheme>) {
  return {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.ink,
    fontSize: 14,
    fontFamily: "Inter_400Regular" as const,
    backgroundColor: theme.colors.background
  };
}
