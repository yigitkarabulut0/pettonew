import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { X } from "lucide-react-native";
import { mobileTheme, useTheme } from "@/lib/theme";

interface QRCodeModalProps {
  visible: boolean;
  petId: string;
  petName: string;
  onClose: () => void;
}

export function QRCodeModal({ visible, petId, petName, onClose }: QRCodeModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const deepLink = `petto://pet/${petId}`;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "center", alignItems: "center" }}>
        <View style={{
          width: "85%",
          backgroundColor: theme.colors.white,
          borderRadius: mobileTheme.radius.xl,
          padding: mobileTheme.spacing["3xl"],
          alignItems: "center",
          gap: mobileTheme.spacing.xl
        }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
            <Text style={{
              fontSize: mobileTheme.typography.subheading.fontSize,
              fontWeight: mobileTheme.typography.subheading.fontWeight,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}>
              {petName}'s QR Code
            </Text>
            <Pressable onPress={onClose} hitSlop={12} style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: theme.colors.surface,
              alignItems: "center", justifyContent: "center"
            }}>
              <X size={18} color={theme.colors.ink} />
            </Pressable>
          </View>

          <View style={{
            padding: mobileTheme.spacing.xl,
            backgroundColor: "#FFFFFF",
            borderRadius: mobileTheme.radius.lg,
            borderWidth: 1,
            borderColor: theme.colors.border
          }}>
            <QRCode value={deepLink} size={200} color="#161514" backgroundColor="#FFFFFF" />
          </View>

          <Text style={{
            fontSize: mobileTheme.typography.caption.fontSize,
            color: theme.colors.muted,
            fontFamily: "Inter_500Medium",
            textAlign: "center"
          }}>
            Scan this QR code to view {petName}'s profile on Petto
          </Text>
        </View>
      </View>
    </Modal>
  );
}
