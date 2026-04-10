import { useMutation } from "@tanstack/react-query";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { LottieLoading } from "@/components/lottie-loading";
import { MapPin } from "lucide-react-native";

import { PrimaryButton } from "@/components/primary-button";
import { ScreenShell } from "@/components/screen-shell";
import { updateProfile } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function LocationOnboardingPage() {
  const theme = useTheme();
  const session = useSessionStore((state) => state.session);
  const setSession = useSessionStore((state) => state.setSession);
  const [statusText, setStatusText] = useState(
    "We use your current location to keep matches nearby and relevant."
  );
  const [resolvedLabel, setResolvedLabel] = useState(
    session?.user.cityLabel ?? ""
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!session) {
        throw new Error("No session found.");
      }

      setErrorMessage(null);
      setStatusText("Requesting location permission...");

      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        throw new Error(
          "Location permission is required to discover pets near you."
        );
      }

      setStatusText("Reading your current location...");
      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      const geocode = await Location.reverseGeocodeAsync(
        currentPosition.coords
      );
      const firstResult = geocode[0];
      const locationLabel = buildLocationLabel(firstResult);
      const cityId = slugifyLocation(locationLabel);

      setResolvedLabel(locationLabel);
      setStatusText("Saving your location for local matching...");

      return updateProfile(session.tokens.accessToken, {
        ...session.user,
        cityId,
        cityLabel: locationLabel
      });
    },
    onSuccess: (user) => {
      if (!session) {
        return;
      }

      setSession({
        ...session,
        user
      });
      router.replace("/(app)/onboarding/profile");
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to access your location."
      );
      setStatusText(
        "We still need your location permission before showing nearby matches."
      );
    }
  });

  return (
    <ScreenShell
      eyebrow="Location access"
      title="Matches work best when we know where you are."
      subtitle="Allow current location so Pett. can surface pets around you instead of showing a generic city list."
    >
      <View
        style={{
          gap: mobileTheme.spacing.lg,
          padding: mobileTheme.spacing.xl,
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: theme.colors.white,
          ...mobileTheme.shadow.sm
        }}
      >
        <Text
          selectable
          style={{
            ...mobileTheme.typography.micro,
            color: theme.colors.muted,
            fontFamily: "Inter_600SemiBold"
          }}
        >
          Step 1 of 3
        </Text>

        <View
          style={{
            gap: mobileTheme.spacing.md,
            borderRadius: mobileTheme.radius.lg,
            padding: mobileTheme.spacing.xl,
            backgroundColor: theme.colors.background
          }}
        >
          <MapPin size={20} color={theme.colors.primary} />
          <Text
            selectable
            style={{
              ...mobileTheme.typography.label,
              color: theme.colors.secondary,
              fontFamily: "Inter_700Bold"
            }}
          >
            Current location
          </Text>
          <Text
            selectable
            style={{
              ...mobileTheme.typography.subheading,
              color: theme.colors.ink,
              fontFamily: "Inter_600SemiBold"
            }}
          >
            {resolvedLabel || "Not shared yet"}
          </Text>
          <Text
            selectable
            style={{
              ...mobileTheme.typography.body,
              color: theme.colors.muted,
              fontFamily: "Inter_400Regular"
            }}
          >
            {statusText}
          </Text>
        </View>

        {mutation.isPending ? (
          <LottieLoading size={70} />
        ) : null}

        {errorMessage ? (
          <Text
            selectable
            style={{
              ...mobileTheme.typography.body,
              color: theme.colors.danger,
              fontFamily: "Inter_400Regular"
            }}
          >
            {errorMessage}
          </Text>
        ) : null}

        <PrimaryButton
          label={
            mutation.isPending ? "Getting location..." : "Allow location access"
          }
          onPress={() => mutation.mutate()}
          disabled={mutation.isPending}
        />
      </View>
    </ScreenShell>
  );
}

function buildLocationLabel(
  result?: {
    district?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
  } | null
) {
  if (!result) {
    return "Current location";
  }

  const parts = [
    result.district,
    result.city,
    result.region,
    result.country
  ].filter(Boolean);
  return parts.join(", ") || "Current location";
}

function slugifyLocation(value: string) {
  return (
    "city-" +
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}
