import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";

import { listMessages, sendMessage } from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function ConversationPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", id, session?.tokens.accessToken],
    queryFn: () => listMessages(session!.tokens.accessToken, id),
    enabled: Boolean(session && id)
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!session || !draft.trim()) return null;
      return sendMessage(session.tokens.accessToken, id, draft.trim());
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  });

  const groupedMessages = useMemo(() => {
    const groups: Array<{
      id: string;
      date: string;
      messages: typeof messages;
    }> = [];
    let currentDate = "";

    for (const msg of messages) {
      const msgDate = new Date(msg.createdAt).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long"
      });
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ id: `date-${msg.id}`, date: msgDate, messages: [] });
      }
      const lastGroup = groups[groups.length - 1];
      if (lastGroup) {
        lastGroup.messages.push(msg);
      }
    }

    return groups;
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: true }),
        100
      );
    }
  }, [messages.length]);

  const renderMessage = (msg: (typeof messages)[0]) => (
    <View
      key={msg.id}
      style={{
        alignSelf: msg.isMine ? "flex-end" : "flex-start",
        maxWidth: "80%",
        marginHorizontal: 14,
        marginBottom: 4
      }}
    >
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 20,
          backgroundColor: msg.isMine
            ? mobileTheme.colors.secondary
            : "#FFFFFF",
          borderTopRightRadius: msg.isMine ? 4 : 20,
          borderTopLeftRadius: msg.isMine ? 20 : 4,
          shadowColor: "#000",
          shadowOpacity: 0.04,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 }
        }}
      >
        <Text
          selectable
          style={{
            color: msg.isMine ? "#FFFFFF" : mobileTheme.colors.ink,
            lineHeight: 21,
            fontSize: 15
          }}
        >
          {msg.body}
        </Text>
      </View>
      <Text
        selectable
        style={{
          fontSize: 11,
          color: mobileTheme.colors.muted,
          marginTop: 4,
          marginHorizontal: 4,
          alignSelf: msg.isMine ? "flex-end" : "flex-start"
        }}
      >
        {new Date(msg.createdAt).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit"
        })}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#F5F0EB" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
          paddingTop: 60,
          backgroundColor: "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: mobileTheme.colors.border
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{ padding: 4 }}
        >
          <Text
            selectable
            style={{
              color: mobileTheme.colors.secondary,
              fontSize: 28,
              fontWeight: "300"
            }}
          >
            ‹
          </Text>
        </Pressable>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            backgroundColor: mobileTheme.colors.surface,
            overflow: "hidden"
          }}
        >
          <Image
            source={
              session?.user.avatarUrl
                ? { uri: session.user.avatarUrl }
                : undefined
            }
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            selectable
            style={{
              fontSize: 17,
              fontWeight: "700",
              color: mobileTheme.colors.ink
            }}
          >
            Conversation
          </Text>
          <Text
            selectable
            style={{ fontSize: 13, color: mobileTheme.colors.muted }}
          >
            Online
          </Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={groupedMessages}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 12 }}
        renderItem={({ item: group }) => (
          <View>
            <View style={{ alignItems: "center", marginVertical: 12 }}>
              <View
                style={{
                  backgroundColor: "rgba(164, 121, 86, 0.12)",
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 6
                }}
              >
                <Text
                  selectable
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: mobileTheme.colors.secondary
                  }}
                >
                  {group.date}
                </Text>
              </View>
            </View>
            {group.messages.map(renderMessage)}
          </View>
        )}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          paddingBottom: 34,
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: mobileTheme.colors.border
        }}
      >
        <TextInput
          placeholder="Type a message..."
          placeholderTextColor={mobileTheme.colors.muted}
          value={draft}
          onChangeText={setDraft}
          multiline
          style={{
            flex: 1,
            borderRadius: 24,
            backgroundColor: "#F5F0EB",
            paddingHorizontal: 18,
            paddingVertical: 12,
            maxHeight: 120,
            fontSize: 15,
            color: mobileTheme.colors.ink
          }}
        />
        <Pressable
          onPress={() => mutation.mutate()}
          disabled={!draft.trim() || mutation.isPending}
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            backgroundColor: draft.trim()
              ? mobileTheme.colors.secondary
              : "#D4C5B9",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 2,
            opacity: mutation.isPending ? 0.5 : 1
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "700" }}>
            ↑
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
