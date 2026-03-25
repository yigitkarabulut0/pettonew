import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";
import { ChevronLeft, Send } from "lucide-react-native";

import { Avatar } from "@/components/avatar";
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
        maxWidth: "78%",
        marginHorizontal: mobileTheme.spacing.lg,
        marginBottom: mobileTheme.spacing.sm
      }}
    >
      <View
        style={{
          paddingHorizontal: mobileTheme.spacing.lg,
          paddingVertical: mobileTheme.spacing.sm + 4,
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: msg.isMine
            ? mobileTheme.colors.primary
            : mobileTheme.colors.white,
          borderTopRightRadius: msg.isMine
            ? mobileTheme.radius.xs
            : mobileTheme.radius.lg,
          borderTopLeftRadius: msg.isMine
            ? mobileTheme.radius.lg
            : mobileTheme.radius.xs,
          ...mobileTheme.shadow.sm
        }}
      >
        <Text
          selectable
          style={{
            color: msg.isMine
              ? mobileTheme.colors.white
              : mobileTheme.colors.ink,
            lineHeight: mobileTheme.typography.body.lineHeight,
            fontSize: mobileTheme.typography.body.fontSize,
            fontFamily: "Inter_400Regular"
          }}
        >
          {msg.body}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 10,
          color: mobileTheme.colors.muted,
          marginTop: 3,
          marginHorizontal: mobileTheme.spacing.sm,
          alignSelf: msg.isMine ? "flex-end" : "flex-start",
          fontFamily: "Inter_400Regular"
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
      style={{ flex: 1, backgroundColor: mobileTheme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
          paddingHorizontal: mobileTheme.spacing.lg,
          paddingVertical: mobileTheme.spacing.md,
          paddingTop: mobileTheme.spacing["3xl"],
          backgroundColor: mobileTheme.colors.white,
          borderBottomWidth: 1,
          borderBottomColor: mobileTheme.colors.border
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: mobileTheme.colors.background,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <ChevronLeft size={20} color={mobileTheme.colors.ink} />
        </Pressable>
        <Avatar
          uri={session?.user.avatarUrl}
          name={session?.user.firstName}
          size="sm"
        />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: mobileTheme.typography.bodySemiBold.fontSize,
              fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
              color: mobileTheme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            Conversation
          </Text>
          <Text
            style={{
              fontSize: mobileTheme.typography.micro.fontSize,
              color: mobileTheme.colors.likeGreen,
              fontFamily: "Inter_600SemiBold"
            }}
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
        contentContainerStyle={{ paddingVertical: mobileTheme.spacing.md }}
        renderItem={({ item: group }) => (
          <View>
            <View
              style={{
                alignItems: "center",
                marginVertical: mobileTheme.spacing.md
              }}
            >
              <View
                style={{
                  backgroundColor: mobileTheme.colors.secondarySoft,
                  borderRadius: mobileTheme.radius.pill,
                  paddingHorizontal: mobileTheme.spacing.md,
                  paddingVertical: mobileTheme.spacing.xs + 2
                }}
              >
                <Text
                  style={{
                    fontSize: mobileTheme.typography.micro.fontSize,
                    fontWeight: "600",
                    color: mobileTheme.colors.secondary,
                    fontFamily: "Inter_600SemiBold"
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
          gap: mobileTheme.spacing.sm,
          paddingHorizontal: mobileTheme.spacing.lg,
          paddingVertical: mobileTheme.spacing.sm,
          paddingBottom: mobileTheme.spacing["3xl"],
          backgroundColor: mobileTheme.colors.white,
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
            borderRadius: mobileTheme.radius.pill,
            backgroundColor: mobileTheme.colors.background,
            paddingHorizontal: mobileTheme.spacing.lg,
            paddingVertical: mobileTheme.spacing.sm + 4,
            maxHeight: 120,
            fontSize: mobileTheme.typography.body.fontSize,
            color: mobileTheme.colors.ink,
            fontFamily: "Inter_400Regular",
            lineHeight: mobileTheme.typography.body.lineHeight
          }}
        />
        <Pressable
          onPress={() => mutation.mutate()}
          disabled={!draft.trim() || mutation.isPending}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: draft.trim()
              ? mobileTheme.colors.primary
              : mobileTheme.colors.border,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 2,
            opacity: mutation.isPending ? 0.5 : 1
          }}
        >
          <Send
            size={18}
            color={
              draft.trim() ? mobileTheme.colors.white : mobileTheme.colors.muted
            }
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
