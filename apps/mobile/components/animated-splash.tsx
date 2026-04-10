import { useEffect, useRef } from "react";
import { Animated, Dimensions, Text, View } from "react-native";
import { Heart } from "lucide-react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const PRIMARY = "#E6694A";

const LETTERS = ["P", "e", "t", "t", "o"];

interface AnimatedSplashProps {
  onFinish: () => void;
}

export function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const letterAnims = useRef(LETTERS.map(() => new Animated.Value(0))).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const screenScale = useRef(new Animated.Value(1)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Phase 1: Letters appear one by one (typewriter effect)
    const letterSequence = letterAnims.map((anim, index) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 250,
        delay: index * 180,
        useNativeDriver: true
      })
    );

    // Phase 2: Tagline fades in
    const taglineFade = Animated.timing(taglineOpacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true
    });

    // Phase 3: Heart pulse
    const heartAppear = Animated.parallel([
      Animated.spring(heartScale, {
        toValue: 1,
        tension: 60,
        friction: 6,
        useNativeDriver: true
      }),
      Animated.timing(heartOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true
      })
    ]);

    // Phase 4: Exit animation
    const exitAnim = Animated.parallel([
      Animated.timing(screenScale, {
        toValue: 1.15,
        duration: 400,
        useNativeDriver: true
      }),
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true
      })
    ]);

    // Run sequence
    Animated.sequence([
      // Small initial delay
      Animated.delay(200),
      // Letters type in
      Animated.stagger(180, letterSequence),
      // Brief pause
      Animated.delay(100),
      // Tagline appears
      taglineFade,
      // Brief pause
      Animated.delay(200),
      // Heart pulses in
      heartAppear,
      // Hold for a moment
      Animated.delay(500),
      // Exit
      exitAnim
    ]).start(() => {
      onFinish();
    });
  }, []);

  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor: PRIMARY,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale: screenScale }],
        opacity: screenOpacity
      }}
    >
      {/* Heart icon above text */}
      <Animated.View
        style={{
          marginBottom: 20,
          opacity: heartOpacity,
          transform: [{ scale: heartScale }]
        }}
      >
        <View
          style={{
            width: 70,
            height: 70,
            borderRadius: 35,
            backgroundColor: "rgba(255,255,255,0.2)",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Heart size={36} color="#FFFFFF" fill="#FFFFFF" />
        </View>
      </Animated.View>

      {/* "Petto" text - letter by letter */}
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        {LETTERS.map((letter, index) => (
          <Animated.Text
            key={index}
            style={{
              fontSize: 52,
              fontWeight: "800",
              color: "#FFFFFF",
              fontFamily: "Inter_700Bold",
              fontStyle: "italic",
              letterSpacing: -1,
              opacity: letterAnims[index],
              transform: [
                {
                  translateY: letterAnims[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0]
                  })
                },
                {
                  scale: letterAnims[index].interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.5, 1.1, 1]
                  })
                }
              ]
            }}
          >
            {letter}
          </Animated.Text>
        ))}
      </View>

      {/* Tagline */}
      <Animated.Text
        style={{
          marginTop: 12,
          fontSize: 15,
          color: "rgba(255,255,255,0.7)",
          fontFamily: "Inter_400Regular",
          letterSpacing: 0.5,
          opacity: taglineOpacity
        }}
      >
        Meaningful matches for pets
      </Animated.Text>
    </Animated.View>
  );
}
