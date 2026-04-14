import {
  Compass,
  Heart,
  Home,
  Stethoscope,
  User
} from "lucide-react-native";
import { Tabs } from "expo-router";
import * as Haptics from "expo-haptics";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";

function TabIcon({
  Icon,
  focused
}: {
  Icon: React.ComponentType<{
    size: number;
    color: string;
    fill?: string;
  }>;
  focused: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center" }}>
      <Icon
        size={22}
        color={focused ? theme.colors.primary : theme.colors.muted}
      />
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 16);

  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          Haptics.selectionAsync();
        }
      }}
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
        tabBarShowLabel: true,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: "Inter_600SemiBold"
        },
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 56 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset - 4,
          backgroundColor: theme.colors.white,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          borderLeftWidth: 0,
          borderRightWidth: 0,
          borderBottomWidth: 0,
          shadowColor: "#161514",
          shadowOpacity: 0.04,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -2 },
          elevation: 8
        },
        tabBarItemStyle: { paddingVertical: 0 },
        tabBarIconStyle: { marginTop: 0 }
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t("tabs.home"),
          tabBarIcon: ({ focused }) => <TabIcon Icon={Home} focused={focused} />
        }}
      />
      <Tabs.Screen
        name="match"
        options={{
          title: t("tabs.match"),
          tabBarIcon: ({ focused }) => <TabIcon Icon={Heart} focused={focused} />
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: t("tabs.discover"),
          tabBarIcon: ({ focused }) => <TabIcon Icon={Compass} focused={focused} />
        }}
      />
      <Tabs.Screen
        name="care"
        options={{
          title: t("tabs.care"),
          tabBarIcon: ({ focused }) => <TabIcon Icon={Stethoscope} focused={focused} />
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile"),
          tabBarIcon: ({ focused }) => <TabIcon Icon={User} focused={focused} />
        }}
      />
    </Tabs>
  );
}
