import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { Heart } from "lucide-react-native";

import { mobileTheme, useTheme } from "@/lib/theme";

interface AnimatedLogoProps {
  size?: "sm" | "lg";
}

export function AnimatedLogo({ size = "lg" }: AnimatedLogoProps) {
  const theme = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const heartBeat = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true
      })
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(heartBeat, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true
          }),
          Animated.timing(heartBeat, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true
          })
        ])
      ).start();
    });
  }, [scaleAnim, opacityAnim, heartBeat]);

  const isLarge = size === "lg";
  const containerSize = isLarge ? 100 : 56;
  const iconSize = isLarge ? 48 : 28;

  return (
    <Animated.View
      style={{
        opacity: opacityAnim,
        transform: [{ scale: scaleAnim }],
        alignItems: "center",
        gap: mobileTheme.spacing.md
      }}
    >
      <Animated.View
        style={{
          width: containerSize,
          height: containerSize,
          borderRadius: containerSize / 2,
          backgroundColor: theme.colors.primaryBg,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: heartBeat }]
        }}
      >
        <Heart
          size={iconSize}
          color={theme.colors.primary}
          fill={theme.colors.primary}
        />
      </Animated.View>
      {isLarge && (
        <Animated.Text
          style={{
            fontSize: 32,
            fontWeight: "800",
            color: theme.colors.primary,
            fontFamily: "Inter_700Bold",
            letterSpacing: -1
          }}
        >
          Fetcht
        </Animated.Text>
      )}
    </Animated.View>
  );
}
