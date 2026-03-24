import { useMutation } from "@tanstack/react-query";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { ScreenShell } from "@/components/screen-shell";
import { updateProfile } from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function LocationOnboardingPage() {
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
      subtitle="Allow current location so Petto can surface pets around you instead of showing a generic city list."
    >
      <View
        style={{
          gap: 16,
          padding: 20,
          borderRadius: 28,
          backgroundColor: mobileTheme.colors.surface,
          borderWidth: 1,
          borderColor: mobileTheme.colors.border
        }}
      >
        <View
          style={{
            gap: 10,
            borderRadius: 22,
            padding: 18,
            backgroundColor: "#FFFDFC"
          }}
        >
          <Text
            selectable
            style={{
              color: mobileTheme.colors.secondary,
              fontWeight: "700",
              fontSize: 13,
              letterSpacing: 0.4
            }}
          >
            Current location
          </Text>
          <Text
            selectable
            style={{
              color: mobileTheme.colors.ink,
              fontSize: 24,
              lineHeight: 30,
              fontWeight: "700"
            }}
          >
            {resolvedLabel || "Not shared yet"}
          </Text>
          <Text
            selectable
            style={{ color: mobileTheme.colors.muted, lineHeight: 22 }}
          >
            {statusText}
          </Text>
        </View>

        {mutation.isPending ? (
          <ActivityIndicator color={mobileTheme.colors.primary} />
        ) : null}

        {errorMessage ? (
          <Text
            selectable
            style={{ color: mobileTheme.colors.danger, lineHeight: 22 }}
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
