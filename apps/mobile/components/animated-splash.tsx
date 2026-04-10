import { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, View } from "react-native";
import LottieView from "lottie-react-native";

const { height: SH } = Dimensions.get("window");
const BG = "#F48C28";

interface Props {
  onFinish: () => void;
}

export function AnimatedSplash({ onFinish }: Props) {
  const lottieRef = useRef<LottieView>(null);
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    lottieRef.current?.play();

    const nameTimer = setTimeout(() => {
      Animated.timing(nameOpacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, 1600);

    const exitTimer = setTimeout(() => {
      Animated.timing(exitOpacity, { toValue: 0, duration: 350, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => onFinish());
    }, 2800);

    return () => { clearTimeout(nameTimer); clearTimeout(exitTimer); };
  }, []);

  return (
    <Animated.View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", opacity: exitOpacity }}>
      <View style={{ width: 320, height: 320, marginTop: -40 }}>
        <LottieView
          ref={lottieRef}
          source={require("@/assets/animations/paw.json")}
          style={{ width: 320, height: 320 }}
          autoPlay={false}
          loop={false}
          speed={1}
        />
      </View>

      <Animated.Text
        style={{
          position: "absolute",
          bottom: SH * 0.08,
          fontSize: 22,
          fontWeight: "700",
          color: "rgba(255,255,255,0.7)",
          fontFamily: "Inter_700Bold",
          letterSpacing: 1,
          opacity: nameOpacity,
        }}
      >
        Pett.
      </Animated.Text>
    </Animated.View>
  );
}
