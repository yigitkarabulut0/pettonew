import { useState } from "react";
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as ImageManipulator from "expo-image-manipulator";
import { X } from "lucide-react-native";

import { PrimaryButton } from "@/components/primary-button";
import { mobileTheme, useTheme } from "@/lib/theme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CROP_SIZE = SCREEN_WIDTH - 48;

interface ImageCropModalProps {
  visible: boolean;
  imageUri: string | null;
  onCrop: (croppedUri: string) => void;
  onCancel: () => void;
  aspectRatio?: number;
}

export function ImageCropModal({
  visible,
  imageUri,
  onCrop,
  onCancel,
  aspectRatio = 1
}: ImageCropModalProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [processing, setProcessing] = useState(false);

  const handleCrop = async () => {
    if (!imageUri) return;
    setProcessing(true);
    try {
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 800 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      onCrop(result.uri);
    } catch {
      onCrop(imageUri);
    } finally {
      setProcessing(false);
    }
  };

  if (!imageUri) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.9)",
          justifyContent: "center",
          alignItems: "center"
        }}
      >
        <View
          style={{
            position: "absolute",
            top: insets.top + mobileTheme.spacing.md,
            right: mobileTheme.spacing.xl,
            zIndex: 10
          }}
        >
          <Pressable
            onPress={onCancel}
            hitSlop={12}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: "rgba(255,255,255,0.2)",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <X size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        <View
          style={{
            width: CROP_SIZE,
            height: CROP_SIZE / aspectRatio,
            borderRadius: mobileTheme.radius.lg,
            overflow: "hidden",
            borderWidth: 2,
            borderColor: "rgba(255,255,255,0.3)"
          }}
        >
          <Image
            source={{ uri: imageUri }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        </View>

        <Text
          style={{
            marginTop: mobileTheme.spacing.xl,
            color: "rgba(255,255,255,0.7)",
            fontSize: mobileTheme.typography.caption.fontSize,
            fontFamily: "Inter_500Medium",
            textAlign: "center"
          }}
        >
          {t("imageCrop.optimizeNotice")}
        </Text>

        <View
          style={{
            flexDirection: "row",
            gap: mobileTheme.spacing.md,
            marginTop: mobileTheme.spacing.xl,
            paddingHorizontal: mobileTheme.spacing["3xl"]
          }}
        >
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label={t("common.cancel")}
              variant="ghost"
              onPress={onCancel}
              style={{ borderColor: "rgba(255,255,255,0.3)" }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label={processing ? t("imageCrop.processing") : t("imageCrop.usePhoto")}
              onPress={handleCrop}
              disabled={processing}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
