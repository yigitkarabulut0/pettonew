import { useEffect } from "react";
import { Dimensions, Modal, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Heart } from "lucide-react-native";

import { PrimaryButton } from "@/components/primary-button";
import { mobileTheme, useTheme } from "@/lib/theme";
import type { Pet } from "@petto/contracts";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface MatchCelebrationModalProps {
  visible: boolean;
  myPet: Pet | null;
  matchedPet: Pet | null;
  ownerName: string;
  conversationId: string;
  onDismiss: () => void;
  onSendMessage: (conversationId: string) => void;
}

export function MatchCelebrationModal({
  visible,
  myPet,
  matchedPet,
  ownerName,
  conversationId,
  onDismiss,
  onSendMessage
}: MatchCelebrationModalProps) {
  const theme = useTheme();

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onDismiss}
    >
      <Pressable
        onPress={onDismiss}
        style={{
          flex: 1,
          backgroundColor: "rgba(22,21,20,0.55)",
          justifyContent: "center",
          alignItems: "center"
        }}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View
            style={{
              borderRadius: mobileTheme.radius.xl,
              backgroundColor: theme.colors.surface,
              paddingVertical: mobileTheme.spacing["3xl"],
              paddingHorizontal: mobileTheme.spacing["2xl"],
              alignItems: "center",
              gap: mobileTheme.spacing.lg,
              width: SCREEN_WIDTH * 0.85,
              ...mobileTheme.shadow.lg
            }}
          >
            <View
              style={{
                flexDirection: "row",
                gap: mobileTheme.spacing.xl,
                alignItems: "center"
              }}
            >
              {myPet?.photos[0]?.url ? (
                <View style={{ alignItems: "center" }}>
                  <Image
                    source={{ uri: myPet.photos[0].url }}
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: 44,
                      borderWidth: 3,
                      borderColor: theme.colors.primary,
                      ...mobileTheme.shadow.md
                    }}
                    contentFit="cover"
                    transition={200}
                  />
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.caption.fontSize,
                      fontFamily: "Inter_600SemiBold",
                      color: theme.colors.ink,
                      marginTop: 6
                    }}
                  >
                    {myPet.name}
                  </Text>
                </View>
              ) : null}

              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: theme.colors.primaryBg,
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 10
                }}
              >
                <Heart size={16} color={theme.colors.primary} />
              </View>

              {matchedPet?.photos[0]?.url ? (
                <View style={{ alignItems: "center" }}>
                  <Image
                    source={{ uri: matchedPet.photos[0].url }}
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: 44,
                      borderWidth: 3,
                      borderColor: theme.colors.primary,
                      ...mobileTheme.shadow.md
                    }}
                    contentFit="cover"
                    transition={200}
                  />
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.caption.fontSize,
                      fontFamily: "Inter_600SemiBold",
                      color: theme.colors.ink,
                      marginTop: 6
                    }}
                  >
                    {matchedPet.name}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text
              style={{
                fontSize: mobileTheme.typography.heading.fontSize,
                fontWeight: mobileTheme.typography.heading.fontWeight,
                color: theme.colors.ink,
                textAlign: "center",
                fontFamily: "Inter_700Bold"
              }}
            >
              It&apos;s a Match!
            </Text>

            <Text
              style={{
                color: theme.colors.muted,
                textAlign: "center",
                lineHeight: mobileTheme.typography.body.lineHeight,
                fontSize: mobileTheme.typography.body.fontSize,
                fontFamily: "Inter_400Regular",
                maxWidth: 260
              }}
            >
              {myPet && matchedPet
                ? `${myPet.name} and ${matchedPet.name} like each other! Start a conversation now.`
                : "Your pets like each other! Start a conversation now."}
            </Text>

            <View
              style={{
                width: "100%",
                gap: mobileTheme.spacing.sm,
                marginTop: mobileTheme.spacing.sm
              }}
            >
              <PrimaryButton
                label="Send Message"
                onPress={() => onSendMessage(conversationId)}
              />
              <PrimaryButton
                label="Keep Swiping"
                onPress={onDismiss}
                variant="ghost"
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
