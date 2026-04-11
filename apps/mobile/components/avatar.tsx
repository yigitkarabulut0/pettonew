import { Text, View } from "react-native";
import { Image } from "expo-image";

import { mobileTheme, useTheme } from "@/lib/theme";

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
  const initial = name?.charAt(0)?.toUpperCase() ?? "?";

  return (
    <View style={{ position: "relative", width: dimension, height: dimension }}>
      {uri && uri.length > 0 ? (
        <Image
          source={{ uri }}
          style={{
            width: dimension,
            height: dimension,
            borderRadius: dimension / 2
          }}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View
          style={{
            width: dimension,
            height: dimension,
            borderRadius: dimension / 2,
            backgroundColor: theme.colors.primaryBg,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Text
            style={{
              fontSize,
              fontWeight: "700",
              color: theme.colors.primary,
              fontFamily: "Inter_700Bold"
            }}
          >
            {initial}
          </Text>
        </View>
      )}
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
