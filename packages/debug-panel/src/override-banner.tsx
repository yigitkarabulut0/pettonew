// Small always-visible chip that appears whenever at least one debug
// override is active. It prevents the "my app is broken!" confusion that
// happens when someone leaves an API error or permission override on and
// forgets about it.
//
// Tap the chip to open the debug panel so the tester can flip things back.

import * as React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useDebug, useOverridesVersion } from "./provider";
import { getOverrides } from "./overrides";

export function DebugOverrideBanner() {
  const { open } = useDebug();
  const version = useOverridesVersion();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const overrides = React.useMemo(() => getOverrides(), [version]);

  const active: string[] = [];
  if (overrides.apiErrorStatus) {
    active.push(
      `HTTP ${overrides.apiErrorStatus}${
        overrides.apiErrorPath ? ` ${overrides.apiErrorPath}` : ""
      }`
    );
  }
  if (overrides.apiLatencyMs && overrides.apiLatencyMs > 0) {
    active.push(`+${overrides.apiLatencyMs}ms`);
  }
  if (Object.keys(overrides.permissions).length > 0) active.push("permissions");
  if (overrides.sessionOverride) active.push("mock user");
  if (overrides.locationOverride) active.push(overrides.locationOverride.label);

  if (active.length === 0) return null;

  return (
    <Pressable
      onPress={open}
      style={styles.pill}
      accessibilityLabel="Debug overrides active, tap to open panel"
    >
      <View style={styles.dot} />
      <Text style={styles.text} numberOfLines={1}>
        DEBUG · {active.join(" · ")}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 28,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(22,21,20,0.92)",
    zIndex: 9998,
    maxWidth: "90%"
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#E6694A"
  },
  text: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6
  }
});
