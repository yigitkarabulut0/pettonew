import { useEffect, useRef, useState } from "react";
import { Animated, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import NetInfo from "@react-native-community/netinfo";
import { WifiOff } from "lucide-react-native";

import { mobileTheme } from "@/lib/theme";

const BANNER_CONTENT_HEIGHT = 28;

export function NetworkBanner() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(false);
  const bannerFullHeight = insets.top + mobileTheme.spacing.xs + BANNER_CONTENT_HEIGHT + mobileTheme.spacing.sm;
  const heightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(offline);
      Animated.spring(heightAnim, {
        toValue: offline ? bannerFullHeight : 0,
        useNativeDriver: false,
        tension: 80,
        friction: 12
      }).start();
    });
    return () => unsubscribe();
  }, [heightAnim, bannerFullHeight]);

  return (
    <Animated.View
      style={{
        height: heightAnim,
        overflow: "hidden",
        backgroundColor: mobileTheme.colors.danger
      }}
    >
      {isOffline && (
        <Animated.View
          style={{
            paddingTop: insets.top + mobileTheme.spacing.xs,
            paddingBottom: mobileTheme.spacing.sm,
            paddingHorizontal: mobileTheme.spacing.xl,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: mobileTheme.spacing.sm
          }}
        >
          <WifiOff size={14} color="#FFFFFF" />
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: mobileTheme.typography.caption.fontSize,
              fontFamily: "Inter_600SemiBold",
              fontWeight: "600"
            }}
          >
            {t("network.noConnection")}
          </Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}
