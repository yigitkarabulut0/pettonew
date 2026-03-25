import { Text, View } from "react-native";

import { mobileTheme } from "@/lib/theme";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: mobileTheme.spacing["4xl"],
        paddingHorizontal: mobileTheme.spacing["3xl"],
        gap: mobileTheme.spacing.md
      }}
    >
      {icon && (
        <View style={{ marginBottom: mobileTheme.spacing.sm }}>{icon}</View>
      )}
      <Text
        style={{
          fontSize: mobileTheme.typography.subheading.fontSize,
          fontWeight: mobileTheme.typography.subheading.fontWeight,
          color: mobileTheme.colors.ink,
          fontFamily: "Inter_600SemiBold",
          textAlign: "center",
          lineHeight: mobileTheme.typography.subheading.lineHeight
        }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={{
            fontSize: mobileTheme.typography.body.fontSize,
            fontWeight: mobileTheme.typography.body.fontWeight,
            color: mobileTheme.colors.muted,
            fontFamily: "Inter_400Regular",
            textAlign: "center",
            lineHeight: mobileTheme.typography.body.lineHeight,
            maxWidth: 280
          }}
        >
          {description}
        </Text>
      ) : null}
    </View>
  );
}
