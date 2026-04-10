import * as Haptics from "expo-haptics";
import { Pressable, Text, type StyleProp, type ViewStyle } from "react-native";

import { mobileTheme, useTheme } from "@/lib/theme";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
}

export function PrimaryButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  size = "md",
  style
}: PrimaryButtonProps) {
  const theme = useTheme();
  const isSmall = size === "sm";

  const backgroundColor =
    variant === "primary"
      ? theme.colors.primary
      : variant === "secondary"
        ? theme.colors.secondary
        : "transparent";

  const color = variant === "ghost" ? theme.colors.secondary : theme.colors.white;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={handlePress}
      style={({ pressed }) => [
        {
          borderRadius: mobileTheme.radius.pill,
          backgroundColor,
          borderWidth: variant === "ghost" ? 1 : 0,
          borderColor: theme.colors.borderStrong,
          paddingHorizontal: isSmall ? 14 : 20,
          paddingVertical: isSmall ? 14 : 15,
          opacity: disabled || loading ? 0.5 : 1,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: mobileTheme.spacing.sm,
          transform: [{ scale: pressed ? 0.97 : 1 }]
        },
        style
      ]}
    >
      {loading && <Text style={{ fontSize: 12, color }}>...</Text>}
      <Text
        style={{
          color,
          fontFamily: "Inter_700Bold",
          fontWeight: "700",
          fontSize: isSmall
            ? mobileTheme.typography.caption.fontSize
            : mobileTheme.typography.body.fontSize
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
