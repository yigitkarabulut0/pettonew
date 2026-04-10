import LottieView from "lottie-react-native";
import { View } from "react-native";

interface Props {
  size?: number;
}

export function LottieLoading({ size = 60 }: Props) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 8 }}>
      <LottieView
        source={require("@/assets/animations/loading.json")}
        style={{ width: size, height: size }}
        autoPlay
        loop
        speed={1.2}
      />
    </View>
  );
}
