import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { Pin } from "lucide-react-native";
import type { Message } from "@petto/contracts";
import { mobileTheme, useTheme } from "@/lib/theme";

type PinnedBannerProps = {
  pinned: Message[];
  onPress?: () => void;
};

/**
 * Compact pinned message banner shown under the chat header.
 * Tapping opens a sheet with the full list of pinned messages.
 */
function PinnedBannerBase({ pinned, onPress }: PinnedBannerProps) {
  const theme = useTheme();
  if (pinned.length === 0) return null;
  const top = pinned[0];
  if (!top) return null;

  const preview =
    top.type === "image"
      ? "📷 Photo"
      : top.type === "pet_share"
      ? "🐾 Pet shared"
      : top.body;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: mobileTheme.spacing.lg,
        paddingVertical: 10,
        backgroundColor: theme.colors.primaryBg,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: theme.colors.primary,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Pin size={14} color={theme.colors.white} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 11,
            color: theme.colors.primary,
            fontFamily: "Inter_600SemiBold"
          }}
        >
          Pinned message
          {pinned.length > 1 ? ` · ${pinned.length}` : ""}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 13,
            color: theme.colors.ink,
            fontFamily: "Inter_500Medium"
          }}
        >
          {top.senderName ? `${top.senderName}: ` : ""}
          {preview}
        </Text>
      </View>
    </Pressable>
  );
}

export const PinnedBanner = memo(PinnedBannerBase, (prev, next) => {
  if (prev.onPress !== next.onPress) return false;
  if (prev.pinned.length !== next.pinned.length) return false;
  return prev.pinned[0]?.id === next.pinned[0]?.id;
});
