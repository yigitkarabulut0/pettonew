import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { LottieLoading } from "@/components/lottie-loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { AlertTriangle, ArrowLeft, Globe, MapPin, Navigation, Phone, Stethoscope } from "lucide-react-native";

import { listVetClinics } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function VetContactsPage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const token = session?.tokens.accessToken ?? "";

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError(true);
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({});
        setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        setLocationError(true);
      }
    })();
  }, []);

  const clinicsQuery = useQuery({
    queryKey: ["vet-clinics", location?.lat, location?.lng],
    queryFn: () => listVetClinics(token, location!.lat, location!.lng),
    enabled: Boolean(token && location)
  });

  const onRefresh = useCallback(() => {
    clinicsQuery.refetch();
  }, [clinicsQuery]);

  const clinics = clinicsQuery.data ?? [];

  const openDirections = (address: string, lat?: number, lng?: number) => {
    if (Platform.OS === "ios") {
      const url = lat && lng
        ? `maps://app?daddr=${lat},${lng}`
        : `maps://app?daddr=${encodeURIComponent(address)}`;
      Linking.openURL(url);
    } else {
      const url = lat && lng
        ? `google.navigation:q=${lat},${lng}`
        : `google.navigation:q=${encodeURIComponent(address)}`;
      Linking.openURL(url);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.lg,
          paddingHorizontal: mobileTheme.spacing.xl,
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1
          })}
        >
          <ArrowLeft size={20} color={theme.colors.ink} />
        </Pressable>
        <Text
          style={{
            flex: 1,
            fontSize: mobileTheme.typography.heading.fontSize,
            fontWeight: mobileTheme.typography.heading.fontWeight,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          Nearby Vets
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingBottom: insets.bottom + 24,
          gap: mobileTheme.spacing.md
        }}
        refreshControl={
          <RefreshControl
            refreshing={clinicsQuery.isRefetching}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Loading */}
        {(clinicsQuery.isLoading || (!location && !locationError)) && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <LottieLoading size={70} />
            <Text style={{ marginTop: mobileTheme.spacing.md, color: theme.colors.muted, fontFamily: "Inter_500Medium" }}>
              {!location ? "Getting your location..." : "Loading clinics..."}
            </Text>
          </View>
        )}

        {/* Location Error */}
        {locationError && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center", gap: mobileTheme.spacing.lg }}>
            <MapPin size={48} color={theme.colors.muted} />
            <Text style={{ fontSize: mobileTheme.typography.subheading.fontSize, fontWeight: mobileTheme.typography.subheading.fontWeight, color: theme.colors.ink, fontFamily: "Inter_700Bold" }}>
              Location access needed
            </Text>
            <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.muted, textAlign: "center", paddingHorizontal: mobileTheme.spacing["3xl"], fontFamily: "Inter_400Regular" }}>
              Enable location permissions to find nearby vet clinics.
            </Text>
          </View>
        )}

        {/* Empty */}
        {!clinicsQuery.isLoading && location && clinics.length === 0 && !locationError && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center", gap: mobileTheme.spacing.lg }}>
            <Stethoscope size={48} color={theme.colors.muted} />
            <Text style={{ fontSize: mobileTheme.typography.subheading.fontSize, fontWeight: mobileTheme.typography.subheading.fontWeight, color: theme.colors.ink, fontFamily: "Inter_700Bold" }}>
              No clinics nearby
            </Text>
            <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.muted, textAlign: "center", paddingHorizontal: mobileTheme.spacing["3xl"], fontFamily: "Inter_400Regular" }}>
              No veterinary clinics found in your area. Try again later.
            </Text>
          </View>
        )}

        {/* Clinics */}
        {clinics.map((clinic) => (
          <View
            key={clinic.id}
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              padding: mobileTheme.spacing.xl,
              gap: mobileTheme.spacing.sm,
              ...mobileTheme.shadow.sm
            }}
          >
            {/* Name + Emergency badge */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                  fontFamily: "Inter_700Bold",
                  color: theme.colors.ink,
                  flex: 1
                }}
                numberOfLines={1}
              >
                {clinic.name}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: mobileTheme.spacing.sm }}>
                {clinic.isEmergency && (
                  <View
                    style={{
                      backgroundColor: theme.colors.dangerBg,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: mobileTheme.radius.pill,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4
                    }}
                  >
                    <AlertTriangle size={12} color={theme.colors.danger} />
                    <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontFamily: "Inter_600SemiBold", color: theme.colors.danger }}>
                      Emergency
                    </Text>
                  </View>
                )}
                {clinic.distance != null && (
                  <View
                    style={{
                      backgroundColor: theme.colors.primaryBg,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: mobileTheme.radius.pill
                    }}
                  >
                    <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontFamily: "Inter_600SemiBold", color: theme.colors.primary }}>
                      {clinic.distance < 1
                        ? `${Math.round(clinic.distance * 1000)} m`
                        : `${clinic.distance.toFixed(1)} km`}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Address */}
            <Text style={{ fontSize: mobileTheme.typography.body.fontSize, fontFamily: "Inter_400Regular", color: theme.colors.muted }}>
              {clinic.address}
            </Text>

            {/* Hours */}
            {clinic.hours ? (
              <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontFamily: "Inter_500Medium", color: theme.colors.muted }}>
                {clinic.hours}
              </Text>
            ) : null}

            {/* Action buttons */}
            <View style={{ flexDirection: "row", gap: mobileTheme.spacing.sm, marginTop: mobileTheme.spacing.sm }}>
              {/* Call */}
              <Pressable
                onPress={() => Linking.openURL(`tel:${clinic.phone}`)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: theme.colors.successBg,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: mobileTheme.radius.md,
                  opacity: pressed ? 0.85 : 1
                })}
              >
                <Phone size={14} color={theme.colors.success} />
                <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontFamily: "Inter_600SemiBold", color: theme.colors.success }}>
                  Call
                </Text>
              </Pressable>

              {/* Directions */}
              <Pressable
                onPress={() => openDirections(clinic.address, clinic.latitude, clinic.longitude)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: theme.colors.primaryBg,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: mobileTheme.radius.md,
                  opacity: pressed ? 0.85 : 1
                })}
              >
                <Navigation size={14} color={theme.colors.primary} />
                <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontFamily: "Inter_600SemiBold", color: theme.colors.primary }}>
                  Directions
                </Text>
              </Pressable>

              {/* Website */}
              {clinic.website ? (
                <Pressable
                  onPress={() => Linking.openURL(clinic.website!)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: theme.colors.surface,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: mobileTheme.radius.md,
                    opacity: pressed ? 0.85 : 1
                  })}
                >
                  <Globe size={14} color={theme.colors.muted} />
                  <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontFamily: "Inter_600SemiBold", color: theme.colors.muted }}>
                    Website
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
