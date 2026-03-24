import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { mobileTheme } from "@/lib/theme";

const c = mobileTheme.colors;
const f = mobileTheme.fontFamily;

function TabIcon({
  name,
  focused
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  focused: boolean;
}) {
  return (
    <Ionicons
      name={
        focused
          ? name
          : ((name + "-outline") as React.ComponentProps<
              typeof Ionicons
            >["name"])
      }
      size={24}
      color={focused ? c.primary : c.inactive}
    />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarShowLabel: true,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.inactive,
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: f,
          fontWeight: "500" as const,
          marginTop: 2
        },
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 64 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset + 4,
          backgroundColor: c.surface,
          borderTopColor: c.border,
          borderTopWidth: 1,
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: -2 },
          elevation: 8
        },
        tabBarItemStyle: {
          paddingVertical: 2
        }
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Discover",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="heart" focused={focused} />
          )
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="chatbubble" focused={focused} />
          )
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="compass" focused={focused} />
          )
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="person" focused={focused} />
          )
        }}
      />
    </Tabs>
  );
}
