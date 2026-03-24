import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { listMessages, sendMessage } from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: mobileTheme.colors.canvas
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 60,
    backgroundColor: mobileTheme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: mobileTheme.colors.border
  },
  backButton: {
    padding: 4
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: mobileTheme.colors.surface,
    overflow: "hidden"
  },
  avatarImage: {
    width: "100%",
    height: "100%"
  },
  headerInfo: {
    flex: 1
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: mobileTheme.colors.ink,
    fontFamily: mobileTheme.fontFamily
  },
  onlineText: {
    fontSize: 13,
    color: mobileTheme.colors.muted,
    fontFamily: mobileTheme.fontFamily
  },
  listContent: {
    paddingVertical: 12
  },
  dateContainer: {
    alignItems: "center",
    marginVertical: 12
  },
  datePill: {
    backgroundColor: "rgba(164, 121, 86, 0.12)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  dateText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: mobileTheme.colors.secondary,
    fontFamily: mobileTheme.fontFamily
  },
  messageWrapper: {
    maxWidth: "80%",
    marginHorizontal: 14,
    marginBottom: 4
  },
  messageWrapperMine: {
    alignSelf: "flex-end"
  },
  messageWrapperTheirs: {
    alignSelf: "flex-start"
  },
  messageBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }
  },
  messageBubbleMine: {
    backgroundColor: mobileTheme.colors.secondary,
    borderTopRightRadius: 4
  },
  messageBubbleTheirs: {
    backgroundColor: mobileTheme.colors.surface,
    borderTopLeftRadius: 4
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: mobileTheme.fontFamily
  },
  messageTextMine: {
    color: "#FFFFFF"
  },
  messageTextTheirs: {
    color: mobileTheme.colors.ink
  },
  timeText: {
    fontSize: 11,
    color: mobileTheme.colors.muted,
    marginTop: 4,
    marginHorizontal: 4,
    fontFamily: mobileTheme.fontFamily
  },
  timeTextMine: {
    alignSelf: "flex-end"
  },
  timeTextTheirs: {
    alignSelf: "flex-start"
  },
  footer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 34,
    backgroundColor: mobileTheme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: mobileTheme.colors.border
  },
  input: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: mobileTheme.colors.canvas,
    paddingHorizontal: 18,
    paddingVertical: 12,
    maxHeight: 120,
    fontSize: 15,
    color: mobileTheme.colors.ink,
    fontFamily: mobileTheme.fontFamily
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2
  },
  sendButtonActive: {
    backgroundColor: mobileTheme.colors.secondary
  },
  sendButtonDisabled: {
    backgroundColor: mobileTheme.colors.muted
  }
});

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
      style={[
        styles.messageWrapper,
        msg.isMine ? styles.messageWrapperMine : styles.messageWrapperTheirs
      ]}
    >
      <View
        style={[
          styles.messageBubble,
          msg.isMine ? styles.messageBubbleMine : styles.messageBubbleTheirs
        ]}
      >
        <Text
          style={[
            styles.messageText,
            msg.isMine ? styles.messageTextMine : styles.messageTextTheirs
          ]}
        >
          {msg.body}
        </Text>
      </View>
      <Text
        style={[
          styles.timeText,
          msg.isMine ? styles.timeTextMine : styles.timeTextTheirs
        ]}
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
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backButton}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={mobileTheme.colors.secondary}
          />
        </Pressable>
        <View style={styles.avatar}>
          <Image
            source={
              session?.user.avatarUrl
                ? { uri: session.user.avatarUrl }
                : undefined
            }
            style={styles.avatarImage}
            resizeMode="cover"
          />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Conversation</Text>
          <Text style={styles.onlineText}>Online</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={groupedMessages}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: group }) => (
          <View>
            <View style={styles.dateContainer}>
              <View style={styles.datePill}>
                <Text style={styles.dateText}>{group.date}</Text>
              </View>
            </View>
            {group.messages.map(renderMessage)}
          </View>
        )}
      />

      <View style={styles.footer}>
        <TextInput
          placeholder="Type a message..."
          placeholderTextColor={mobileTheme.colors.muted}
          value={draft}
          onChangeText={setDraft}
          multiline
          style={styles.input}
        />
        <Pressable
          onPress={() => mutation.mutate()}
          disabled={!draft.trim() || mutation.isPending}
          style={[
            styles.sendButton,
            draft.trim() ? styles.sendButtonActive : styles.sendButtonDisabled,
            { opacity: mutation.isPending ? 0.5 : 1 }
          ]}
        >
          <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
