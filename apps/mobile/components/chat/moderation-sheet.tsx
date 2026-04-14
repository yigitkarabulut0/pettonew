import { Modal, Pressable, Text, View } from "react-native";
import { Copy, Flag, MicOff, Pin, PinOff, Trash2, X } from "lucide-react-native";
import type { Message } from "@petto/contracts";
import { mobileTheme, useTheme } from "@/lib/theme";

export type ModerationAction =
  | "copy"
  | "report"
  | "delete"
  | "pin"
  | "unpin"
  | "mute-1h"
  | "mute-24h"
  | "mute-indefinite";

type ModerationSheetProps = {
  visible: boolean;
  message: Message | null;
  isAdmin: boolean;
  isOwnMessage: boolean;
  onClose: () => void;
  onAction: (action: ModerationAction) => void;
};

/**
 * Long-press action sheet for a chat message. Contains moderation tools for
 * admins/owners and message-wide actions (copy, report) for everybody.
 */
export function ModerationSheet({
  visible,
  message,
  isAdmin,
  isOwnMessage,
  onClose,
  onAction
}: ModerationSheetProps) {
  const theme = useTheme();
  if (!message) return null;

  const canDelete = isOwnMessage || isAdmin;
  const isPinned = Boolean(message.pinnedAt);
  const canMute = isAdmin && !isOwnMessage && message.type !== "system";

  const Row = ({
    icon,
    label,
    danger,
    onPress
  }: {
    icon: React.ReactNode;
    label: string;
    danger?: boolean;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={() => {
        onPress();
        onClose();
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: mobileTheme.spacing.xl,
        paddingVertical: 14
      }}
    >
      {icon}
      <Text
        style={{
          fontSize: 15,
          color: danger ? theme.colors.danger : theme.colors.ink,
          fontFamily: "Inter_600SemiBold"
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "transparent",
          justifyContent: "flex-end"
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 12,
            paddingBottom: 32
          }}
        >
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.border,
              alignSelf: "center",
              marginBottom: 8
            }}
          />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: mobileTheme.spacing.xl,
              marginBottom: 4
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 13,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}
              numberOfLines={1}
            >
              {message.senderName || "Message"}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={20} color={theme.colors.muted} />
            </Pressable>
          </View>

          {message.type === "text" && (
            <Row
              icon={<Copy size={18} color={theme.colors.ink} />}
              label="Copy"
              onPress={() => onAction("copy")}
            />
          )}

          {isAdmin && !isPinned && message.type !== "system" && (
            <Row
              icon={<Pin size={18} color={theme.colors.ink} />}
              label="Pin message"
              onPress={() => onAction("pin")}
            />
          )}
          {isAdmin && isPinned && (
            <Row
              icon={<PinOff size={18} color={theme.colors.ink} />}
              label="Unpin message"
              onPress={() => onAction("unpin")}
            />
          )}

          {canMute && (
            <>
              <Row
                icon={<MicOff size={18} color={theme.colors.ink} />}
                label="Mute sender · 1 hour"
                onPress={() => onAction("mute-1h")}
              />
              <Row
                icon={<MicOff size={18} color={theme.colors.ink} />}
                label="Mute sender · 24 hours"
                onPress={() => onAction("mute-24h")}
              />
              <Row
                icon={<MicOff size={18} color={theme.colors.danger} />}
                label="Mute sender · Indefinitely"
                danger
                onPress={() => onAction("mute-indefinite")}
              />
            </>
          )}

          {!isOwnMessage && (
            <Row
              icon={<Flag size={18} color={theme.colors.ink} />}
              label="Report"
              onPress={() => onAction("report")}
            />
          )}

          {canDelete && (
            <Row
              icon={<Trash2 size={18} color={theme.colors.danger} />}
              label="Delete"
              danger
              onPress={() => onAction("delete")}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
