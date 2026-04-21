// Shelter chat screen — full real-time conversation UI.
//
// Real-time: React Query `refetchInterval: 2500` ms (matches the main app
// chat). Messages are paginated; optimistic sends get a temp-* id so the
// bubble appears instantly before the server response arrives.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image as RNImage,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, CheckCheck, ImageIcon, Send } from "lucide-react-native";

import {
  listMessages,
  markMessagesRead,
  sendMessage
} from "@/lib/api";
import { theme } from "@/lib/theme";
import { useSession } from "@/store/session";
import type { Message } from "@petto/contracts";

const POLL_MS = 2500;
const PAGE_SIZE = 50;

type UiMessage = Message & { pending?: boolean; failed?: boolean };

function tempId() {
  return `temp-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mo} ${hh}:${mm}`;
}

export default function ConversationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const shelter = useSession((s) => s.shelter);
  const shelterId = shelter?.id ?? "";

  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const conversationId = Array.isArray(id) ? id[0] : id;
  const headerTitle = (Array.isArray(title) ? title[0] : title) ?? "Chat";

  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] = useState<UiMessage[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pagedMessages, setPagedMessages] = useState<Message[]>([]);
  const [reachedStart, setReachedStart] = useState(false);
  const listRef = useRef<FlatList<UiMessage>>(null);

  // Base query — polls at 2.5s. Refresh returns the most recent page.
  const {
    data: freshMessages = [],
    isLoading
  } = useQuery({
    queryKey: ["shelter-messages", conversationId],
    queryFn: () => listMessages(conversationId as string, PAGE_SIZE),
    enabled: Boolean(conversationId),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false
  });

  // Mark-read whenever the newest message changes and it's from the
  // counterpart. Fire-and-forget so we don't block the render.
  useEffect(() => {
    if (!conversationId) return;
    if (freshMessages.length === 0) return;
    const last = freshMessages[0]; // list comes newest-first (inverted)
    if (last && last.senderProfileId !== shelterId && !last.readAt) {
      void markMessagesRead(conversationId as string).then(() => {
        queryClient.invalidateQueries({ queryKey: ["shelter-conversations"] });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, freshMessages.length, freshMessages[0]?.id, shelterId]);

  // Merge freshMessages into the cumulative pagedMessages store. The poll
  // always returns the latest page; we union with any older messages we've
  // fetched via loadOlder.
  useEffect(() => {
    if (freshMessages.length === 0 && pagedMessages.length === 0) return;
    setPagedMessages((prev) => {
      const byId = new Map<string, Message>();
      for (const m of prev) byId.set(m.id, m);
      for (const m of freshMessages) byId.set(m.id, m);
      return Array.from(byId.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
    // If the first page came back under PAGE_SIZE we know there's nothing
    // older — avoid spurious loadOlder calls later.
    if (!reachedStart && freshMessages.length < PAGE_SIZE) setReachedStart(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshMessages]);

  // Drop optimistic rows once the server acknowledges them.
  useEffect(() => {
    if (optimistic.length === 0) return;
    setOptimistic((prev) =>
      prev.filter((o) => !freshMessages.some((m) => m.body === o.body && m.senderProfileId === shelterId && sameWithinSeconds(m.createdAt, o.createdAt, 8)))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshMessages]);

  // Pull older messages when the user reaches the (visually top = end of inverted list).
  const loadOlder = useCallback(async () => {
    if (loadingOlder || reachedStart || !conversationId) return;
    const oldest = pagedMessages[pagedMessages.length - 1];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const older = await listMessages(conversationId as string, PAGE_SIZE, oldest.id);
      if (older.length === 0) {
        setReachedStart(true);
      } else {
        setPagedMessages((prev) => {
          const byId = new Map<string, Message>();
          for (const m of prev) byId.set(m.id, m);
          for (const m of older) byId.set(m.id, m);
          return Array.from(byId.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, pagedMessages, loadingOlder, reachedStart]);

  const sendMut = useMutation({
    mutationFn: async (vars: { body: string; tempId: string }) => {
      return sendMessage(conversationId as string, vars.body);
    },
    onMutate: ({ body, tempId: t }) => {
      const optimisticMsg: UiMessage = {
        id: t,
        conversationId: conversationId as string,
        senderProfileId: shelterId,
        senderName: shelter?.name ?? "",
        senderAvatarUrl: shelter?.logoUrl ?? undefined,
        type: "text",
        body,
        createdAt: new Date().toISOString(),
        isMine: true,
        pending: true
      };
      setOptimistic((prev) => [optimisticMsg, ...prev]);
    },
    onError: (_err, vars) => {
      setOptimistic((prev) =>
        prev.map((m) => (m.id === vars.tempId ? { ...m, pending: false, failed: true } : m))
      );
    },
    onSuccess: () => {
      // Real message will arrive via the next poll; optimistic cleanup happens
      // in the freshMessages useEffect.
      queryClient.invalidateQueries({ queryKey: ["shelter-conversations"] });
    }
  });

  const messages = useMemo<UiMessage[]>(() => {
    // FlatList inverted: index 0 = bottom. Combine optimistic (newest first).
    return [...optimistic, ...pagedMessages];
  }, [optimistic, pagedMessages]);

  function onSend() {
    const body = draft.trim();
    if (!body || sendMut.isPending) return;
    const t = tempId();
    setDraft("");
    sendMut.mutate({ body, tempId: t });
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={["top"]}
    >
      {/* Header */}
      <View
        style={{
          height: 52,
          paddingHorizontal: theme.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
        >
          <ArrowLeft size={22} color={theme.colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 15, fontWeight: "700", color: theme.colors.ink }}
            numberOfLines={1}
          >
            {headerTitle}
          </Text>
          <Text style={{ fontSize: 10.5, color: theme.colors.muted, marginTop: 1 }}>
            Adoption chat
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 52 : 0}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1 }}>
          {isLoading && pagedMessages.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              inverted
              // loadOlder triggers when the user scrolls to the top of the
              // inverted list, which is the *end* of the data.
              onEndReached={() => void loadOlder()}
              onEndReachedThreshold={0.3}
              ListFooterComponent={
                loadingOlder ? (
                  <View style={{ paddingVertical: 16, alignItems: "center" }}>
                    <ActivityIndicator color={theme.colors.muted} />
                  </View>
                ) : reachedStart && pagedMessages.length > 0 ? (
                  <View style={{ paddingVertical: 16, alignItems: "center" }}>
                    <Text style={{ fontSize: 10, color: theme.colors.muted }}>
                      Start of the conversation
                    </Text>
                  </View>
                ) : null
              }
              contentContainerStyle={{
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.md,
                flexGrow: 1,
                justifyContent: messages.length === 0 ? "center" : undefined
              }}
              initialNumToRender={20}
              maxToRenderPerBatch={15}
              windowSize={10}
              removeClippedSubviews={Platform.OS === "android"}
              ListEmptyComponent={
                <View style={{ alignItems: "center", gap: 8, padding: 24 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: theme.colors.ink }}>
                    Say hi 👋
                  </Text>
                  <Text
                    style={{ fontSize: 12, color: theme.colors.muted, textAlign: "center" }}
                  >
                    Start the conversation. The applicant will be notified on
                    the Petto app.
                  </Text>
                </View>
              }
              renderItem={({ item, index }) => (
                <Bubble
                  message={item}
                  isFirstOfGroup={isFirstOfGroup(messages, index)}
                  isLastOfGroup={isLastOfGroup(messages, index)}
                />
              )}
            />
          )}
        </View>

        {/* Composer */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 8),
            backgroundColor: theme.colors.surface,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: theme.colors.background,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 14,
              paddingVertical: Platform.OS === "ios" ? 10 : 4,
              minHeight: 40,
              maxHeight: 140
            }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message the applicant…"
              placeholderTextColor={theme.colors.muted}
              multiline
              style={{
                fontSize: 14,
                color: theme.colors.ink,
                lineHeight: 20,
                padding: 0
              }}
            />
          </View>
          <Pressable
            onPress={onSend}
            disabled={!draft.trim() || sendMut.isPending}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor:
                !draft.trim() || sendMut.isPending ? theme.colors.border : theme.colors.primary,
              opacity: pressed ? 0.85 : 1
            })}
          >
            <Send size={16} color={!draft.trim() ? theme.colors.muted : "#FFFFFF"} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({
  message,
  isFirstOfGroup,
  isLastOfGroup
}: {
  message: UiMessage;
  isFirstOfGroup: boolean;
  isLastOfGroup: boolean;
}) {
  const mine = message.isMine;
  const deleted = Boolean(message.deletedAt);
  const isImage = message.type === "image" && Boolean(message.imageUrl);

  const baseRadius = 18;
  const tight = 6;
  const bubbleRadius = {
    borderTopLeftRadius: mine ? baseRadius : isFirstOfGroup ? baseRadius : tight,
    borderTopRightRadius: mine ? (isFirstOfGroup ? baseRadius : tight) : baseRadius,
    borderBottomLeftRadius: mine ? baseRadius : isLastOfGroup ? tight : baseRadius,
    borderBottomRightRadius: mine ? (isLastOfGroup ? tight : baseRadius) : baseRadius
  };

  return (
    <View
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "82%",
        marginTop: isFirstOfGroup ? 8 : 2,
        marginBottom: isLastOfGroup ? 4 : 0,
        alignItems: mine ? "flex-end" : "flex-start"
      }}
    >
      {!mine && isFirstOfGroup ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3, marginLeft: 4 }}>
          {message.senderAvatarUrl ? (
            <RNImage
              source={{ uri: message.senderAvatarUrl }}
              style={{ width: 16, height: 16, borderRadius: 8 }}
            />
          ) : null}
          <Text style={{ fontSize: 10.5, color: theme.colors.muted, fontWeight: "600" }}>
            {message.senderName}
          </Text>
        </View>
      ) : null}

      {deleted ? (
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: baseRadius,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface
          }}
        >
          <Text style={{ fontSize: 12, color: theme.colors.muted, fontStyle: "italic" }}>
            This message was deleted
          </Text>
        </View>
      ) : isImage ? (
        <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
          <Image
            source={{ uri: message.imageUrl! }}
            style={{
              width: 220,
              height: 220,
              borderRadius: 14,
              backgroundColor: theme.colors.border
            }}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
          {message.body ? (
            <View
              style={{
                marginTop: 4,
                paddingHorizontal: 12,
                paddingVertical: 6,
                ...bubbleRadius,
                backgroundColor: mine ? theme.colors.primary : theme.colors.surface
              }}
            >
              <Text style={{ fontSize: 13, color: mine ? "#FFFFFF" : theme.colors.ink }}>
                {message.body}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 9,
            backgroundColor: mine ? theme.colors.primary : theme.colors.surface,
            borderWidth: mine ? 0 : 1,
            borderColor: theme.colors.border,
            ...bubbleRadius,
            opacity: message.pending ? 0.7 : message.failed ? 0.5 : 1
          }}
        >
          <Text style={{ fontSize: 14, color: mine ? "#FFFFFF" : theme.colors.ink, lineHeight: 19 }}>
            {message.body}
          </Text>
        </View>
      )}

      {isLastOfGroup ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginTop: 3,
            marginHorizontal: 6
          }}
        >
          <Text style={{ fontSize: 9.5, color: theme.colors.muted }}>
            {formatTimestamp(message.createdAt)}
          </Text>
          {mine && !message.pending && !message.failed ? (
            message.readAt ? (
              <CheckCheck size={11} color={theme.colors.primary} />
            ) : (
              <Check size={11} color={theme.colors.muted} />
            )
          ) : null}
          {message.failed ? (
            <Text style={{ fontSize: 9.5, color: theme.colors.danger }}>
              · failed
            </Text>
          ) : message.pending ? (
            <Text style={{ fontSize: 9.5, color: theme.colors.muted }}>· sending</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// FlatList is inverted, so `index` 0 is the newest message. Grouping logic:
// "first of group" = no message from same sender immediately newer (prev).
// "last of group"  = no message from same sender immediately older (next).
function isFirstOfGroup(items: UiMessage[], index: number): boolean {
  // Previous in visual order (one "newer") = items[index - 1]
  const prev = items[index - 1];
  if (!prev) return true;
  if (prev.senderProfileId !== items[index]!.senderProfileId) return true;
  // Break grouping after a 5 min gap so timestamps stay meaningful.
  return timeGapMinutes(prev.createdAt, items[index]!.createdAt) > 5;
}

function isLastOfGroup(items: UiMessage[], index: number): boolean {
  const next = items[index + 1];
  if (!next) return true;
  if (next.senderProfileId !== items[index]!.senderProfileId) return true;
  return timeGapMinutes(items[index]!.createdAt, next.createdAt) > 5;
}

function timeGapMinutes(aISO: string, bISO: string): number {
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.abs(a - b) / (60 * 1000);
}

function sameWithinSeconds(a: string, b: string, seconds: number): boolean {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return false;
  return Math.abs(da - db) <= seconds * 1000;
}
