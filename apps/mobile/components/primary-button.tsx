import { Pressable, Text } from "react-native";

import { mobileTheme } from "@/lib/theme";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
}

export function PrimaryButton({
  label,
  onPress,
  variant = "primary",
  disabled = false
}: PrimaryButtonProps) {
  const backgroundColor =
    variant === "primary"
      ? mobileTheme.colors.primary
      : variant === "secondary"
        ? mobileTheme.colors.secondary
        : "transparent";

  const color = variant === "ghost" ? mobileTheme.colors.secondary : "#FFFFFF";

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        borderRadius: mobileTheme.radius.pill,
        backgroundColor,
        borderWidth: variant === "ghost" ? 1 : 0,
        borderColor: mobileTheme.colors.border,
        paddingHorizontal: 18,
        paddingVertical: 14,
        opacity: disabled ? 0.55 : 1,
        alignItems: "center"
      }}
    >
      <Text
        selectable
        style={{
          color,
          fontFamily: "Avenir Next",
          fontWeight: "700",
          fontSize: 16
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

