// Thin overlay that sits on top of a composer/form while `uploadMedia` runs.
// Shows a radial progress ring + label, styled with the brand primary so the
// feedback feels native to Fetcht instead of a generic ActivityIndicator.
//
// Caller pattern:
//   <UploadProgressOverlay visible={uploading} progress={ratio} label="…" />

import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useTheme } from "@/lib/theme";

type Props = {
  visible: boolean;
  /** 0..1. Optional — undefined falls back to an indeterminate spinner. */
  progress?: number;
  label?: string;
};

const SIZE = 72;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function UploadProgressOverlay({ visible, progress, label }: Props) {
  const { colors } = useTheme();
  const spin = useRef(new Animated.Value(0)).current;
  const dash = useRef(new Animated.Value(CIRCUMFERENCE)).current;

  useEffect(() => {
    if (progress === undefined) {
      const loop = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true
        })
      );
      loop.start();
      return () => loop.stop();
    }
    Animated.timing(dash, {
      toValue: CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, progress))),
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false
    }).start();
  }, [progress, spin, dash]);

  if (!visible) return null;

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"]
  });
  const indeterminateDash =
    progress === undefined ? CIRCUMFERENCE * 0.25 : undefined;

  return (
    <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="auto">
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Animated.View
          style={[
            styles.ring,
            progress === undefined ? { transform: [{ rotate }] } : null
          ]}
        >
          <Svg width={SIZE} height={SIZE}>
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={colors.primarySoft}
              strokeWidth={STROKE}
              fill="none"
            />
            <AnimatedCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={colors.primary}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={
                indeterminateDash !== undefined ? indeterminateDash : dash
              }
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </Svg>
        </Animated.View>
        {progress !== undefined ? (
          <Text style={[styles.percent, { color: colors.ink }]}>
            {Math.round(progress * 100)}%
          </Text>
        ) : null}
        <Text style={[styles.label, { color: colors.muted }]} numberOfLines={1}>
          {label ?? "Yükleniyor…"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: "rgba(22,21,20,0.4)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999
  },
  card: {
    width: 168,
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderRadius: 20,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6
  },
  ring: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center"
  },
  percent: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4
  },
  label: {
    fontSize: 13,
    fontWeight: "500"
  }
});
