import { ScrollView, StyleSheet, Text, View } from "react-native";

import { mobileTheme } from "@/lib/theme";

const c = mobileTheme.colors;
const t = mobileTheme.typography;
const f = mobileTheme.fontFamily;

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
    <View style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.canvas
  },
  scrollContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 100
  },
  header: {
    gap: 4,
    paddingTop: 8,
    marginBottom: 4
  },
  eyebrow: {
    color: c.secondary,
    textTransform: "uppercase",
    letterSpacing: t.eyebrow.letterSpacing,
    fontSize: t.eyebrow.size,
    fontWeight: t.eyebrow.weight,
    fontFamily: f
  },
  title: {
    color: c.ink,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700" as const,
    fontFamily: f
  },
  subtitle: {
    color: c.muted,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: f
  }
});
