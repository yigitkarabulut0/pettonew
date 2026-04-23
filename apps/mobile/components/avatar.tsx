import { View } from "react-native";

import { useTheme } from "@/lib/theme";
import { AppImage } from "@/components/app-image";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeMap: Record<AvatarSize, number> = {
  xs: 28,
  sm: 36,
  md: 44,
  lg: 64,
  xl: 80
};

const fontSizeMap: Record<AvatarSize, number> = {
  xs: 10,
  sm: 12,
  md: 15,
  lg: 22,
  xl: 28
};

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: AvatarSize;
  online?: boolean;
}

export function Avatar({
  uri,
  name,
  size = "md",
  online = false
}: AvatarProps) {
  const theme = useTheme();
  const dimension = sizeMap[size];
  const fontSize = fontSizeMap[size];

  return (
    <View style={{ position: "relative", width: dimension, height: dimension }}>
      <AppImage
        uri={uri}
        kind="avatar"
        fallbackLabel={name}
        fallbackLabelSize={fontSize}
        containerStyle={{
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2
        }}
      />
      {online && (
        <View
          style={{
            position: "absolute",
            bottom: size === "xs" ? -1 : 0,
            right: size === "xs" ? -1 : 0,
            width: size === "xs" ? 8 : 12,
            height: size === "xs" ? 8 : 12,
            borderRadius: size === "xs" ? 4 : 6,
            backgroundColor: theme.colors.likeGreen,
            borderWidth: 2,
            borderColor: theme.colors.white
          }}
        />
      )}
    </View>
  );
}
