import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { LottieLoading } from "@/components/lottie-loading";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, MapPin, MessageCircle, Star, UserCheck } from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { listPetSitters } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function PetSittersPage() {
  const theme = useTheme();
  const session = useSessionStore((s) => s.session);
  const insets = useSafeAreaInsets();

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

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

  const {
    data: sitters = [],
    isLoading,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ["pet-sitters", session?.tokens.accessToken, userLocation?.latitude],
    queryFn: () => listPetSitters(session!.tokens.accessToken, userLocation?.latitude, userLocation?.longitude),
    enabled: Boolean(session)
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.md,
          paddingHorizontal: mobileTheme.spacing.xl
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
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
          Pet Sitters
        </Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <LottieLoading size={70} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingBottom: insets.bottom + 40,
            gap: mobileTheme.spacing.md
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={theme.colors.primary}
            />
          }
        >
          {sitters.length === 0 ? (
            <View
              style={{
                alignItems: "center",
                paddingVertical: mobileTheme.spacing["4xl"],
                gap: mobileTheme.spacing.md
              }}
            >
              <UserCheck size={40} color={theme.colors.muted} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.subheading.fontSize,
                  fontFamily: "Inter_600SemiBold",
                  color: theme.colors.ink
                }}
              >
                No pet sitters yet
              </Text>
              <Text
                style={{
                  color: theme.colors.muted,
                  fontFamily: "Inter_400Regular",
                  textAlign: "center",
                  maxWidth: 260
                }}
              >
                Pet sitter profiles will appear here once available in your area.
              </Text>
            </View>
          ) : (
            sitters.map((sitter) => (
              <View
                key={sitter.id}
                style={{
                  padding: mobileTheme.spacing.xl,
                  borderRadius: mobileTheme.radius.lg,
                  backgroundColor: theme.colors.white,
                  gap: mobileTheme.spacing.md,
                  ...mobileTheme.shadow.sm
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: mobileTheme.spacing.md,
                    alignItems: "center"
                  }}
                >
                  <Avatar
                    uri={sitter.avatarUrl}
                    name={sitter.name}
                    size={48}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                        fontFamily: "Inter_700Bold",
                        color: theme.colors.ink
                      }}
                    >
                      {sitter.name}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        marginTop: 2
                      }}
                    >
                      <MapPin size={12} color={theme.colors.muted} />
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.micro.fontSize,
                          fontFamily: "Inter_500Medium",
                          color: theme.colors.muted
                        }}
                      >
                        {sitter.cityLabel}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                        fontFamily: "Inter_700Bold",
                        color: theme.colors.primary
                      }}
                    >
                      ${sitter.hourlyRate}/hr
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 3
                      }}
                    >
                      <Star
                        size={12}
                        color={mobileTheme.colors.starGold}
                        fill={mobileTheme.colors.starGold}
                      />
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.micro.fontSize,
                          fontFamily: "Inter_600SemiBold",
                          color: theme.colors.ink
                        }}
                      >
                        {sitter.rating.toFixed(1)} ({sitter.reviewCount})
                      </Text>
                    </View>
                  </View>
                </View>

                <Text
                  style={{
                    fontSize: mobileTheme.typography.body.fontSize,
                    fontFamily: "Inter_400Regular",
                    color: theme.colors.muted,
                    lineHeight: 22
                  }}
                  numberOfLines={2}
                >
                  {sitter.bio}
                </Text>

                {sitter.services.length > 0 && (
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: mobileTheme.spacing.xs
                    }}
                  >
                    {sitter.services.map((service) => (
                      <View
                        key={service}
                        style={{
                          paddingHorizontal: mobileTheme.spacing.sm,
                          paddingVertical: 3,
                          borderRadius: mobileTheme.radius.pill,
                          backgroundColor: theme.colors.primaryBg
                        }}
                      >
                        <Text
                          style={{
                            fontSize: mobileTheme.typography.micro.fontSize,
                            fontFamily: "Inter_500Medium",
                            color: theme.colors.primary
                          }}
                        >
                          {service}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <Pressable
                  onPress={() =>
                    Linking.openURL(
                      `sms:?body=Hi ${sitter.name}, I found you on Fetcht and would like to inquire about your pet sitting services.`
                    )
                  }
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: mobileTheme.spacing.sm,
                    paddingVertical: mobileTheme.spacing.md,
                    borderRadius: mobileTheme.radius.pill,
                    backgroundColor: theme.colors.primary,
                    opacity: pressed ? 0.85 : 1
                  })}
                >
                  <MessageCircle size={16} color="#FFFFFF" />
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontFamily: "Inter_700Bold",
                      fontSize: mobileTheme.typography.caption.fontSize
                    }}
                  >
                    Contact
                  </Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
