import { Pressable, Text, type StyleProp, type ViewStyle } from "react-native";

import { mobileTheme } from "@/lib/theme";

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
  const isSmall = size === "sm";

  const backgroundColor =
    variant === "primary"
      ? mobileTheme.colors.primary
      : variant === "secondary"
        ? mobileTheme.colors.secondary
        : "transparent";

  const color = variant === "ghost" ? mobileTheme.colors.secondary : "#FFFFFF";

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        {
          borderRadius: mobileTheme.radius.pill,
          backgroundColor,
          borderWidth: variant === "ghost" ? 1 : 0,
          borderColor: mobileTheme.colors.borderStrong,
          paddingHorizontal: isSmall ? 14 : 20,
          paddingVertical: isSmall ? 10 : 15,
          opacity: disabled || loading ? 0.5 : 1,
          alignItems: "center",
          flexDirection: "row",
          gap: mobileTheme.spacing.sm
        },
        style
      ]}
    >
      {loading && <Text style={{ fontSize: 12, color }}>...</Text>}
      <Text
        selectable
        style={{
          color,
          fontFamily: "Inter_700Bold",
          fontWeight: "700",
          fontSize: isSmall ? 13 : 15
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
