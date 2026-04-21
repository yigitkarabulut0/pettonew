// Shelter inbox. Live polling at 5s with unread badges. Tap → full chat.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Building2, MessageSquare } from "lucide-react-native";

import { listShelterConversations } from "@/lib/api";
import { theme } from "@/lib/theme";

const POLL_MS = 5000;

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

export default function ChatsScreen() {
  const router = useRouter();

  const { data: conversations = [], isRefetching, refetch } = useQuery({
    queryKey: ["shelter-conversations"],
    queryFn: listShelterConversations,
    refetchInterval: POLL_MS
  });

  const sorted = useMemo(
    () =>
      [...conversations].sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      ),
    [conversations]
  );

  const totalUnread = conversations.reduce((n, c) => n + (c.unreadCount ?? 0), 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <View
        style={{
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <View>
          <Text style={{ fontSize: 20, fontWeight: "700", color: theme.colors.ink }}>
            Chats
          </Text>
          <Text style={{ marginTop: 2, fontSize: 11, color: theme.colors.muted }}>
            {totalUnread > 0
              ? `${totalUnread} unread message${totalUnread === 1 ? "" : "s"}`
              : "All caught up"}
          </Text>
        </View>
        {totalUnread > 0 ? (
          <View
            style={{
              minWidth: 22,
              height: 22,
              borderRadius: 11,
              paddingHorizontal: 6,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.primary
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "700" }}>
              {totalUnread}
            </Text>
          </View>
        ) : null}
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.sm, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={theme.colors.primary}
          />
        }
        renderItem={({ item }) => {
          const preview = item.messages?.[0]?.body ?? "Tap to start the conversation";
          const unread = item.unreadCount ?? 0;
          const avatar = item.matchedOwnerAvatarUrl;
          return (
            <Pressable
              onPress={() =>
                router.push(
                  `/(app)/conversation/${item.id}?title=${encodeURIComponent(item.title)}` as any
                )
              }
              style={({ pressed }) => ({
                flexDirection: "row",
                gap: theme.spacing.md,
                padding: theme.spacing.md,
                borderRadius: theme.radius.lg,
                backgroundColor: unread > 0 ? theme.colors.primaryBg : theme.colors.surface,
                borderWidth: 1,
                borderColor: unread > 0 ? theme.colors.primary : theme.colors.border,
                opacity: pressed ? 0.85 : 1,
                alignItems: "center"
              })}
            >
              {avatar ? (
                <Image
                  source={{ uri: avatar }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: theme.colors.border
                  }}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: theme.colors.primaryBg,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Building2 size={20} color={theme.colors.primary} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 14,
                      fontWeight: unread > 0 ? "700" : "600",
                      color: theme.colors.ink
                    }}
                    numberOfLines={1}
                  >
                    {item.title || "Applicant"}
                  </Text>
                  <Text style={{ fontSize: 10, color: theme.colors.muted }}>
                    {relativeTime(item.lastMessageAt)}
                  </Text>
                </View>
                {item.subtitle ? (
                  <Text
                    style={{
                      marginTop: 1,
                      fontSize: 10,
                      color: theme.colors.primary,
                      fontWeight: "600"
                    }}
                    numberOfLines={1}
                  >
                    {item.subtitle}
                  </Text>
                ) : null}
                <View
                  style={{
                    marginTop: 3,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8
                  }}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 12,
                      color: unread > 0 ? theme.colors.ink : theme.colors.muted,
                      fontWeight: unread > 0 ? "600" : "400"
                    }}
                    numberOfLines={1}
                  >
                    {preview}
                  </Text>
                  {unread > 0 ? (
                    <View
                      style={{
                        minWidth: 18,
                        height: 18,
                        borderRadius: 9,
                        paddingHorizontal: 5,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: theme.colors.primary
                      }}
                    >
                      <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "700" }}>
                        {unread}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 8 }}>
            <MessageSquare size={32} color={theme.colors.muted} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.ink }}>
              No chats yet
            </Text>
            <Text style={{ fontSize: 11, color: theme.colors.muted, textAlign: "center" }}>
              Approve an adoption application to open a chat with the applicant.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
