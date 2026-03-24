import { useQuery } from "@tanstack/react-query";
import { FlashList } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenShell } from "@/components/screen-shell";
import { listConversations } from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const styles = StyleSheet.create({
  listContainer: {
    minHeight: 520
  },
  card: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: mobileTheme.colors.surface,
    marginBottom: 12,
    gap: 6
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: mobileTheme.colors.ink,
    fontFamily: mobileTheme.fontFamily
  },
  subtitle: {
    color: mobileTheme.colors.secondary,
    fontWeight: "600",
    fontFamily: mobileTheme.fontFamily
  },
  body: {
    color: mobileTheme.colors.muted,
    fontFamily: mobileTheme.fontFamily
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12
  },
  emptyIcon: {
    color: mobileTheme.colors.muted
  },
  emptyText: {
    color: mobileTheme.colors.muted,
    fontFamily: mobileTheme.fontFamily
  }
});

export default function ChatPage() {
  const session = useSessionStore((state) => state.session);
  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", session?.tokens.accessToken],
    queryFn: () => listConversations(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  return (
    <ScreenShell
      eyebrow="Messages"
      title="Your conversations"
      subtitle="Keep it light and focused on the pets."
    >
      <View style={styles.listContainer}>
        <FlashList
          data={conversations}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="chatbubble-outline"
                size={48}
                style={styles.emptyIcon}
              />
              <Text style={styles.emptyText}>No conversations yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(app)/conversation/${item.id}`)}
              style={styles.card}
            >
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
              <Text style={styles.body}>
                {item.messages.at(-1)?.body ?? "Start the conversation."}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </ScreenShell>
  );
}
