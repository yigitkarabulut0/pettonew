import { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, Image, View } from "react-native";

const { width: SW, height: SH } = Dimensions.get("window");
const BG = "#F48C28";

interface Props {
  onFinish: () => void;
}

export function AnimatedSplash({ onFinish }: Props) {
  // Logo animations
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoRotate = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  // Text animations
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(30)).current;

  // Tagline
  const tagOpacity = useRef(new Animated.Value(0)).current;

  // Ring pulse
  const ringScale = useRef(new Animated.Value(0.8)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;

  // Dot accents (4 small dots around logo)
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const dot4 = useRef(new Animated.Value(0)).current;

  // Exit
  const exitScale = useRef(new Animated.Value(1)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      // Phase 1: Ring pulse appears (subtle background ring)
      Animated.parallel([
        Animated.timing(ringOpacity, { toValue: 0.15, duration: 400, useNativeDriver: true }),
        Animated.timing(ringScale, { toValue: 1.4, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),

      // Phase 2: Logo drops in with bounce + slight rotation
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 5, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(logoRotate, { toValue: -0.05, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.spring(logoRotate, { toValue: 0, tension: 120, friction: 8, useNativeDriver: true }),
        ]),
      ]),

      // Phase 3: 4 dots burst out from logo (staggered)
      Animated.stagger(60, [
        Animated.spring(dot1, { toValue: 1, tension: 100, friction: 6, useNativeDriver: true }),
        Animated.spring(dot2, { toValue: 1, tension: 100, friction: 6, useNativeDriver: true }),
        Animated.spring(dot3, { toValue: 1, tension: 100, friction: 6, useNativeDriver: true }),
        Animated.spring(dot4, { toValue: 1, tension: 100, friction: 6, useNativeDriver: true }),
      ]),

      // Phase 4: "Pett." text slides up and fades in
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(textTranslateY, { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
      ]),

      // Phase 5: Tagline fades in
      Animated.timing(tagOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),

      // Hold
      Animated.delay(500),

      // Phase 6: Everything scales up slightly and fades out
      Animated.parallel([
        Animated.timing(exitScale, { toValue: 1.08, duration: 350, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(exitOpacity, { toValue: 0, duration: 350, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start(() => onFinish());
  }, []);

  const spin = logoRotate.interpolate({ inputRange: [-1, 1], outputRange: ["-30deg", "30deg"] });

  const dotStyle = (anim: Animated.Value, x: number, y: number) => ({
    position: "absolute" as const,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.5)",
    transform: [
      { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) },
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, y] }) },
      { scale: anim },
    ],
    opacity: anim,
  });

  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor: BG,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale: exitScale }],
        opacity: exitOpacity,
      }}
    >
      {/* Pulse ring behind logo */}
      <Animated.View
        style={{
          position: "absolute",
          width: 160,
          height: 160,
          borderRadius: 80,
          borderWidth: 2,
          borderColor: "rgba(255,255,255,0.3)",
          opacity: ringOpacity,
          transform: [{ scale: ringScale }],
        }}
      />

      {/* Logo container */}
      <View style={{ alignItems: "center" }}>
        {/* Burst dots */}
        <View style={{ position: "absolute", width: 120, height: 120, alignItems: "center", justifyContent: "center" }}>
          <Animated.View style={dotStyle(dot1, -50, -40)} />
          <Animated.View style={dotStyle(dot2, 45, -35)} />
          <Animated.View style={dotStyle(dot3, -40, 45)} />
          <Animated.View style={dotStyle(dot4, 50, 40)} />
        </View>

        {/* App logo image */}
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [{ scale: logoScale }, { rotate: spin }],
          }}
        >
          <View
            style={{
              width: 100,
              height: 100,
              borderRadius: 28,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.15,
              shadowRadius: 20,
            }}
          >
            <Image
              source={require("@/assets/images/icon.png")}
              style={{ width: 80, height: 80, borderRadius: 20 }}
              resizeMode="contain"
            />
          </View>
        </Animated.View>

        {/* "Pett." text */}
        <Animated.Text
          style={{
            marginTop: 24,
            fontSize: 38,
            fontWeight: "800",
            color: "#FFFFFF",
            fontFamily: "Inter_700Bold",
            letterSpacing: -0.5,
            opacity: textOpacity,
            transform: [{ translateY: textTranslateY }],
          }}
        >
          Pett.
        </Animated.Text>

        {/* Tagline */}
        <Animated.Text
          style={{
            marginTop: 6,
            fontSize: 13,
            color: "rgba(255,255,255,0.55)",
            fontFamily: "Inter_400Regular",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            opacity: tagOpacity,
          }}
        >
          Your pet companion
        </Animated.Text>
      </View>
    </Animated.View>
  );
}
