import { ScrollView, Text, View } from "react-native";

import { mobileTheme } from "@/lib/theme";

interface ScreenShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function ScreenShell({
  eyebrow,
  title,
  subtitle,
  children
}: ScreenShellProps) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: mobileTheme.colors.background
      }}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          padding: 20,
          gap: 18,
          paddingBottom: 132
        }}
      >
        <View
          style={{
            gap: 6,
            paddingTop: 12
          }}
        >
          {eyebrow ? (
            <Text
              selectable
              style={{
                color: mobileTheme.colors.primary,
                textTransform: "uppercase",
                letterSpacing: 1.6,
                fontSize: 12,
                fontWeight: "700"
              }}
            >
              {eyebrow}
            </Text>
          ) : null}
          <Text
            selectable
            style={{
              color: mobileTheme.colors.ink,
              fontSize: 34,
              lineHeight: 38,
              fontWeight: "700"
            }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              selectable
              style={{
                color: mobileTheme.colors.muted,
                fontSize: 16,
                lineHeight: 24
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
