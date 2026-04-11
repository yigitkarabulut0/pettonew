import { useQuery } from "@tanstack/react-query";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { Image } from "expo-image";
import { LottieLoading } from "@/components/lottie-loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, MessageCircle, Search } from "lucide-react-native";

import { listConversations } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return `${Math.floor(diffDay / 7)}w ago`;
}

export default function ConversationsPage() {
  const theme = useTheme();
  const session = useSessionStore((state) => state.session);
  const insets = useSafeAreaInsets();
  const { data: conversations = [], isLoading, refetch: refetchConversations, isRefetching: conversationsRefetching } = useQuery({
    queryKey: ["conversations", session?.tokens.accessToken],
    queryFn: () => listConversations(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.md,
          paddingHorizontal: mobileTheme.spacing.xl
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
            ...mobileTheme.shadow.sm,
            opacity: pressed ? 0.85 : 1
          })}
        >
          <ArrowLeft size={20} color={theme.colors.ink} />
        </Pressable>
        <Text
          style={{
            flex: 1,
            fontSize: mobileTheme.typography.heading.fontSize,
            fontWeight: mobileTheme.typography.heading.fontWeight,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          Messages
        </Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 }}>
          <LottieLoading size={70} />
        </View>
      ) : (
      <View
        style={{
          flex: 1,
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingBottom: insets.bottom + 20
        }}
      >
        <FlashList
          data={conversations}
          estimatedItemSize={90}
          refreshControl={
            <RefreshControl
              refreshing={conversationsRefetching}
              onRefresh={refetchConversations}
              tintColor={theme.colors.primary}
            />
          }
          contentContainerStyle={{ gap: mobileTheme.spacing.sm }}
          renderItem={({ item }) => (
            <ConversationItem
              conversation={item}
              onPress={() => router.push(`/(app)/conversation/${item.id}`)}
            />
          )}
          ListEmptyComponent={<EmptyChatState />}
        />
      </View>
      )}
    </View>
  );
}

function ConversationItem({
  conversation,
  onPress
}: {
  conversation: {
    id: string;
    title: string;
    subtitle: string;
    unreadCount: number;
    lastMessageAt: string;
    messages: Array<{ body: string }>;
    matchPetPairs: Array<{
      myPetId: string;
      myPetName: string;
      myPetPhotoUrl?: string;
      matchedPetId: string;
      matchedPetName: string;
      matchedPetPhotoUrl?: string;
    }>;
  };
  onPress: () => void;
}) {
  const theme = useTheme();
  const lastMessage =
    conversation.messages.length > 0
      ? (conversation.messages[conversation.messages.length - 1]?.body ?? "")
      : "Start the conversation.";

  const firstPair = conversation.matchPetPairs[0];
  const petPhoto = firstPair?.matchedPetPhotoUrl;
  const ownerName = conversation.subtitle || conversation.title;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: mobileTheme.spacing.md,
        padding: mobileTheme.spacing.lg,
        borderRadius: mobileTheme.radius.lg,
        backgroundColor: theme.colors.white,
        alignItems: "center",
        ...mobileTheme.shadow.sm,
        opacity: pressed ? 0.85 : 1
      })}
    >
      <View style={{ position: "relative" }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: theme.colors.secondarySoft,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {petPhoto ? (
            <Image
              source={{ uri: petPhoto }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <MessageCircle size={24} color={theme.colors.secondary} />
          )}
        </View>
        {conversation.unreadCount > 0 && (
          <View
            style={{
              position: "absolute",
              bottom: -2,
              right: -2,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: theme.colors.primary,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 4,
              borderWidth: 2,
              borderColor: theme.colors.white
            }}
          >
            <Text
              style={{
                fontSize: 9,
                fontWeight: "700",
                color: theme.colors.white,
                fontFamily: "Inter_700Bold"
              }}
            >
              {conversation.unreadCount > 99
                ? "99"
                : String(conversation.unreadCount)}
            </Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: mobileTheme.typography.bodySemiBold.fontSize,
            fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          {ownerName}
        </Text>
        {conversation.subtitle ? (
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.muted,
              fontSize: mobileTheme.typography.micro.fontSize,
              fontFamily: "Inter_500Medium"
            }}
          >
            {conversation.subtitle}
          </Text>
        ) : null}
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.muted,
            fontSize: mobileTheme.typography.caption.fontSize,
            fontFamily: "Inter_400Regular"
          }}
        >
          {lastMessage}
        </Text>
      </View>

      <Text
        style={{
          fontSize: mobileTheme.typography.micro.fontSize,
          fontFamily: "Inter_400Regular",
          color: theme.colors.muted,
          alignSelf: "flex-start",
          marginTop: mobileTheme.spacing.xs
        }}
      >
        {formatRelativeTime(conversation.lastMessageAt)}
      </Text>
    </Pressable>
  );
}

function EmptyChatState() {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: mobileTheme.spacing["4xl"],
        gap: mobileTheme.spacing.md
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: theme.colors.primaryBg,
          justifyContent: "center",
          alignItems: "center"
        }}
      >
        <MessageCircle size={28} color={theme.colors.primary} />
      </View>
      <Text
        style={{
          fontSize: mobileTheme.typography.subheading.fontSize,
          fontWeight: mobileTheme.typography.subheading.fontWeight,
          color: theme.colors.ink,
          fontFamily: "Inter_600SemiBold"
        }}
      >
        No conversations yet
      </Text>
      <Text
        style={{
          color: theme.colors.muted,
          textAlign: "center",
          fontSize: mobileTheme.typography.body.fontSize,
          fontFamily: "Inter_400Regular",
          maxWidth: 260
        }}
      >
        Match with pets and start chatting with their owners.
      </Text>
    </View>
  );
}
