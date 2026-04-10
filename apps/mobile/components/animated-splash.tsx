import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { Heart } from "lucide-react-native";

const PRIMARY = "#E6694A";
const LETTERS = ["P", "e", "t", "t", "."];

interface AnimatedSplashProps {
  onFinish: () => void;
}

export function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const letterAnims = useRef(LETTERS.map(() => new Animated.Value(0))).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(100),
      // Letters appear fast
      Animated.stagger(120, letterAnims.map((anim) =>
        Animated.spring(anim, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true })
      )),
      // Tagline + heart together
      Animated.parallel([
        Animated.timing(taglineOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(heartScale, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true })
      ]),
      // Brief hold
      Animated.delay(400),
      // Fade out
      Animated.timing(screenOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
    ]).start(() => onFinish());
  }, []);

  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor: PRIMARY,
        alignItems: "center",
        justifyContent: "center",
        opacity: screenOpacity
      }}
    >
      <Animated.View style={{ marginBottom: 16, transform: [{ scale: heartScale }] }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
          <Heart size={28} color="#FFFFFF" fill="#FFFFFF" />
        </View>
      </Animated.View>

      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        {LETTERS.map((letter, i) => (
          <Animated.Text
            key={i}
            style={{
              fontSize: 48,
              fontWeight: "800",
              color: "#FFFFFF",
              fontStyle: "italic",
              opacity: letterAnims[i],
              transform: [{
                translateY: letterAnims[i].interpolate({ inputRange: [0, 1], outputRange: [15, 0] })
              }]
            }}
          >
            {letter}
          </Animated.Text>
        ))}
      </View>

      <Animated.Text
        style={{
          marginTop: 8,
          fontSize: 14,
          color: "rgba(255,255,255,0.6)",
          fontFamily: "Inter_400Regular",
          opacity: taglineOpacity
        }}
      >
        Meaningful matches for pets
      </Animated.Text>
    </Animated.View>
  );
}
