import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { CalendarDays, Check, Clock, MapPin, Users } from "lucide-react-native";
import type { Playdate } from "@petto/contracts";

import { mobileTheme, useTheme } from "@/lib/theme";
import { formatDistance } from "@/lib/distance";

type PlaydateCardProps = {
  playdate: Playdate;
  onPress: () => void;
  onJoin?: () => void;
  joinPending?: boolean;
};

function formatDate(dateStr: string): { line: string; time: string } {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { line: dateStr, time: "" };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  let line: string;
  if (diffDays === 0) line = "Today";
  else if (diffDays === 1) line = "Tomorrow";
  else if (diffDays > 1 && diffDays < 7)
    line = d.toLocaleDateString("en-GB", { weekday: "long" });
  else
    line = d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short"
    });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return { line, time };
}

function PlaydateCardBase({
  playdate,
  onPress,
  onJoin,
  joinPending
}: PlaydateCardProps) {
  const theme = useTheme();
  const dateInfo = formatDate(playdate.date);
  const cover = playdate.coverImageUrl;
  const attendingCount = playdate.attendees?.length ?? 0;
  const maxPets = playdate.maxPets > 0 ? playdate.maxPets : 0;
  const isFull = maxPets > 0 && attendingCount >= maxPets;
  const hasDistance = playdate.distance != null && playdate.distance > 0;
  const distanceLabel = hasDistance
    ? formatDistance(playdate.distance as number)
    : "";
  const locationText = playdate.cityLabel || playdate.location || "";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: 14,
        padding: 14,
        borderRadius: mobileTheme.radius.lg,
        backgroundColor: theme.colors.white,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.92 : 1,
        ...mobileTheme.shadow.sm
      })}
    >
      {/* Cover */}
      <View
        style={{
          width: 92,
          height: 92,
          borderRadius: mobileTheme.radius.md,
          overflow: "hidden",
          backgroundColor: theme.colors.primaryBg,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={250}
            cachePolicy="memory-disk"
            recyclingKey={playdate.id}
          />
        ) : (
          <CalendarDays size={32} color={theme.colors.primary} />
        )}
      </View>

      {/* Body */}
      <View style={{ flex: 1, justifyContent: "space-between" }}>
        <View>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 16,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            {playdate.title}
          </Text>

          {/* Date + time */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginTop: 4
            }}
          >
            <Clock size={11} color={theme.colors.primary} />
            <Text
              numberOfLines={1}
              style={{
                fontSize: 12,
                color: theme.colors.primary,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {dateInfo.line}
              {dateInfo.time ? ` · ${dateInfo.time}` : ""}
            </Text>
          </View>

          {/* Location + distance */}
          {(locationText || distanceLabel) && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                marginTop: 4
              }}
            >
              <MapPin size={11} color={theme.colors.muted} />
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 11,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium",
                  flexShrink: 1
                }}
              >
                {[distanceLabel, locationText].filter(Boolean).join(" · ")}
              </Text>
            </View>
          )}
        </View>

        {/* Attendees + join */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 8
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4
            }}
          >
            <Users size={12} color={theme.colors.secondary} />
            <Text
              style={{
                fontSize: 11,
                color: theme.colors.secondary,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {attendingCount}
              {maxPets > 0 ? ` / ${maxPets}` : ""}
            </Text>
          </View>

          {onJoin ? (
            playdate.isAttending ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: theme.colors.secondarySoft
                }}
              >
                <Check size={13} color={theme.colors.secondary} strokeWidth={2.6} />
                <Text
                  style={{
                    fontSize: 11,
                    color: theme.colors.secondary,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  Joined
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  if (!isFull && !joinPending) onJoin();
                }}
                disabled={isFull || joinPending}
                hitSlop={6}
                style={({ pressed }) => ({
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: isFull
                    ? theme.colors.border
                    : theme.colors.primary,
                  opacity: pressed || joinPending ? 0.7 : 1
                })}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: isFull ? theme.colors.muted : theme.colors.white,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {isFull ? "Full" : "Join"}
                </Text>
              </Pressable>
            )
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export const PlaydateCard = memo(PlaydateCardBase);
