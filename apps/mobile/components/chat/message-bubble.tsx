import { memo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { Lock, PawPrint, Pin, Trash2, X } from "lucide-react-native";
import type { Message } from "@petto/contracts";

import { Avatar } from "@/components/avatar";
import { mobileTheme, useTheme } from "@/lib/theme";
import { HashtagText } from "./hashtag-text";

type MessageBubbleProps = {
  message: Message;
  showAvatar: boolean;
  showName: boolean;
  showTimestamp: boolean;
  onLongPress?: () => void;
};

/**
 * Unified renderer for every message type (text, image, pet_share, system).
 * Handles: avatar + sender name on group chats, hashtag styling, image preview
 * modal, pet share card, system pill and tombstones for deleted messages.
 */
function MessageBubbleBase({
  message,
  showAvatar,
  showName,
  showTimestamp,
  onLongPress
}: MessageBubbleProps) {
  const theme = useTheme();
  const [imageOpen, setImageOpen] = useState(false);

  const isDeleted = Boolean(message.deletedAt);
  const isPinned = Boolean(message.pinnedAt);
  const isSystem = message.type === "system";

  // ── System pill ─────────────────────────────────────────────
  if (isSystem) {
    const meta = (message.metadata ?? {}) as Record<string, unknown>;
    const firstName = (meta.firstName as string) || "Someone";
    const kind = (meta.kind as string) || message.body;
    const label =
      kind === "member_joined"
        ? `${firstName} joined the group`
        : kind === "member_kicked"
        ? `${firstName} was removed`
        : kind === "member_muted"
        ? `${firstName} was muted`
        : message.body;

    return (
      <View
        style={{
          alignSelf: "center",
          marginVertical: mobileTheme.spacing.sm,
          paddingHorizontal: mobileTheme.spacing.md,
          paddingVertical: 6,
          borderRadius: mobileTheme.radius.pill,
          backgroundColor: theme.colors.secondarySoft
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontFamily: "Inter_500Medium",
            color: theme.colors.secondary
          }}
        >
          {label}
        </Text>
      </View>
    );
  }

  const petShareMeta =
    message.type === "pet_share"
      ? ((message.metadata ?? {}) as {
          petId?: string;
          petName?: string;
          petPhotoUrl?: string;
          speciesLabel?: string;
          breedLabel?: string;
        })
      : null;

  return (
    <View
      style={{
        flexDirection: showAvatar && !message.isMine ? "row" : "column",
        alignSelf: message.isMine ? "flex-end" : "flex-start",
        maxWidth: "84%",
        marginHorizontal: mobileTheme.spacing.lg,
        marginBottom: mobileTheme.spacing.sm,
        gap: showAvatar && !message.isMine ? 8 : 0
      }}
    >
      {showAvatar && !message.isMine && (
        <Avatar
          uri={message.senderAvatarUrl || undefined}
          name={message.senderName}
          size="sm"
        />
      )}
      <View style={{ flexShrink: 1 }}>
        {showName && !message.isMine && (
          <Text
            style={{
              fontSize: 11,
              fontWeight: "600",
              color: theme.colors.primary,
              fontFamily: "Inter_600SemiBold",
              marginBottom: 2,
              marginLeft: 4
            }}
          >
            {message.senderName}
          </Text>
        )}
        {isPinned && !isDeleted && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginBottom: 3,
              marginLeft: message.isMine ? 0 : 4
            }}
          >
            <Pin size={11} color={theme.colors.accent} />
            <Text
              style={{
                fontSize: 10,
                color: theme.colors.accent,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              Pinned
            </Text>
          </View>
        )}

        <Pressable onLongPress={onLongPress} delayLongPress={300}>
          <View
            style={{
              paddingHorizontal:
                message.type === "image" ? 4 : mobileTheme.spacing.lg,
              paddingVertical:
                message.type === "image" ? 4 : mobileTheme.spacing.sm + 4,
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: message.isMine
                ? theme.colors.primary
                : theme.colors.white,
              borderTopRightRadius: message.isMine
                ? mobileTheme.radius.xs
                : mobileTheme.radius.lg,
              borderTopLeftRadius: message.isMine
                ? mobileTheme.radius.lg
                : mobileTheme.radius.xs,
              ...mobileTheme.shadow.sm
            }}
          >
            {isDeleted ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Trash2
                  size={13}
                  color={message.isMine ? theme.colors.white : theme.colors.muted}
                  strokeWidth={1.7}
                />
                <Text
                  style={{
                    fontStyle: "italic",
                    color: message.isMine ? theme.colors.white : theme.colors.muted,
                    fontSize: 13,
                    fontFamily: "Inter_400Regular"
                  }}
                >
                  Message deleted
                </Text>
              </View>
            ) : message.type === "image" && message.imageUrl ? (
              <Pressable onPress={() => setImageOpen(true)}>
                <Image
                  source={{ uri: message.imageUrl }}
                  style={{
                    width: 220,
                    height: 260,
                    borderRadius: mobileTheme.radius.md
                  }}
                  contentFit="cover"
                />
                {message.body ? (
                  <HashtagText
                    body={message.body}
                    style={{
                      paddingTop: 6,
                      paddingHorizontal: 6,
                      color: message.isMine ? theme.colors.white : theme.colors.ink,
                      fontSize: 13,
                      fontFamily: "Inter_400Regular"
                    }}
                  />
                ) : null}
              </Pressable>
            ) : message.type === "pet_share" && petShareMeta ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 200
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    overflow: "hidden",
                    backgroundColor: message.isMine
                      ? "rgba(255,255,255,0.2)"
                      : theme.colors.primaryBg,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {petShareMeta.petPhotoUrl ? (
                    <Image
                      source={{ uri: petShareMeta.petPhotoUrl }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                    />
                  ) : (
                    <PawPrint
                      size={22}
                      color={message.isMine ? theme.colors.white : theme.colors.primary}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: message.isMine ? theme.colors.white : theme.colors.ink,
                      fontFamily: "Inter_700Bold"
                    }}
                    numberOfLines={1}
                  >
                    {petShareMeta.petName || "Pet"}
                  </Text>
                  {(petShareMeta.speciesLabel || petShareMeta.breedLabel) && (
                    <Text
                      style={{
                        fontSize: 11,
                        color: message.isMine
                          ? "rgba(255,255,255,0.85)"
                          : theme.colors.muted,
                        fontFamily: "Inter_500Medium"
                      }}
                      numberOfLines={1}
                    >
                      {[petShareMeta.speciesLabel, petShareMeta.breedLabel]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <HashtagText
                body={message.body}
                style={{
                  color: message.isMine ? theme.colors.white : theme.colors.ink,
                  lineHeight: mobileTheme.typography.body.lineHeight,
                  fontSize: mobileTheme.typography.body.fontSize,
                  fontFamily: "Inter_400Regular"
                }}
                accentColor={
                  message.isMine ? theme.colors.accent : theme.colors.primary
                }
              />
            )}
          </View>
        </Pressable>
      </View>

      {showTimestamp && (
        <Text
          style={{
            fontSize: 10,
            color: theme.colors.muted,
            marginTop: 3,
            marginHorizontal: mobileTheme.spacing.sm,
            alignSelf: message.isMine ? "flex-end" : "flex-start",
            fontFamily: "Inter_400Regular"
          }}
        >
          {new Date(message.createdAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit"
          })}
        </Text>
      )}

      {/* Full-screen image viewer */}
      <Modal
        transparent
        visible={imageOpen}
        animationType="fade"
        onRequestClose={() => setImageOpen(false)}
      >
        <Pressable
          onPress={() => setImageOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.92)",
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <Pressable
            onPress={() => setImageOpen(false)}
            hitSlop={16}
            style={{
              position: "absolute",
              top: 56,
              right: 24,
              padding: 8,
              borderRadius: 22,
              backgroundColor: "rgba(0,0,0,0.5)"
            }}
          >
            <X size={22} color="#fff" />
          </Pressable>
          {message.imageUrl && (
            <Image
              source={{ uri: message.imageUrl }}
              style={{ width: "92%", height: "80%" }}
              contentFit="contain"
            />
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

/**
 * Memoized by the fields that actually affect rendering. With TanStack Query's
 * structural sharing, a poll that returns an identical list keeps every
 * message object's identity — so this comparator short-circuits and the
 * FlatList renders zero bubbles.
 */
export const MessageBubble = memo(MessageBubbleBase, (prev, next) => {
  if (prev.showAvatar !== next.showAvatar) return false;
  if (prev.showName !== next.showName) return false;
  if (prev.showTimestamp !== next.showTimestamp) return false;
  if (prev.onLongPress !== next.onLongPress) return false;
  const a = prev.message;
  const b = next.message;
  if (a === b) return true;
  return (
    a.id === b.id &&
    a.body === b.body &&
    a.type === b.type &&
    a.imageUrl === b.imageUrl &&
    a.deletedAt === b.deletedAt &&
    a.pinnedAt === b.pinnedAt &&
    a.isMine === b.isMine &&
    a.senderAvatarUrl === b.senderAvatarUrl &&
    a.senderName === b.senderName
  );
});
