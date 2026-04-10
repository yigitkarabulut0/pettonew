import { useEffect, useRef } from "react";
import { Animated, View, type ViewStyle } from "react-native";

import { mobileTheme, useTheme } from "@/lib/theme";

function useShimmer() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1000, useNativeDriver: true })
      ])
    ).start();
  }, [anim]);
  return anim;
}

export function SkeletonLine({ width = "100%", height = 14, style }: { width?: number | string; height?: number; style?: ViewStyle }) {
  const theme = useTheme();
  const shimmer = useShimmer();
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: mobileTheme.radius.sm,
          backgroundColor: theme.colors.border,
          opacity: shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] })
        },
        style
      ]}
    />
  );
}

export function SkeletonCircle({ size = 48, style }: { size?: number; style?: ViewStyle }) {
  const theme = useTheme();
  const shimmer = useShimmer();
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.colors.border,
          opacity: shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] })
        },
        style
      ]}
    />
  );
}

export function SkeletonCard({ style }: { style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          padding: mobileTheme.spacing.xl,
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: theme.colors.white,
          gap: mobileTheme.spacing.md,
          ...mobileTheme.shadow.sm
        },
        style
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: mobileTheme.spacing.md }}>
        <SkeletonCircle size={40} />
        <View style={{ flex: 1, gap: mobileTheme.spacing.sm }}>
          <SkeletonLine width="60%" />
          <SkeletonLine width="40%" height={10} />
        </View>
      </View>
      <SkeletonLine />
      <SkeletonLine width="80%" />
    </View>
  );
}
