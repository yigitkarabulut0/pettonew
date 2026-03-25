import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mobileTheme } from "@/lib/theme";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
}

export function Header({
  title,
  subtitle,
  showBack = false,
  rightAction
}: HeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: insets.top + mobileTheme.spacing.md,
        paddingBottom: mobileTheme.spacing.lg,
        paddingHorizontal: mobileTheme.spacing.xl
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.sm,
          flex: 1
        }}
      >
        {showBack && (
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: mobileTheme.colors.surface,
              alignItems: "center",
              justifyContent: "center",
              ...mobileTheme.shadow.sm,
              borderWidth: 1,
              borderColor: mobileTheme.colors.border
            }}
          >
            <Text
              style={{
                fontSize: 18,
                color: mobileTheme.colors.ink,
                fontWeight: "600",
                marginTop: -1
              }}
            >
              ‹
            </Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          {title ? (
            <Text
              style={{
                fontSize: mobileTheme.typography.heading.fontSize,
                fontWeight: mobileTheme.typography.heading.fontWeight,
                color: mobileTheme.colors.ink,
                fontFamily: "Inter_700Bold",
                lineHeight: mobileTheme.typography.heading.lineHeight
              }}
            >
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text
              style={{
                fontSize: mobileTheme.typography.caption.fontSize,
                fontWeight: mobileTheme.typography.caption.fontWeight,
                color: mobileTheme.colors.muted,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {rightAction ? (
        <View style={{ marginLeft: mobileTheme.spacing.sm }}>
          {rightAction}
        </View>
      ) : null}
    </View>
  );
}
