import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Check, Heart } from "lucide-react-native";

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

  // "New Matches" = no messages in the conversation yet (lastMessageAt empty).
  // "Messages" = at least one message exists (any type: text, image, pet_share).
  // The previous check also filtered on lastMessagePreview content which broke
  // for image/pet_share messages (empty body → preview stayed as the default
  // "It's a match" string → match stuck in New forever). Fixed: only check
  // lastMessageAt which the backend sets from the actual messages table.
  const newMatches = useMemo(
    () => matches.filter((m) => m.status === "active" && !m.lastMessageAt),
    [matches]
  );

  const matchesWithMessages = useMemo(
    () => matches.filter((m) => Boolean(m.lastMessageAt)),
    [matches]
  );

  const filteredMatches = useMemo(() => {
    const base = matchesWithMessages;
    if (!petFilter) return base;
    return base.filter(
      (m) => m.pet.id === petFilter || m.matchedPet.id === petFilter
    );
  }, [matchesWithMessages, petFilter]);

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
                        backgroundColor: ownerAvatar ? theme.colors.background : theme.colors.primaryBg,
                        alignItems: "center",
                        justifyContent: "center",
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
                        <Text
                          style={{
                            fontSize: 26,
                            fontFamily: "Inter_700Bold",
                            color: theme.colors.primary
                          }}
                        >
                          {(match.matchedOwnerName || pet.name || "?").charAt(0).toUpperCase()}
                        </Text>
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
  const hasUnread = match.unreadCount > 0;

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
              backgroundColor: theme.colors.primaryBg,
              justifyContent: "center",
              alignItems: "center",
              ...mobileTheme.shadow.sm
            }}
          >
            <Text
              style={{
                fontSize: 22,
                fontFamily: "Inter_700Bold",
                color: theme.colors.primary
              }}
            >
              {(match.matchedOwnerName || "?").charAt(0).toUpperCase()}
            </Text>
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
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: mobileTheme.typography.bodySemiBold.fontSize,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            {match.matchedOwnerName}
          </Text>
          <Text
            style={{
              fontSize: mobileTheme.typography.micro.fontSize,
              fontFamily: hasUnread ? "Inter_700Bold" : "Inter_500Medium",
              color: hasUnread ? theme.colors.primary : theme.colors.muted
            }}
          >
            {formatRelativeTime(match.lastMessageAt || match.createdAt)}
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 2
          }}
        >
          {/* Which of MY pets this match belongs to — quickly signals
              that each pet has its own match history. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 3,
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: theme.colors.primaryBg,
              maxWidth: 120
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 9.5,
                fontFamily: "Inter_700Bold",
                color: theme.colors.primary,
                letterSpacing: 0.2
              }}
            >
              {match.pet.name}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={{
              fontSize: mobileTheme.typography.caption.fontSize,
              fontFamily: "Inter_500Medium",
              color: theme.colors.muted,
              flex: 1
            }}
          >
            & {theirPet.name}
          </Text>
        </View>

        {match.lastMessagePreview &&
          match.lastMessagePreview !== "It's a match. Say hello!" && (
            <Text
              numberOfLines={1}
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                fontFamily: hasUnread ? "Inter_700Bold" : "Inter_400Regular",
                color: hasUnread ? theme.colors.ink : theme.colors.muted,
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
            bottom: 14,
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
