// DraggableSheet — the shared bottom-sheet primitive used across Fetcht.
//
// Design notes:
// - The backdrop is fully transparent by default. The user explicitly
//   asked that the area above the sheet not be darkened. Tapping that
//   transparent area still dismisses the sheet.
// - The sheet snaps between two heights (medium/large) and can be
//   dragged up to expand or dragged down to dismiss. Velocity-aware so
//   a quick flick down always closes.
// - Built on Reanimated + react-native-gesture-handler (already wired
//   in this app via GestureHandlerRootView in app/_layout.tsx). No new
//   dependency.
//
// API is intentionally small; content is a child render prop so
// migration from the many ad-hoc Modal wrappers in the app is a
// mechanical swap.

import React, { useCallback, useEffect, useMemo } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  View,
  ViewStyle
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";

import { mobileTheme, useTheme } from "@/lib/theme";

export type SheetSnap = "medium" | "large";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Fraction of screen height, 0–1. Defaults: medium 0.55, large 0.92. */
  snapPoints?: { medium?: number; large?: number };
  /** Start height. Defaults to "medium". */
  initialSnap?: SheetSnap;
  /** "transparent" (default, no dim) or "dim" (legacy 0.4 black). */
  backdrop?: "transparent" | "dim";
  /** Hides the drag handle indicator if false. Default true. */
  showHandle?: boolean;
  /** Style overrides for the inner sheet container. */
  containerStyle?: ViewStyle;
  children: React.ReactNode;
};

const SPRING: Parameters<typeof withSpring>[1] = {
  damping: 22,
  stiffness: 220,
  mass: 0.8,
  overshootClamping: false
};

export function DraggableSheet({
  visible,
  onClose,
  snapPoints,
  initialSnap = "medium",
  backdrop = "transparent",
  showHandle = true,
  containerStyle,
  children
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get("window").height;

  const mediumFrac = snapPoints?.medium ?? 0.55;
  const largeFrac = snapPoints?.large ?? 0.92;
  const mediumH = Math.round(screenH * mediumFrac);
  const largeH = Math.round(screenH * largeFrac);

  // translateY: 0 = fully on-screen at current snap height; positive =
  // dragged down; `sheetHeight` = fully hidden.
  const translateY = useSharedValue(screenH);
  const sheetHeight = useSharedValue(initialSnap === "large" ? largeH : mediumH);
  const opacity = useSharedValue(0);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (visible) {
      sheetHeight.value = initialSnap === "large" ? largeH : mediumH;
      translateY.value = withSpring(0, SPRING);
      opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    } else {
      translateY.value = withTiming(screenH, { duration: 220, easing: Easing.in(Easing.cubic) });
      opacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible, initialSnap, largeH, mediumH, screenH, translateY, sheetHeight, opacity]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          // Allow upward drag to expand; downward drag to dismiss.
          if (e.translationY < 0) {
            // Dragging up — grow height toward large snap.
            const base = sheetHeight.value;
            const grown = Math.min(largeH, base - e.translationY * 0.9);
            sheetHeight.value = grown;
            translateY.value = 0;
          } else {
            translateY.value = e.translationY;
          }
        })
        .onEnd((e) => {
          const draggedDown = translateY.value;
          const v = e.velocityY;
          // Dismiss if user flicked down or dragged past ~30% of sheet.
          if (v > 700 || draggedDown > sheetHeight.value * 0.3) {
            translateY.value = withTiming(
              sheetHeight.value,
              { duration: 200 },
              () => runOnJS(close)()
            );
            return;
          }
          // If we grew during drag and user released near large snap,
          // stick to large. Otherwise snap back to medium or current.
          if (sheetHeight.value > (mediumH + largeH) / 2) {
            sheetHeight.value = withSpring(largeH, SPRING);
          } else {
            sheetHeight.value = withSpring(mediumH, SPRING);
          }
          translateY.value = withSpring(0, SPRING);
        }),
    [close, largeH, mediumH, sheetHeight, translateY]
  );

  const sheetStyle = useAnimatedStyle(() => ({
    height: sheetHeight.value,
    transform: [{ translateY: translateY.value }]
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    backgroundColor:
      backdrop === "dim" ? "rgba(22,21,20,0.4)" : "transparent"
  }));

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={close}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* Backdrop: tap anywhere above the sheet to dismiss. */}
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>

        {/* Sheet panel */}
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface,
                paddingBottom: Math.max(insets.bottom, mobileTheme.spacing.md)
              },
              sheetStyle,
              containerStyle
            ]}
          >
            {showHandle && (
              <View style={styles.handleWrap} pointerEvents="none">
                <View
                  style={[
                    styles.handle,
                    { backgroundColor: theme.colors.border }
                  ]}
                />
              </View>
            )}
            {/* Content area lives inside a plain View so scrollables
                inside continue to scroll normally. */}
            <View style={{ flex: 1 }}>{children}</View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16
  },
  handleWrap: {
    paddingTop: 8,
    paddingBottom: 6,
    alignItems: "center"
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 999,
    opacity: 0.8
  }
});
