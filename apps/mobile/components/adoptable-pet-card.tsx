// AdoptablePetCard — reusable adopter-facing card for the fetcht app.
// Renders one `ShelterPet` with photo, core attributes, shelter
// attribution and status badges. Tapping the body invokes onPress;
// the favorite heart is a carve-out that doesn't trigger navigation.
//
// Presentation is deliberately decoupled from favorite persistence —
// the caller owns `favorited` state and the `onToggleFavorite`
// handler so the component works in both authed (server-synced) and
// anonymous (local-only) contexts.

import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  AlertTriangle,
  BadgeCheck,
  Heart,
  MapPin,
  ShieldCheck,
  Sparkles,
  Stethoscope
} from "lucide-react-native";

import type { ShelterPet } from "@petto/contracts";
import { mobileTheme, useTheme } from "@/lib/theme";
import { AppImage } from "@/components/app-image";
import {
  deriveAdoptableBadges,
  formatAge,
  formatDistance,
  humanSex,
  type DistanceUnit
} from "@/lib/adoption-format";

type Props = {
  pet: ShelterPet;
  /** Controlled favorite state. Pass `null` to hide the heart entirely. */
  favorited?: boolean | null;
  /** Called when the heart is tapped. Caller does optimistic update + sync. */
  onToggleFavorite?: () => void;
  /** Called when the card body is tapped (usually navigate to detail). */
  onPress?: () => void;
  /** User's preferred unit — resolve via `resolveDistanceUnit(locale)`. */
  distanceUnit?: DistanceUnit;
};

const BADGE_STYLES = {
  new: {
    icon: Sparkles,
    label: "New",
    bg: "#E6694A",
    fg: "#FFFFFF"
  },
  urgent: {
    icon: AlertTriangle,
    label: "Urgent",
    bg: "#DC2626",
    fg: "#FFFFFF"
  },
  special_needs: {
    icon: Stethoscope,
    label: "Special needs",
    bg: "#0284C7",
    fg: "#FFFFFF"
  },
  microchipped: {
    icon: ShieldCheck,
    label: "Microchipped",
    bg: "rgba(22,21,20,0.85)",
    fg: "#FFFFFF"
  }
} as const;

export function AdoptablePetCard({
  pet,
  favorited,
  onToggleFavorite,
  onPress,
  distanceUnit = "km"
}: Props) {
  const theme = useTheme();
  const photo = pet.photos?.[0];
  const age = formatAge(pet.ageMonths);
  const distance = formatDistance(pet.distanceKm, distanceUnit);
  const badges = deriveAdoptableBadges({
    publishedAt: pet.publishedAt,
    createdAt: pet.createdAt,
    isUrgent: pet.isUrgent,
    specialNeeds: pet.specialNeeds,
    microchipId: pet.microchipId
  });

  const Inner = (
    <View
      style={{
        borderRadius: mobileTheme.radius.md,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        overflow: "hidden",
        ...mobileTheme.shadow.sm
      }}
    >
      {/* ── Photo frame ────────────────────────────────── */}
      <View style={{ aspectRatio: 4 / 5, backgroundColor: theme.colors.primaryBg }}>
        <AppImage
          uri={photo}
          kind="pet"
          recyclingKey={pet.id}
          containerStyle={{ width: "100%", height: "100%" }}
        />

        {/* Subtle bottom gradient so name + distance pill stay legible */}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.6)"]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: "42%" }}
        />

        {/* Status badge stack — top-left, wraps */}
        {badges.length > 0 && (
          <View
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              right: 48, // leave room for heart
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 4
            }}
          >
            {badges.map((b) => {
              const spec = BADGE_STYLES[b];
              const Icon = spec.icon;
              return (
                <View
                  key={b}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 3,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                    borderRadius: mobileTheme.radius.pill,
                    backgroundColor: spec.bg
                  }}
                >
                  <Icon size={9} color={spec.fg} />
                  <Text
                    style={{
                      fontSize: 9.5,
                      fontFamily: "Inter_700Bold",
                      color: spec.fg,
                      letterSpacing: 0.2
                    }}
                  >
                    {spec.label}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Distance pill — sits above the quick-facts line so it never
            overlaps the "breed · sex · age" row below. */}
        {distance && (
          <View
            style={{
              position: "absolute",
              right: 8,
              bottom: 52,
              flexDirection: "row",
              alignItems: "center",
              gap: 3,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: "rgba(0,0,0,0.55)"
            }}
          >
            <MapPin size={10} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontSize: 10, fontFamily: "Inter_600SemiBold" }}>
              {distance}
            </Text>
          </View>
        )}

        {/* Name + quick facts over gradient */}
        <View style={{ position: "absolute", left: 10, right: 10, bottom: 8 }}>
          <Text
            numberOfLines={1}
            style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_700Bold" }}
          >
            {pet.name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: "rgba(255,255,255,0.88)",
              fontSize: 11,
              marginTop: 1,
              fontFamily: "Inter_500Medium"
            }}
          >
            {[pet.breed, humanSex(pet.sex), age].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>

      {/* ── Shelter attribution ───────────────────────── */}
      {pet.shelterName ? (
        <View
          style={{
            paddingHorizontal: mobileTheme.spacing.md,
            paddingVertical: mobileTheme.spacing.sm,
            flexDirection: "row",
            alignItems: "center",
            gap: 4
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: theme.colors.muted,
              fontSize: 11,
              fontFamily: "Inter_500Medium"
            }}
          >
            {pet.shelterName}
            {pet.shelterCity ? ` · ${pet.shelterCity}` : ""}
          </Text>
          {pet.shelterVerified && (
            <BadgeCheck size={12} color={theme.colors.success} />
          )}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, position: "relative" }}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
        >
          {Inner}
        </Pressable>
      ) : (
        Inner
      )}

      {/* Favorite heart — carve-out that doesn't propagate. */}
      {onToggleFavorite && favorited !== null && (
        <Pressable
          onPress={onToggleFavorite}
          hitSlop={8}
          style={({ pressed }) => ({
            position: "absolute",
            top: 8,
            right: 8,
            width: 32,
            height: 32,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.92)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.7)",
            opacity: pressed ? 0.75 : 1,
            ...mobileTheme.shadow.sm
          })}
        >
          <Heart
            size={16}
            color={favorited ? "#DC2626" : "rgba(22,21,20,0.65)"}
            fill={favorited ? "#DC2626" : "transparent"}
          />
        </Pressable>
      )}
    </View>
  );
}
