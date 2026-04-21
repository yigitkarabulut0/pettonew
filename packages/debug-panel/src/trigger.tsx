// Hidden gesture triggers for opening the debug panel.
//
// Two flavours:
//   • <DebugTriggerZone /> — invisible absolute-positioned corner zone,
//     mounted once at the root for apps that don't have a dedicated host
//     element (e.g. shelter-mobile).
//   • <DebugTapTrigger> — generic wrapper that counts 5 taps within 2s on
//     whatever you pass as a child (e.g. the home-screen profile avatar).
//
// Both paths share the same counter so the panel opens on the 5th tap
// inside the sliding 2-second window.

import * as React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useDebug } from "./provider";

const DEFAULT_TAPS = 5;
const DEFAULT_WINDOW_MS = 2000;

function useTapCounter(
  onTrigger: () => void,
  taps: number,
  windowMs: number
) {
  const state = React.useRef({ count: 0, firstAt: 0 });
  return React.useCallback(() => {
    const now = Date.now();
    const s = state.current;
    if (now - s.firstAt > windowMs) {
      s.count = 1;
      s.firstAt = now;
    } else {
      s.count += 1;
    }
    if (s.count >= taps) {
      s.count = 0;
      s.firstAt = 0;
      onTrigger();
    }
  }, [onTrigger, taps, windowMs]);
}

export function DebugTriggerZone({
  style,
  size = 56
}: {
  style?: View["props"]["style"];
  size?: number;
}) {
  const { open } = useDebug();
  const handlePress = useTapCounter(open, DEFAULT_TAPS, DEFAULT_WINDOW_MS);

  return (
    <View pointerEvents="box-none" style={[styles.root, style]}>
      <Pressable
        onPress={handlePress}
        accessibilityLabel="Debug panel gesture zone"
        accessibilityElementsHidden
        importantForAccessibility="no"
        hitSlop={8}
        style={{ width: size, height: size }}
      />
    </View>
  );
}

export function DebugTapTrigger({
  children,
  taps = DEFAULT_TAPS,
  windowMs = DEFAULT_WINDOW_MS,
  style
}: {
  children: React.ReactNode;
  taps?: number;
  windowMs?: number;
  style?: View["props"]["style"];
}) {
  const { open } = useDebug();
  const handlePress = useTapCounter(open, taps, windowMs);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityLabel="Debug panel trigger"
      accessibilityElementsHidden
      importantForAccessibility="no"
      hitSlop={4}
      style={style}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999
  }
});
