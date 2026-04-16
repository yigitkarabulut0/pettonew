import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Check, Heart, ImageIcon } from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { PrimaryButton } from "@/components/primary-button";
import { mobileTheme, useTheme } from "@/lib/theme";
import type { MatchPreview, Pet } from "@petto/contracts";

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

interface MatchesListProps {
  matches: MatchPreview[];
  myPets: Pet[];
  insets: { top: number; bottom: number; left: number; right: number };
  onStartDiscovering: () => void;
  onMatchPress: (match: MatchPreview) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function MatchesList({
  matches,
  myPets,
  insets,
  onStartDiscovering,
  onMatchPress,
  onRefresh,
  isRefreshing
}: MatchesListProps) {
  const theme = useTheme();
  const { t } = useTranslation();
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
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={isRefreshing ?? false}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        ) : undefined
      }
      contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
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
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold",
                letterSpacing: 0.5,
                textTransform: "uppercase"
              }}
            >
              {t("match.newMatches")}
            </Text>
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
              const petPhoto = pet.photos[0]?.url;
              const ownerAvatar = match.matchedOwnerAvatarUrl;
              return (
                <Pressable
                  key={match.id}
                  onPress={() => onMatchPress(match)}
                  style={{ alignItems: "center", width: 84 }}
                >
                  <View style={{ position: "relative" }}>
                    {/* Big circle = owner avatar */}
                    <View
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 36,
                        borderWidth: 3,
                        borderColor: theme.colors.primary,
                        overflow: "hidden",
                        backgroundColor: theme.colors.background,
                        ...mobileTheme.shadow.sm
                      }}
                    >
                      {ownerAvatar ? (
                        <Image
                          source={{ uri: ownerAvatar }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="cover"
                          transition={200}
                        />
                      ) : (
                        <View
                          style={{
                            flex: 1,
                            justifyContent: "center",
                            alignItems: "center"
                          }}
                        >
                          <ImageIcon
                            size={24}
                            color={theme.colors.muted}
                          />
                        </View>
                      )}
                    </View>
                    {/* Small circle = pet photo */}
                    {petPhoto && (
                      <View
                        style={{
                          position: "absolute",
                          bottom: -3,
                          right: -3,
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          borderWidth: 2,
                          borderColor: theme.colors.white,
                          overflow: "hidden",
                          backgroundColor: theme.colors.background
                        }}
                      >
                        <Image
                          source={{ uri: petPhoto }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="cover"
                          transition={200}
                        />
                      </View>
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: mobileTheme.typography.micro.fontSize,
                      fontFamily: "Inter_600SemiBold",
                      color: theme.colors.ink,
                      marginTop: 6,
                      maxWidth: 84,
                      textAlign: "center"
                    }}
                  >
                    {match.matchedOwnerName || pet.name}
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
                ? theme.colors.primaryBg
                : theme.colors.surface,
              borderWidth: 1,
              borderColor: !petFilter
                ? theme.colors.primary
                : theme.colors.border
            }}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.caption.fontSize,
                fontWeight: "600",
                fontFamily: "Inter_600SemiBold",
                color: !petFilter
                  ? theme.colors.primary
                  : theme.colors.ink
              }}
            >
              {t("common.all")}
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
                    ? theme.colors.primaryBg
                    : theme.colors.surface,
                borderWidth: 1,
                borderColor:
                  petFilter === pet.id
                    ? theme.colors.primary
                    : theme.colors.border
              }}
            >
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  fontWeight: "600",
                  fontFamily: "Inter_600SemiBold",
                  color:
                    petFilter === pet.id
                      ? theme.colors.primary
                      : theme.colors.ink
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
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold",
            letterSpacing: 0.5,
            textTransform: "uppercase"
          }}
        >
          {t("chat.messages")}
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
              backgroundColor: theme.colors.surface,
              alignItems: "center",
              gap: mobileTheme.spacing.md,
              ...mobileTheme.shadow.sm
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: theme.colors.primaryBg,
                justifyContent: "center",
                alignItems: "center"
              }}
            >
              <Heart size={28} color={theme.colors.primary} />
            </View>
            <Text
              style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                fontWeight: mobileTheme.typography.subheading.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {t("match.noMatches")}
            </Text>
            <Text
              style={{
                color: theme.colors.muted,
                lineHeight: mobileTheme.typography.body.lineHeight,
                textAlign: "center",
                fontSize: mobileTheme.typography.body.fontSize,
                fontFamily: "Inter_400Regular",
                maxWidth: 260
              }}
            >
              {t("match.noMatchesDescription")}
            </Text>
            <PrimaryButton
              label={t("match.startDiscovering")}
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
  match: MatchPreview;
  onPress: (match: MatchPreview) => void;
}

function MatchRow({ match, onPress }: MatchRowProps) {
  const theme = useTheme();
  const theirPet = match.matchedPet;
  const petPhoto = theirPet.photos[0]?.url;
  const ownerAvatar = match.matchedOwnerAvatarUrl;

  return (
    <Pressable
      onPress={() => onPress(match)}
      style={({ pressed }) => ({
        flexDirection: "row",
        backgroundColor: theme.colors.surface,
        borderRadius: mobileTheme.radius.lg,
        ...mobileTheme.shadow.sm,
        overflow: "hidden",
        opacity: pressed ? 0.85 : 1
      })}
    >
      {/* Big circle = owner avatar, small circle = pet photo */}
      <View
        style={{
          width: 72,
          justifyContent: "center",
          alignItems: "center",
          marginLeft: mobileTheme.spacing.md,
          position: "relative"
        }}
      >
        {ownerAvatar ? (
          <Image
            source={{ uri: ownerAvatar }}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              ...mobileTheme.shadow.sm
            }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: theme.colors.background,
              justifyContent: "center",
              alignItems: "center",
              ...mobileTheme.shadow.sm
            }}
          >
            <ImageIcon size={22} color={theme.colors.muted} />
          </View>
        )}
        {petPhoto && (
          <View
            style={{
              position: "absolute",
              bottom: 0,
              right: 2,
              width: 24,
              height: 24,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: theme.colors.surface,
              overflow: "hidden",
              backgroundColor: theme.colors.background
            }}
          >
            <Image
              source={{ uri: petPhoto }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={200}
            />
          </View>
        )}
      </View>

      <View
        style={{
          flex: 1,
          paddingVertical: mobileTheme.spacing.md,
          paddingLeft: mobileTheme.spacing.sm,
          paddingRight: mobileTheme.spacing.xl
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
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            {match.matchedOwnerName}
          </Text>
          <Text
            style={{
              fontSize: mobileTheme.typography.micro.fontSize,
              fontFamily: "Inter_500Medium",
              color: theme.colors.muted
            }}
          >
            {formatRelativeTime(match.createdAt)}
          </Text>
        </View>

        <Text
          style={{
            fontSize: mobileTheme.typography.caption.fontSize,
            fontFamily: "Inter_500Medium",
            color: theme.colors.muted,
            marginTop: 1
          }}
        >
          {match.pet.name} x {theirPet.name}
        </Text>

        {match.lastMessagePreview &&
          match.lastMessagePreview !== "It's a match. Say hello!" && (
            <Text
              numberOfLines={1}
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                fontFamily: "Inter_400Regular",
                color: theme.colors.muted,
                marginTop: 3
              }}
            >
              {match.lastMessagePreview}
            </Text>
          )}
      </View>

      {match.unreadCount > 0 && (
        <View
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: theme.colors.primary,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 4
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: "700",
              color: theme.colors.white,
              fontFamily: "Inter_700Bold"
            }}
          >
            {match.unreadCount > 99 ? "99+" : String(match.unreadCount)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
