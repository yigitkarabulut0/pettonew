import { Pressable } from "react-native";

import { mobileTheme } from "@/lib/theme";

type IconButtonSize = "sm" | "md" | "lg";

const sizeMap: Record<IconButtonSize, number> = {
  sm: 36,
  md: 44,
  lg: 56
};

interface IconButtonProps {
  icon: React.ReactNode;
  size?: IconButtonSize;
  onPress?: () => void;
  variant?: "default" | "primary" | "secondary" | "danger";
  style?: object;
}

const variantStyles: Record<
  NonNullable<IconButtonProps["variant"]>,
  { bg: string; border: string }
> = {
  default: { bg: mobileTheme.colors.white, border: mobileTheme.colors.border },
  primary: {
    bg: mobileTheme.colors.primary,
    border: mobileTheme.colors.primary
  },
  secondary: {
    bg: mobileTheme.colors.secondary,
    border: mobileTheme.colors.secondary
  },
  danger: { bg: mobileTheme.colors.danger, border: mobileTheme.colors.danger }
};

export function IconButton({
  icon,
  size = "md",
  onPress,
  variant = "default",
  style
}: IconButtonProps) {
  const dimension = sizeMap[size];
  const vStyle = variantStyles[variant];

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={[
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: vStyle.bg,
          alignItems: "center",
          justifyContent: "center",
          ...mobileTheme.shadow.sm
        },
        style
      ]}
    >
      {icon}
    </Pressable>
  );
}
