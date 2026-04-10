import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mobileTheme, useTheme } from "@/lib/theme";

interface ScreenShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  noBottomPadding?: boolean;
}

export function ScreenShell({
  eyebrow,
  title,
  subtitle,
  children,
  noBottomPadding = false
}: ScreenShellProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background
      }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          padding: mobileTheme.spacing.xl,
          gap: mobileTheme.spacing.xl,
          paddingBottom: noBottomPadding ? mobileTheme.spacing.xl : 100 + insets.bottom
        }}
      >
        <View
          style={{
            gap: mobileTheme.spacing.sm,
            paddingTop: insets.top + mobileTheme.spacing.md
          }}
        >
          {eyebrow ? (
            <Text
              style={{
                color: theme.colors.primary,
                textTransform: "uppercase",
                letterSpacing: mobileTheme.typography.label.letterSpacing,
                fontSize: mobileTheme.typography.label.fontSize,
                fontWeight: mobileTheme.typography.label.fontWeight,
                fontFamily: "Inter_700Bold"
              }}
            >
              {eyebrow}
            </Text>
          ) : null}
          <Text
            style={{
              color: theme.colors.ink,
              fontSize: mobileTheme.typography.display.fontSize,
              lineHeight: mobileTheme.typography.display.lineHeight,
              fontWeight: mobileTheme.typography.display.fontWeight,
              letterSpacing: mobileTheme.typography.display.letterSpacing,
              fontFamily: "Inter_700Bold"
            }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={{
                color: theme.colors.muted,
                fontSize: mobileTheme.typography.body.fontSize,
                lineHeight: mobileTheme.typography.body.lineHeight,
                fontFamily: "Inter_400Regular"
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}
