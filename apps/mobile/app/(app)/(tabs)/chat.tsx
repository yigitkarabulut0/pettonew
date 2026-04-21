import { useQuery } from "@tanstack/react-query";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { ScreenShell } from "@/components/screen-shell";
import { listConversations } from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function ChatPage() {
  const session = useSessionStore((state) => state.session);
  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", session?.tokens.accessToken],
    queryFn: () => listConversations(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  return (
    <ScreenShell
      eyebrow="Chat"
      title="Real-time conversations, without the noise."
      subtitle="Keep the coordination light, respectful, and focused on the pets."
    >
      <View style={{ minHeight: 520 }}>
        <FlashList
          data={conversations}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(app)/conversation/${item.id}`)}
              style={{
                padding: 16,
                borderRadius: mobileTheme.radius.md,
                backgroundColor: mobileTheme.colors.surface,
                marginBottom: 12,
                gap: 6
              }}
            >
              <Text selectable style={{ fontSize: 21, fontWeight: "700", color: mobileTheme.colors.ink }}>
                {item.title}
              </Text>
              <Text selectable style={{ color: mobileTheme.colors.secondary, fontWeight: "600" }}>
                {item.subtitle}
              </Text>
              <Text selectable style={{ color: mobileTheme.colors.muted }}>
                {item.messages.at(-1)?.body ?? "Start the conversation."}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </ScreenShell>
  );
}
