import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { Playdate } from "@petto/contracts";

import { mobileTheme, useTheme } from "@/lib/theme";
import { formatDistance } from "@/lib/distance";
import {
  computePlaydateState,
  type PlaydateStateTone
} from "@/lib/playdate-state";

type PlaydateCardProps = {
  playdate: Playdate;
  onPress: () => void;
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

function PlaydateCardBase({ playdate, onPress }: PlaydateCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const dateInfo = formatDate(playdate.date);
  const cover = playdate.coverImageUrl;
  const stateInfo = computePlaydateState(playdate);
  const maxPets = playdate.maxPets > 0 ? playdate.maxPets : 0;
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontSize: 16,
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold"
              }}
            >
              {playdate.title}
            </Text>
            {stateInfo.badgeLabel ? (
              <StateBadge
                theme={theme}
                label={t(stateInfo.badgeLabel) as string}
                tone={stateInfo.badgeTone ?? "neutral"}
              />
            ) : null}
          </View>

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

        {/* Attendee count (pet-level, falls back to legacy attendees length) */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginTop: 8
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
            {stateInfo.slotsUsed}
            {maxPets > 0 ? ` / ${maxPets}` : ""}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// Small colour-keyed badge pill used in the title row.
function StateBadge({
  theme,
  label,
  tone
}: {
  theme: ReturnType<typeof useTheme>;
  label: string;
  tone: PlaydateStateTone;
}) {
  const palette: Record<PlaydateStateTone, { bg: string; fg: string }> = {
    primary: { bg: theme.colors.primary, fg: theme.colors.white },
    secondary: { bg: theme.colors.secondarySoft, fg: theme.colors.secondary },
    accent: { bg: theme.colors.accent + "22", fg: theme.colors.accent },
    danger: { bg: theme.colors.dangerBg, fg: theme.colors.danger },
    neutral: { bg: theme.colors.border, fg: theme.colors.muted }
  };
  const { bg, fg } = palette[tone];
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: bg
      }}
    >
      <Text
        style={{
          fontSize: 9,
          letterSpacing: 0.3,
          color: fg,
          fontFamily: "Inter_700Bold",
          textTransform: "uppercase"
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export const PlaydateCard = memo(PlaydateCardBase);
