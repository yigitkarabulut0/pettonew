import { View, Text } from "react-native";

import { mobileTheme } from "@/lib/theme";

interface BadgeProps {
  count?: number;
  variant?: "primary" | "secondary" | "dot";
}

export function Badge({ count, variant = "primary" }: BadgeProps) {
  if (variant === "dot") {
    return (
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: mobileTheme.colors.primary,
          borderWidth: 2,
          borderColor: mobileTheme.colors.white
        }}
      />
    );
  }

  const displayCount = count ?? 0;
  const text = displayCount > 99 ? "99+" : String(displayCount);

  return (
    <View
      style={{
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor:
          variant === "primary"
            ? mobileTheme.colors.primary
            : mobileTheme.colors.secondary,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 5
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: "700",
          color: mobileTheme.colors.white,
          fontFamily: "Inter_700Bold"
        }}
      >
        {text}
      </Text>
    </View>
  );
}
