// Shelter profile — public-facing shelter info for adopters browsing
// in the fetcht app. The server now returns a bundled payload with
// published-only pets, optional "recently adopted" section, and a
// jurisdiction disclosure. Contact channels (email/phone/address) are
// stripped from the wire — adopters reach shelters via in-app chat
// once an application is approved.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Linking, Pressable, ScrollView, Share, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Localization from "expo-localization";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  BadgeCheck,
  ExternalLink,
  Heart,
  Info,
  MapPin,
  PawPrint,
  Share2,
  Sparkles
} from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { AdoptablePetCard } from "@/components/adoptable-pet-card";
import { LottieLoading } from "@/components/lottie-loading";
import {
  addFavorite,
  getShelter,
  listFavorites,
  removeFavorite
} from "@/lib/api";
import { getCachedLocation } from "@/lib/location";
import { resolveDistanceUnit } from "@/lib/adoption-format";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function ShelterProfilePage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const token = session?.tokens.accessToken ?? "";
  const { id } = useLocalSearchParams<{ id: string }>();
  const shelterId = Array.isArray(id) ? id[0] : id;

  // Distance unit + cached user location for pet cards.
  const distanceUnit = useMemo(
    () => resolveDistanceUnit(Localization.getLocales()[0]?.languageTag),
    []
  );
  const [userLoc, setUserLoc] = useState<
    { latitude: number; longitude: number } | null
  >(null);
  useEffect(() => {
    void getCachedLocation().then((cached) => {
      if (cached) setUserLoc({ latitude: cached.latitude, longitude: cached.longitude });
    });
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["shelter-detail", shelterId, userLoc],
    queryFn: () => getShelter(token, shelterId as string, userLoc ?? undefined),
    enabled: Boolean(token && shelterId),
    staleTime: 60_000
  });

  // Favorites — shared query with the browse screen.
  const { data: favorites = [] } = useQuery({
    queryKey: ["favorites"],
    queryFn: () => listFavorites(token),
    enabled: Boolean(token),
    staleTime: 60_000
  });
  const favSet = useMemo(
    () => new Set(favorites.map((p) => p.id)),
    [favorites]
  );
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
        const stub = data?.pets?.find((p) => p.id === petId);
        return stub ? [...list, stub as any] : list;
      });
      return { previous };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["favorites"], ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    }
  });

  if (isLoading || !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <LottieLoading />
      </View>
    );
  }

  const { shelter, pets, recentlyAdopted, disclosure } = data;
  const isVerified = !!shelter.verifiedAt;

  const onShare = async () => {
    try {
      await Share.share({
        title: shelter.name,
        message: `Check out ${shelter.name} on Petto — animals available for adoption.`
      });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ───────────────────────────────────────── */}
        <View style={{ position: "relative", height: 220 }}>
          {shelter.heroUrl ? (
            <Image
              source={{ uri: shelter.heroUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={220}
              cachePolicy="memory-disk"
            />
          ) : (
            <LinearGradient
              colors={[theme.colors.primary, theme.colors.primaryBg as string]}
              style={{ width: "100%", height: "100%" }}
            />
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0.45)", "transparent"]}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
          />
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
              backgroundColor: "rgba(255,255,255,0.9)"
            }}
          >
            <ArrowLeft size={18} color="#16141A" />
          </Pressable>
          <Pressable
            onPress={onShare}
            hitSlop={10}
            style={{
              position: "absolute",
              top: insets.top + 8,
              right: 12,
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.9)"
            }}
          >
            <Share2 size={17} color="#16141A" />
          </Pressable>
        </View>

        {/* ── Identity card ────────────────────────────── */}
        <View style={{ paddingHorizontal: mobileTheme.spacing.xl, marginTop: -40 }}>
          <View
            style={{
              padding: 16,
              borderRadius: 20,
              backgroundColor: theme.colors.white,
              borderWidth: 1,
              borderColor: theme.colors.border,
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              ...mobileTheme.shadow.sm
            }}
          >
            <Avatar uri={shelter.logoUrl ?? undefined} name={shelter.name} size="lg" />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.colors.ink, flexShrink: 1 }}
                >
                  {shelter.name}
                </Text>
                {isVerified ? (
                  <BadgeCheck size={15} color={theme.colors.success} />
                ) : null}
              </View>
              {shelter.cityLabel ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <MapPin size={11} color={theme.colors.muted} />
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 11, color: theme.colors.muted, fontFamily: "Inter_500Medium" }}
                  >
                    {shelter.cityLabel}
                    {shelter.operatingCountry ? ` · ${shelter.operatingCountry}` : ""}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Donation CTA (opt-in) ─────────────────────── */}
        {shelter.donationUrl ? (
          <View style={{ paddingHorizontal: mobileTheme.spacing.xl, marginTop: mobileTheme.spacing.md }}>
            <Pressable
              onPress={() => Linking.openURL(shelter.donationUrl!)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 12,
                borderRadius: 999,
                backgroundColor: theme.colors.primary,
                opacity: pressed ? 0.88 : 1
              })}
              accessibilityLabel="Support this shelter (opens external site)"
            >
              <Heart size={15} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontSize: 14, fontFamily: "Inter_700Bold" }}>
                Support us
              </Text>
              <ExternalLink size={13} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : null}

        {/* ── Jurisdiction disclosure ──────────────────── */}
        {disclosure ? (
          <View
            style={{
              marginHorizontal: mobileTheme.spacing.xl,
              marginTop: 16,
              padding: 12,
              borderRadius: 14,
              backgroundColor: "rgba(2, 132, 199, 0.08)",
              borderWidth: 1,
              borderColor: "rgba(2, 132, 199, 0.25)",
              flexDirection: "row",
              gap: 10
            }}
          >
            <Info size={14} color="#0284C7" style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#0369A1" }}>
                {disclosure.title}
              </Text>
              <Text style={{ marginTop: 3, fontSize: 11, lineHeight: 16, color: "#0369A1", fontFamily: "Inter_400Regular" }}>
                {disclosure.body}
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── About ─────────────────────────────────────── */}
        {shelter.about ? (
          <Section title="About" theme={theme}>
            <Text
              style={{
                fontSize: 14,
                lineHeight: 21,
                color: theme.colors.ink,
                fontFamily: "Inter_400Regular"
              }}
            >
              {shelter.about}
            </Text>
          </Section>
        ) : null}

        {/* ── Pets looking for a home ───────────────────── */}
        <Section title={`Available for adoption (${pets.length})`} theme={theme}>
          {pets.length === 0 ? (
            <View style={{ paddingVertical: 20, alignItems: "center", gap: 6 }}>
              <PawPrint size={24} color={theme.colors.muted} />
              <Text style={{ fontSize: 12, color: theme.colors.muted, fontFamily: "Inter_500Medium" }}>
                No available pets right now
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing.sm }}>
              {pets.map((pet) => (
                <View key={pet.id} style={{ width: "48%" }}>
                  <AdoptablePetCard
                    pet={pet}
                    favorited={favSet.has(pet.id)}
                    onToggleFavorite={() => toggleFav.mutate(pet.id)}
                    onPress={() => router.push(`/(app)/adopt/${pet.id}` as any)}
                    distanceUnit={distanceUnit}
                  />
                </View>
              ))}
            </View>
          )}
        </Section>

        {/* ── Recently rehomed (opt-in) ─────────────────── */}
        {shelter.showRecentlyAdopted && recentlyAdopted && recentlyAdopted.length > 0 ? (
          <Section title="Recently rehomed" theme={theme}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing.sm }}>
              {recentlyAdopted.map((pet) => (
                <View
                  key={pet.id}
                  style={{
                    width: "31%",
                    aspectRatio: 1,
                    borderRadius: 14,
                    overflow: "hidden",
                    backgroundColor: theme.colors.border,
                    position: "relative"
                  }}
                >
                  {pet.photos?.[0] ? (
                    <Image
                      source={{ uri: pet.photos[0] }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                      transition={200}
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                      <Heart size={18} color={theme.colors.muted} />
                    </View>
                  )}
                  <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.75)"]}
                    style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 40 }}
                  />
                  <View style={{ position: "absolute", left: 6, right: 6, bottom: 4 }}>
                    <Text
                      numberOfLines={1}
                      style={{ color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_700Bold" }}
                    >
                      {pet.name}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {/* ── Adoption process (shelter-authored) ────────── */}
        {shelter.adoptionProcess ? (
          <Section title="How to adopt from us" theme={theme}>
            <Text
              style={{
                fontSize: 14,
                lineHeight: 21,
                color: theme.colors.ink,
                fontFamily: "Inter_400Regular"
              }}
            >
              {shelter.adoptionProcess}
            </Text>
          </Section>
        ) : null}

        {/* ── Contact note ──────────────────────────────── */}
        <Section title="Get in touch" theme={theme}>
          <Text style={{ fontSize: 13, lineHeight: 19, color: theme.colors.muted, fontFamily: "Inter_400Regular" }}>
            To message this shelter, apply to adopt one of their animals. The chat opens
            automatically once your application is approved.
          </Text>
        </Section>

        <View style={{ paddingHorizontal: mobileTheme.spacing.xl, marginTop: 24, alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Sparkles size={11} color={theme.colors.muted} />
            <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: theme.colors.muted }}>
              Verified shelters only. All adoptions are decided by the shelter.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
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
