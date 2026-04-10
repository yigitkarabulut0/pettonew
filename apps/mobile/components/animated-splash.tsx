import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import LottieView from "lottie-react-native";

const BG = "#F48C28";

interface Props {
  onFinish: () => void;
}

export function AnimatedSplash({ onFinish }: Props) {
  const lottieRef = useRef<LottieView>(null);
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(20)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Start lottie
    lottieRef.current?.play();

    // After lottie plays a bit, show text
    const textTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(textTranslateY, { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
      ]).start();
    }, 1800);

    // Then tagline
    const tagTimer = setTimeout(() => {
      Animated.timing(tagOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, 2200);

    // Exit
    const exitTimer = setTimeout(() => {
      Animated.timing(exitOpacity, { toValue: 0, duration: 350, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => onFinish());
    }, 3200);

    return () => {
      clearTimeout(textTimer);
      clearTimeout(tagTimer);
      clearTimeout(exitTimer);
    };
  }, []);

  return (
    <Animated.View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", opacity: exitOpacity }}>
      <View style={{ width: 180, height: 180 }}>
        <LottieView
          ref={lottieRef}
          source={require("@/assets/animations/paw.json")}
          style={{ width: 180, height: 180 }}
          autoPlay={false}
          loop={false}
          speed={1}
        />
      </View>

      <Animated.Text
        style={{
          marginTop: 16,
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
    </Animated.View>
  );
}
