import { View } from "react-native";

import { mobileTheme } from "@/lib/theme";

type CardVariant = "elevated" | "outlined" | "flat";

interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  padding?: number;
  style?: object;
}

export function Card({
  children,
  variant = "elevated",
  padding = mobileTheme.spacing.lg,
  style
}: CardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: mobileTheme.colors.white,
          borderRadius: mobileTheme.radius.lg,
          padding,
          ...(variant === "elevated" ? mobileTheme.shadow.sm : {}),
          ...(variant === "outlined"
            ? {
                borderWidth: 1,
                borderColor: mobileTheme.colors.border
              }
            : {})
        },
        style
      ]}
    >
      {children}
    </View>
  );
}
