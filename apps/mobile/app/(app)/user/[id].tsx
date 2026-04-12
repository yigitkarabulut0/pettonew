import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, MapPin, MessageCircle } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { Avatar } from "@/components/avatar";
import { PrimaryButton } from "@/components/primary-button";
import { LottieLoading } from "@/components/lottie-loading";
import { createOrFindDMConversation, getUserProfile } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function UserProfilePage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const insets = useSafeAreaInsets();
  const token = session?.tokens.accessToken ?? "";
  const isOwnProfile = session?.user.id === id;

  const { data, isLoading } = useQuery({
    queryKey: ["user-profile", id],
    queryFn: () => getUserProfile(token, id),
    enabled: Boolean(token && id)
  });

  const dmMutation = useMutation({
    mutationFn: () => createOrFindDMConversation(token, id),
    onSuccess: (conversation) => {
      router.push(`/(app)/conversation/${conversation.id}` as any);
    }
  });

  const user = data?.user;
  const pets = data?.pets ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.lg,
          paddingHorizontal: mobileTheme.spacing.xl,
          backgroundColor: theme.colors.white,
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.colors.background,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <ArrowLeft size={18} color={theme.colors.ink} />
        </Pressable>
        <Text
          style={{
            fontSize: mobileTheme.typography.subheading.fontSize,
            fontWeight: "700",
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          {user ? `${user.firstName} ${user.lastName}` : t("common.loading")}
        </Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <LottieLoading size={70} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {/* User card */}
          <View
            style={{
              backgroundColor: theme.colors.white,
              margin: mobileTheme.spacing.xl,
              borderRadius: mobileTheme.radius.lg,
              padding: mobileTheme.spacing.xl,
              alignItems: "center",
              gap: mobileTheme.spacing.md,
              ...mobileTheme.shadow.sm
            }}
          >
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                borderWidth: 3,
                borderColor: theme.colors.primary,
                padding: 3,
                backgroundColor: theme.colors.white
              }}
            >
              <Avatar uri={user?.avatarUrl} name={user?.firstName ?? "?"} size="lg" />
            </View>
            <Text
              style={{
                fontSize: mobileTheme.typography.heading.fontSize,
                fontWeight: "700",
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold"
              }}
            >
              {user?.firstName} {user?.lastName}
            </Text>
            {user?.cityLabel ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MapPin size={14} color={theme.colors.muted} />
                <Text
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    color: theme.colors.muted,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  {user.cityLabel}
                </Text>
              </View>
            ) : null}
            {user?.bio ? (
              <Text
                style={{
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_400Regular",
                  textAlign: "center",
                  lineHeight: mobileTheme.typography.body.lineHeight
                }}
              >
                {user.bio}
              </Text>
            ) : null}
            {!isOwnProfile && (
              <PrimaryButton
                label={dmMutation.isPending ? t("common.loading") : t("userProfile.sendMessage")}
                onPress={() => dmMutation.mutate()}
                loading={dmMutation.isPending}
                icon={<MessageCircle size={16} color={theme.colors.white} />}
              />
            )}
          </View>

          {/* Pets section */}
          <Text
            style={{
              fontSize: mobileTheme.typography.label.fontSize,
              fontWeight: "700",
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              paddingHorizontal: mobileTheme.spacing.xl,
              marginBottom: mobileTheme.spacing.md
            }}
          >
            {t("userProfile.theirPets")}
          </Text>

          {pets.length === 0 ? (
            <View
              style={{
                marginHorizontal: mobileTheme.spacing.xl,
                padding: mobileTheme.spacing.xl,
                backgroundColor: theme.colors.white,
                borderRadius: mobileTheme.radius.lg,
                alignItems: "center",
                gap: mobileTheme.spacing.sm,
                ...mobileTheme.shadow.sm
              }}
            >
              <Text style={{ fontSize: 32 }}>🐾</Text>
              <Text
                style={{
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_400Regular"
                }}
              >
                {t("userProfile.noPets")}
              </Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: mobileTheme.spacing.xl, gap: mobileTheme.spacing.sm }}>
              {pets.map((pet) => {
                const photo = pet.photos?.[0]?.url;
                return (
                  <View
                    key={pet.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: mobileTheme.spacing.md,
                      backgroundColor: theme.colors.white,
                      borderRadius: mobileTheme.radius.lg,
                      padding: mobileTheme.spacing.lg,
                      ...mobileTheme.shadow.sm
                    }}
                  >
                    <View
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        overflow: "hidden",
                        backgroundColor: theme.colors.background
                      }}
                    >
                      {photo ? (
                        <Image
                          source={{ uri: photo }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                          <Text style={{ fontSize: 22 }}>🐾</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                          fontWeight: "600",
                          color: theme.colors.ink,
                          fontFamily: "Inter_600SemiBold"
                        }}
                      >
                        {pet.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.caption.fontSize,
                          color: theme.colors.muted,
                          fontFamily: "Inter_400Regular",
                          marginTop: 2
                        }}
                      >
                        {pet.speciesLabel} · {pet.breedLabel}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
