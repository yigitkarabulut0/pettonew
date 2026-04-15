import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  Heart,
  MessageCircle,
  PawPrint,
  Users
} from "lucide-react-native";

import type { NotificationPreferences } from "@petto/contracts";
import { getNotificationPrefs, updateNotificationPrefs } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

// v0.11.0 — Global push-notification opt-outs.
// Each toggle gates server-side SendExpoPush fan-out for that category:
//   - matches: new mutual match + new like on your pet
//   - messages: DM / group / playdate chat messages (per-conversation mute
//     still works on top of this)
//   - playdates: invites, detail changes, reminders, cancellations
//   - groups: group moderation actions, member events
type PrefKey = keyof NotificationPreferences;

export default function NotificationSettingsPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const token = session?.tokens.accessToken ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["notification-prefs", token],
    queryFn: () => getNotificationPrefs(token),
    enabled: Boolean(token)
  });

  // Mirror the server state locally so flipping a switch feels instant —
  // the mutation runs in the background and we reconcile on its success.
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    matches: true,
    messages: true,
    playdates: true,
    groups: true
  });
  useEffect(() => {
    if (data) setPrefs(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: (next: NotificationPreferences) =>
      updateNotificationPrefs(token, next),
    onSuccess: (saved) => {
      queryClient.setQueryData(["notification-prefs", token], saved);
    }
  });

  const toggle = (key: PrefKey) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    mutation.mutate(next);
  };

  const rows: Array<{
    key: PrefKey;
    title: string;
    subtitle: string;
    icon: React.ComponentType<{ size: number; color: string }>;
  }> = [
    {
      key: "matches",
      title: t("notificationSettings.matches.title") as string,
      subtitle: t("notificationSettings.matches.subtitle") as string,
      icon: Heart
    },
    {
      key: "messages",
      title: t("notificationSettings.messages.title") as string,
      subtitle: t("notificationSettings.messages.subtitle") as string,
      icon: MessageCircle
    },
    {
      key: "playdates",
      title: t("notificationSettings.playdates.title") as string,
      subtitle: t("notificationSettings.playdates.subtitle") as string,
      icon: PawPrint
    },
    {
      key: "groups",
      title: t("notificationSettings.groups.title") as string,
      subtitle: t("notificationSettings.groups.subtitle") as string,
      icon: Users
    }
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header — matches the brand glass / pet-card v0.9.x style. */}
      <View
        style={{
          backgroundColor: theme.colors.white,
          paddingTop: insets.top + 12,
          paddingBottom: 14,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          ...mobileTheme.shadow.sm
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.colors.background,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <ChevronLeft size={20} color={theme.colors.ink} />
        </Pressable>
        <Text
          style={{
            flex: 1,
            fontSize: 20,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          {t("notificationSettings.title")}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 40,
          gap: 18
        }}
      >
        <Text
          style={{
            fontSize: 13,
            color: theme.colors.muted,
            fontFamily: "Inter_500Medium",
            lineHeight: 18
          }}
        >
          {t("notificationSettings.subtitle")}
        </Text>

        {isLoading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <View
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              overflow: "hidden",
              ...mobileTheme.shadow.sm
            }}
          >
            {rows.map((row, index) => {
              const active = prefs[row.key];
              return (
                <View
                  key={row.key}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 16,
                    paddingHorizontal: 18,
                    gap: 14,
                    borderTopWidth: index > 0 ? 1 : 0,
                    borderTopColor: theme.colors.border
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: theme.colors.primaryBg,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <row.icon size={18} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        color: theme.colors.ink,
                        fontFamily: "Inter_700Bold"
                      }}
                    >
                      {row.title}
                    </Text>
                    <Text
                      style={{
                        marginTop: 2,
                        fontSize: 12,
                        color: theme.colors.muted,
                        fontFamily: "Inter_500Medium",
                        lineHeight: 16
                      }}
                    >
                      {row.subtitle}
                    </Text>
                  </View>
                  <Switch
                    value={active}
                    onValueChange={() => toggle(row.key)}
                    trackColor={{
                      false: theme.colors.border,
                      true: theme.colors.primary
                    }}
                    thumbColor="#ffffff"
                  />
                </View>
              );
            })}
          </View>
        )}

        <Text
          style={{
            fontSize: 11,
            color: theme.colors.muted,
            fontFamily: "Inter_500Medium",
            textAlign: "center",
            lineHeight: 16,
            marginTop: 4
          }}
        >
          {t("notificationSettings.footnote")}
        </Text>
      </ScrollView>
    </View>
  );
}
