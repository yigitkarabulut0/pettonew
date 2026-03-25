import {
  Bell,
  Compass,
  Heart,
  Home,
  MessageCircle,
  User
} from "lucide-react-native";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mobileTheme } from "@/lib/theme";

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
  return (
    <View style={{ alignItems: "center" }}>
      <Icon
        size={24}
        color={focused ? mobileTheme.colors.primary : mobileTheme.colors.muted}
      />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 16);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarShowLabel: false,
        tabBarActiveTintColor: mobileTheme.colors.primary,
        tabBarInactiveTintColor: mobileTheme.colors.muted,
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 56 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset - 4,
          backgroundColor: mobileTheme.colors.white,
          borderTopColor: mobileTheme.colors.border,
          borderTopWidth: 1,
          borderLeftWidth: 0,
          borderRightWidth: 0,
          borderBottomWidth: 0,
          shadowColor: "#161514",
          shadowOpacity: 0.04,
          shadowRadius: 12,
          shadowOffset: {
            width: 0,
            height: -2
          },
          elevation: 8
        },
        tabBarItemStyle: {
          paddingVertical: 0
        },
        tabBarIconStyle: {
          marginTop: 0
        }
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon Icon={Home} focused={focused} />
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Compass} focused={focused} />
          )
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Match",
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Heart} focused={focused} />
          )
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={MessageCircle} focused={focused} />
          )
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => <TabIcon Icon={User} focused={focused} />
        }}
      />
    </Tabs>
  );
}
