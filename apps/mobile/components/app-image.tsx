// Branded wrapper around expo-image that gives every surface a consistent
// cache policy, a short crossfade, and — crucially — a branded placeholder
// that renders while the bytes are in-flight AND when the source URL fails
// to load (legacy HEIC, deleted R2 object, offline cold-start, etc.).
//
// Before this component, Fetcht rendered a blank rectangle whenever an image
// failed, which is what made partial R2 failures feel like the whole feed
// was broken. The placeholder now makes failure look intentional.

import { useMemo, useState } from "react";
import type { ImageProps, ImageStyle } from "expo-image";
import { Image } from "expo-image";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Building2,
  MapPin,
  PawPrint,
  User as UserIcon,
  type LucideIcon
} from "lucide-react-native";

import { useTheme } from "@/lib/theme";

export type AppImageKind = "pet" | "avatar" | "shelter" | "venue" | "photo";

export type AppImageProps = Omit<ImageProps, "source" | "placeholder"> & {
  uri?: string | null;
  kind?: AppImageKind;
  /** Used for avatar initial fallback; ignored for non-avatar kinds. */
  fallbackLabel?: string;
  /** Avatar letter size; defaults to 18. Pass to scale with container. */
  fallbackLabelSize?: number;
  /** Icon size inside the branded placeholder; defaults to 28 (pet/photo/etc). */
  fallbackIconSize?: number;
  style?: StyleProp<ImageStyle>;
  /** Rounded containers (avatars) should pass the same radius here. */
  containerStyle?: StyleProp<ViewStyle>;
};

const ICONS: Record<Exclude<AppImageKind, "avatar">, LucideIcon> = {
  pet: PawPrint,
  shelter: Building2,
  venue: MapPin,
  photo: PawPrint
};

export function AppImage({
  uri,
  kind = "photo",
  fallbackLabel,
  fallbackLabelSize = 18,
  fallbackIconSize = 28,
  style,
  containerStyle,
  contentFit = "cover",
  transition = 220,
  cachePolicy = "memory-disk",
  ...rest
}: AppImageProps) {
  const { colors } = useTheme();
  const [errored, setErrored] = useState(false);

  const showPlaceholder = !uri || errored;

  const placeholder = useMemo(() => {
    if (kind === "avatar") {
      const letter = (fallbackLabel ?? "?").trim().charAt(0).toUpperCase() || "?";
      return (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.center,
            { backgroundColor: colors.primarySoft }
          ]}
        >
          {fallbackLabel ? (
            <Text
              style={{
                fontSize: fallbackLabelSize,
                fontWeight: "700",
                color: colors.primary,
                fontFamily: "Inter_700Bold"
              }}
            >
              {letter}
            </Text>
          ) : (
            <UserIcon
              size={Math.max(12, fallbackLabelSize)}
              color={colors.primary}
              strokeWidth={2}
            />
          )}
        </View>
      );
    }

    const Icon = ICONS[kind];
    return (
      <LinearGradient
        colors={[colors.primary, colors.primaryLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, styles.center]}
      >
        <Icon size={fallbackIconSize} color="#FFFFFF" strokeWidth={2} />
      </LinearGradient>
    );
  }, [
    kind,
    fallbackLabel,
    fallbackLabelSize,
    fallbackIconSize,
    colors.primary,
    colors.primaryLight,
    colors.primarySoft
  ]);

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {showPlaceholder ? placeholder : null}
      {uri ? (
        <Image
          {...rest}
          source={{ uri }}
          contentFit={contentFit}
          transition={transition}
          cachePolicy={cachePolicy}
          onError={() => setErrored(true)}
          onLoad={() => {
            if (errored) setErrored(false);
          }}
          style={[StyleSheet.absoluteFill, style]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: "hidden",
    backgroundColor: "transparent"
  },
  center: {
    alignItems: "center",
    justifyContent: "center"
  },
});
