import { Pressable, StyleSheet, Text } from "react-native";

import { mobileTheme } from "@/lib/theme";

const c = mobileTheme.colors;
const f = mobileTheme.fontFamily;
const r = mobileTheme.radius;

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
  const isPrimary = variant === "primary";
  const isSecondary = variant === "secondary";
  const isGhost = variant === "ghost";

  const bgColor = isPrimary
    ? c.primary
    : isSecondary
      ? c.secondary
      : "transparent";
  const textColor = isGhost ? c.secondary : "#FFFFFF";

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bgColor,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1
        },
        isGhost && styles.ghostBorder
      ]}
    >
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: r.lg,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center"
  },
  ghostBorder: {
    borderWidth: 1,
    borderColor: c.border
  },
  label: {
    fontFamily: f,
    fontWeight: "600" as const,
    fontSize: 15
  }
});
