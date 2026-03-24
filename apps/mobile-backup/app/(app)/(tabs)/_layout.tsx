import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mobileTheme } from "@/lib/theme";

function TabIcon({
  glyph,
  focused
}: {
  glyph: string;
  focused: boolean;
}) {
  return (
    <Text
      style={{
        fontSize: 23,
        lineHeight: 24,
        color: focused ? mobileTheme.colors.secondary : "#8F7B6F",
        fontWeight: "700"
      }}
    >
      {glyph}
    </Text>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 12);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarShowLabel: false,
        tabBarActiveTintColor: mobileTheme.colors.secondary,
        tabBarInactiveTintColor: "#8F7B6F",
        tabBarActiveBackgroundColor: "rgba(207, 122, 66, 0.18)",
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 72 + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset + 6,
          backgroundColor: "rgba(255, 250, 245, 0.98)",
          borderTopColor: "rgba(214, 194, 179, 0.78)",
          borderTopWidth: 1,
          borderLeftWidth: 0,
          borderRightWidth: 0,
          borderBottomWidth: 0,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          shadowColor: "#3A241A",
          shadowOpacity: 0.1,
          shadowRadius: 20,
          shadowOffset: {
            width: 0,
            height: -6
          },
          elevation: 16
        },
        tabBarItemStyle: {
          marginHorizontal: 6,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          overflow: "hidden"
        },
        tabBarIconStyle: {
          marginTop: 2
        }
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon glyph="🏠" focused={focused} />
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Matches",
          tabBarIcon: ({ focused }) => <TabIcon glyph="♥" focused={focused} />
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ focused }) => <TabIcon glyph="💬" focused={focused} />
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ focused }) => <TabIcon glyph="🧭" focused={focused} />
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => <TabIcon glyph="👤" focused={focused} />
        }}
      />
    </Tabs>
  );
}
