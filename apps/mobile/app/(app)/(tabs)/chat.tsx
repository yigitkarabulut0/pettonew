import { useQuery } from "@tanstack/react-query";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, MessageCircle } from "lucide-react-native";

import { listConversations } from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function ChatPage() {
  const session = useSessionStore((state) => state.session);
  const insets = useSafeAreaInsets();
  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", session?.tokens.accessToken],
    queryFn: () => listConversations(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  return (
    <View style={{ flex: 1, backgroundColor: mobileTheme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.md,
          paddingHorizontal: mobileTheme.spacing.xl
        }}
      >
        <Text
          style={{
            fontSize: mobileTheme.typography.display.fontSize,
            fontWeight: mobileTheme.typography.display.fontWeight,
            color: mobileTheme.colors.ink,
            fontFamily: "Inter_800ExtraBold"
          }}
        >
          Messages
        </Text>
      </View>

      <View
        style={{
          flex: 1,
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingBottom: 120
        }}
      >
        <FlashList
          data={conversations}
          contentContainerStyle={{ gap: mobileTheme.spacing.sm }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(app)/conversation/${item.id}`)}
              style={{
                flexDirection: "row",
                gap: mobileTheme.spacing.md,
                padding: mobileTheme.spacing.lg,
                borderRadius: mobileTheme.radius.lg,
                backgroundColor: mobileTheme.colors.white,
                alignItems: "center",
                ...mobileTheme.shadow.sm
              }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: mobileTheme.colors.secondarySoft,
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                <MessageCircle size={24} color={mobileTheme.colors.secondary} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                    fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                    color: mobileTheme.colors.ink,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      color: mobileTheme.colors.muted,
                      fontSize: mobileTheme.typography.micro.fontSize,
                      fontFamily: "Inter_500Medium"
                    }}
                  >
                    {item.subtitle}
                  </Text>
                ) : null}
                <Text
                  numberOfLines={1}
                  style={{
                    color: mobileTheme.colors.muted,
                    fontSize: mobileTheme.typography.caption.fontSize,
                    fontFamily: "Inter_400Regular"
                  }}
                >
                  {item.messages.at(-1)?.body ?? "Start the conversation."}
                </Text>
              </View>
              <ChevronRight size={16} color={mobileTheme.colors.muted} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: mobileTheme.spacing["4xl"],
                gap: mobileTheme.spacing.md
              }}
            >
              <MessageCircle size={40} color={mobileTheme.colors.muted} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.subheading.fontSize,
                  fontWeight: mobileTheme.typography.subheading.fontWeight,
                  color: mobileTheme.colors.ink,
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                No conversations yet
              </Text>
              <Text
                style={{
                  color: mobileTheme.colors.muted,
                  textAlign: "center",
                  fontSize: mobileTheme.typography.body.fontSize,
                  fontFamily: "Inter_400Regular"
                }}
              >
                Match with pets and start chatting with their owners.
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
}
