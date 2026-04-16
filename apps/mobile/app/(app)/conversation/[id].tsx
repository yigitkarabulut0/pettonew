import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, BellOff, ChevronLeft, Flag, Lock, MicOff, PawPrint, Send } from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { MessageBubble } from "@/components/chat/message-bubble";
import { PetDetailModal } from "@/components/pet-card";
import { ModerationSheet, type ModerationAction } from "@/components/chat/moderation-sheet";
import { PetSharePicker } from "@/components/chat/pet-share-picker";
import { PinnedBanner } from "@/components/chat/pinned-banner";
import { GroupInfoModal } from "@/components/groups/group-info-modal";
import { ReportModal } from "@/components/report-modal";
import { useTranslation } from "react-i18next";
import {
  deleteConversationMessage,
  deleteGroupMessage,
  getGroupByConversation,
  getPet,
  getPlaydateByConversation,
  joinGroup,
  listConversations,
  listGroupPinned,
  listMessages,
  listMyPets,
  muteConversation,
  muteGroupMember,
  mutePlaydateMember,
  pinGroupMessage,
  sendConversationMessage,
  sendMessage,
  unmuteConversation,
  unpinGroupMessage
} from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { formatDurationShort } from "@/lib/time";
import { useSessionStore } from "@/store/session";
import type { Conversation, Message, Pet } from "@petto/contracts";

export default function ConversationPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { id, initialTitle, initialImage } = useLocalSearchParams<{
    id: string;
    initialTitle?: string;
    initialImage?: string;
  }>();
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const flatListRef = useRef<FlatList>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [petPickerOpen, setPetPickerOpen] = useState(false);
  const [modMessage, setModMessage] = useState<Message | null>(null);
  const [sharedPetId, setSharedPetId] = useState<string | null>(null);
  const setActiveConversationId = useSessionStore((s) => s.setActiveConversationId);

  useEffect(() => {
    setActiveConversationId(id);
    return () => setActiveConversationId(null);
  }, [id]);

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", session?.tokens.accessToken],
    queryFn: () => listConversations(session!.tokens.accessToken),
    enabled: Boolean(session)
  });
  const conversation = conversations.find((c) => c.id === id) ?? null;

  // Fallback chain: router-param seed (instant, v0.11.0: takes priority so
  // playdate chats show the playdate name without a "Conversation" flash) →
  // real query data → localized last-resort. The seed is passed from
  // groups.tsx / group/[id].tsx / playdates/[id].tsx / conversations.tsx so
  // the header shows the real name & image immediately on navigation.
  const otherUserName = initialTitle || conversation?.title || t("chat.conversation");
  const otherUserAvatar =
    initialImage || conversation?.matchPetPairs?.[0]?.matchedPetPhotoUrl;
  const petPairLabel = conversation?.matchPetPairs?.length
    ? conversation.matchPetPairs.map((p) => `${p.myPetName} & ${p.matchedPetName}`).join(", ")
    : "";

  const { data: groupInfo, refetch: refetchGroupInfo } = useQuery({
    queryKey: ["group-by-conv", id],
    queryFn: () => getGroupByConversation(session!.tokens.accessToken, id),
    enabled: Boolean(session && id)
  });

  // If this conversation is a playdate chat, pull the enriched playdate so we
  // know whether the caller is the organizer, is host-muted, or has silenced
  // push. Falls back to null for DMs and group chats.
  const { data: playdateInfo, refetch: refetchPlaydateInfo } = useQuery({
    queryKey: ["playdate-by-conv", id],
    queryFn: () => getPlaydateByConversation(session!.tokens.accessToken, id),
    enabled: Boolean(session && id && !groupInfo)
  });

  const isGroupChat = Boolean(groupInfo);
  const isPlaydateChat = Boolean(playdateInfo);
  const currentUserId = session?.user.id ?? "";
  const isMember = isGroupChat
    ? Boolean(groupInfo?.members?.some((m) => m.userId === currentUserId))
    : isPlaydateChat
    ? Boolean(
        playdateInfo?.isAttending ||
          playdateInfo?.isOrganizer ||
          playdateInfo?.isWaitlisted
      )
    : true;
  // Moderator = group admin OR playdate organizer. The ModerationSheet and
  // all the action handlers treat them identically.
  const isAdmin = Boolean(groupInfo?.isAdmin || playdateInfo?.isOrganizer);
  // Host-level "you can't send" mute. Group chats expose it via groupInfo.muted
  // (with a `mutedUntil` countdown); playdates expose `myChatMuted` (boolean).
  const isMuted = Boolean(groupInfo?.muted || playdateInfo?.myChatMuted);
  // Per-user notification mute — v0.11.0 covers both playdate AND group chats.
  const isConvMuted = Boolean(
    playdateInfo?.myConvMuted || groupInfo?.myConvMuted
  );

  // Single source-of-truth for the messages cache key. Used by useQuery,
  // mutation optimistic updates, cancelQueries, and invalidate — if these
  // ever drift, optimistic writes silently miss the observer and the user
  // sees the "my message disappeared" bug.
  const messagesQueryKey = useMemo(
    () => ["messages", id, session?.tokens.accessToken] as const,
    [id, session?.tokens.accessToken]
  );

  // v0.11.4 — paginated message loading.
  // We keep the polling model for the LATEST page (50 messages) so new
  // messages arrive in real-time. Older history is fetched on demand when
  // the user scrolls to the top, accumulated in `olderMessages` state.
  const PAGE_SIZE = 50;
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Reset older messages when conversation changes.
  useEffect(() => {
    setOlderMessages([]);
    setHasMore(true);
  }, [id]);

  const { data: latestMessages = [] } = useQuery({
    queryKey: messagesQueryKey,
    queryFn: async () => {
      const serverMsgs = await listMessages(session!.tokens.accessToken, id, PAGE_SIZE);
      // Preserve optimistic temp-* messages across polls.
      const current = queryClient.getQueryData<Message[]>(messagesQueryKey);
      if (!current || current.length === 0) return serverMsgs;
      const temps = current.filter((m) => typeof m.id === "string" && m.id.startsWith("temp-"));
      if (temps.length === 0) return serverMsgs;
      const kept = temps.filter((t) => {
        return !serverMsgs.some(
          (s) =>
            s.senderProfileId === t.senderProfileId &&
            s.type === t.type &&
            (s.body ?? "") === (t.body ?? "") &&
            (s.imageUrl ?? "") === (t.imageUrl ?? "") &&
            Math.abs(
              new Date(s.createdAt).getTime() -
                new Date(t.createdAt).getTime()
            ) < 60_000
        );
      });
      return [...serverMsgs, ...kept];
    },
    enabled: Boolean(session && id && (!isGroupChat || isMember)),
    refetchInterval: 2500,
    staleTime: 1500,
    refetchOnWindowFocus: false
  });

  // Merge older (scroll-loaded) pages with the latest (polled) page. We
  // deduplicate by id to handle the overlap where the latest page might
  // include some messages from the last older batch.
  const messages = useMemo(() => {
    const seen = new Set<string>();
    const merged: Message[] = [];
    for (const m of olderMessages) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        merged.push(m);
      }
    }
    for (const m of latestMessages) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        merged.push(m);
      }
    }
    return merged;
  }, [olderMessages, latestMessages]);

  // Load the next older page when the user scrolls to the top.
  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore || !session) return;
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const older = await listMessages(
        session.tokens.accessToken,
        id,
        PAGE_SIZE,
        oldest.id
      );
      if (older.length < PAGE_SIZE) setHasMore(false);
      if (older.length > 0) {
        setOlderMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = older.filter((m) => !seen.has(m.id));
          return [...fresh, ...prev];
        });
      }
    } catch {
      // Swallow — the user can try scrolling up again.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, session, messages, id]);

  const { data: pinned = [], refetch: refetchPinned } = useQuery({
    queryKey: ["group-pinned", groupInfo?.id],
    queryFn: () => listGroupPinned(session!.tokens.accessToken, groupInfo!.id),
    enabled: Boolean(session && groupInfo?.id && isMember),
    staleTime: 5000
  });

  const { data: myPets = [] } = useQuery({
    queryKey: ["my-pets", session?.tokens.accessToken],
    queryFn: () => listMyPets(session!.tokens.accessToken),
    enabled: Boolean(session && (isGroupChat || isPlaydateChat))
  });

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!session || !text.trim()) return null;
      return sendMessage(session.tokens.accessToken, id, text.trim());
    },
    onMutate: async (text: string) => {
      await queryClient.cancelQueries({ queryKey: messagesQueryKey });
      const prev = queryClient.getQueryData(messagesQueryKey);
      const optimistic: Message = {
        id: `temp-${Date.now()}`,
        conversationId: id,
        senderProfileId: session?.user.id ?? "",
        senderName: session?.user.firstName ?? "",
        senderAvatarUrl: session?.user.avatarUrl ?? undefined,
        type: "text",
        body: text.trim(),
        createdAt: new Date().toISOString(),
        isMine: true
      };
      queryClient.setQueryData(messagesQueryKey, (old: Message[] | undefined) => [
        ...(old ?? []),
        optimistic
      ]);
      setDraft("");
      return { prev };
    },
    onError: (err: any, _text, context) => {
      if (context?.prev) queryClient.setQueryData(messagesQueryKey, context.prev);
      // Surface backend limits + moderation errors — otherwise the bubble
      // silently rolls back and the user has no idea what happened.
      const msg = (err?.message ?? "").toString();
      if (msg) {
        Alert.alert(t("chat.sendFailedTitle") as string, msg);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  });

  const richSendMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof sendConversationMessage>[2]) => {
      if (!session) return null;
      return sendConversationMessage(session.tokens.accessToken, id, payload);
    },
    // Optimistic insert — the pet/image bubble appears in the list the
    // instant the user taps send, before the network round-trip.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: messagesQueryKey });
      const prev = queryClient.getQueryData<Message[]>(messagesQueryKey);
      const optimistic: Message = {
        id: `temp-${Date.now()}`,
        conversationId: id,
        senderProfileId: session?.user.id ?? "",
        senderName: session?.user.firstName ?? "",
        senderAvatarUrl: session?.user.avatarUrl ?? undefined,
        type: input.type,
        body: input.body ?? "",
        imageUrl: input.imageUrl,
        metadata: input.metadata,
        createdAt: new Date().toISOString(),
        isMine: true
      };
      queryClient.setQueryData<Message[]>(
        messagesQueryKey,
        (old) => [...(old ?? []), optimistic]
      );
      // Jump to bottom so the user sees the new bubble.
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
      return { prev };
    },
    onError: (err: any, _input, context: any) => {
      if (context?.prev) {
        queryClient.setQueryData(messagesQueryKey, context.prev);
      }
      const msg = (err?.message ?? "").toString();
      if (msg) {
        Alert.alert(t("chat.sendFailedTitle") as string, msg);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  });

  // Fetch the pet that was shared when the user taps a pet_share card.
  const { data: sharedPet = null } = useQuery({
    queryKey: ["pet-detail", sharedPetId],
    queryFn: () => getPet(session!.tokens.accessToken, sharedPetId!),
    enabled: Boolean(session && sharedPetId)
  });

  // ── Composer actions ─────────────────────────────────────────────
  const handleSharePet = (pet: Pet) => {
    setPetPickerOpen(false);
    if (!session || isMuted || !canSend) return;
    const photo = pet.photos?.find((p) => p.isPrimary)?.url ?? pet.photos?.[0]?.url;
    richSendMutation.mutate({
      type: "pet_share",
      metadata: {
        petId: pet.id,
        petName: pet.name,
        petPhotoUrl: photo,
        speciesLabel: pet.speciesLabel,
        breedLabel: pet.breedLabel
      }
    });
  };

  // ── Moderation actions ───────────────────────────────────────────
  const handleModeration = async (action: ModerationAction) => {
    if (!session || !modMessage) return;
    const token = session.tokens.accessToken;
    try {
      switch (action) {
        case "copy": {
          // react-native's built-in Clipboard was removed; fall back to the
          // community package if present, otherwise show the body.
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const ClipboardLib = require("@react-native-clipboard/clipboard").default;
            ClipboardLib?.setString(modMessage.body || "");
          } catch {
            Alert.alert("Copy", modMessage.body || "");
          }
          break;
        }
        case "report":
          setReportOpen(true);
          break;
        case "delete":
          // Group: legacy per-group delete (keeps pin / admin permissions).
          // Playdate + DM: generalized conversation delete — author or host.
          if (groupInfo?.id) {
            await deleteGroupMessage(token, groupInfo.id, modMessage.id);
          } else {
            await deleteConversationMessage(token, id, modMessage.id);
          }
          queryClient.invalidateQueries({ queryKey: messagesQueryKey });
          break;
        case "pin":
          if (groupInfo?.id) {
            await pinGroupMessage(token, groupInfo.id, modMessage.id);
            refetchPinned();
          }
          break;
        case "unpin":
          if (groupInfo?.id) {
            await unpinGroupMessage(token, groupInfo.id, modMessage.id);
            refetchPinned();
          }
          break;
        case "mute-1h":
        case "mute-24h":
        case "mute-indefinite": {
          if (!modMessage.senderProfileId) break;
          const duration =
            action === "mute-1h" ? "1h" : action === "mute-24h" ? "24h" : "indefinite";
          if (groupInfo?.id) {
            await muteGroupMember(
              token,
              groupInfo.id,
              modMessage.senderProfileId,
              duration as "1h" | "24h" | "indefinite"
            );
            queryClient.invalidateQueries({ queryKey: ["group-by-conv", id] });
          } else if (playdateInfo?.id) {
            // Playdate moderation mute. Backend API uses "forever" for
            // indefinite — map the shared ModerationAction.
            const pdDuration =
              duration === "indefinite" ? "forever" : (duration as "1h" | "24h");
            await mutePlaydateMember(
              token,
              playdateInfo.id,
              modMessage.senderProfileId,
              pdDuration
            );
            refetchPlaydateInfo();
            queryClient.invalidateQueries({ queryKey: messagesQueryKey });
          }
          break;
        }
      }
    } catch (err: any) {
      Alert.alert("Action failed", err?.message || "");
    } finally {
      setModMessage(null);
    }
  };

  // ── Notification-mute toggle — v0.11.0 supports both playdate and
  // group chats. The underlying /conversations/{id}/mute endpoint is
  // conversation-id based so the same mutation works for both. We
  // refetch whichever detail query is active so the bell updates.
  const convMuteMutation = useMutation({
    mutationFn: async () => {
      if (!session) return;
      if (isConvMuted) {
        await unmuteConversation(session.tokens.accessToken, id);
      } else {
        await muteConversation(session.tokens.accessToken, id);
      }
    },
    onSuccess: () => {
      if (isPlaydateChat) refetchPlaydateInfo();
      if (isGroupChat) refetchGroupInfo();
    }
  });

  // ── Join flow for non-members ───────────────────────────────────
  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!session || !groupInfo?.id) return;
      await joinGroup(session.tokens.accessToken, groupInfo.id);
    },
    onSuccess: () => {
      refetchGroupInfo();
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    }
  });

  // ── Grouping by day ──────────────────────────────────────────────
  // Hash the messages by the fields that actually change rendering so we
  // don't recompute groupedMessages on every poll when nothing changed.
  const messagesKey = useMemo(
    () =>
      messages
        .map(
          (m) =>
            `${m.id}|${m.deletedAt ?? ""}|${m.pinnedAt ?? ""}|${m.body.length}`
        )
        .join(","),
    [messages]
  );

  const groupedMessages = useMemo(() => {
    const groups: Array<{
      id: string;
      date: string;
      messages: Message[];
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

    // v0.11.4 — reverse the groups so the FlatList (inverted) shows newest
    // at the bottom and oldest at the top. Each group's internal messages
    // stay oldest-first (inverted FlatList renders bottom-up, so the first
    // item in data is visually at the bottom).
    return groups.reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesKey]);

  // With an inverted FlatList, scrollToEnd is no longer needed — the list
  // starts at the newest message (first data item = bottom of screen).

  const canSend = isMember && !isMuted;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ─────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
          paddingHorizontal: mobileTheme.spacing.lg,
          paddingBottom: mobileTheme.spacing.md,
          paddingTop: insets.top + mobileTheme.spacing.md,
          backgroundColor: theme.colors.white,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.colors.background,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <ChevronLeft size={20} color={theme.colors.ink} />
        </Pressable>
        <Avatar
          uri={isGroupChat ? (groupInfo?.imageUrl ?? initialImage) : otherUserAvatar}
          name={isGroupChat ? (groupInfo?.name ?? initialTitle ?? otherUserName) : otherUserName}
          size="sm"
        />
        <Pressable
          style={{ flex: 1 }}
          onPress={
            isGroupChat && groupInfo?.id
              ? () => router.push(`/(app)/group/${groupInfo.id}` as any)
              : isPlaydateChat && playdateInfo?.id
              ? () =>
                  router.push({
                    pathname: "/(app)/playdates/[id]",
                    params: {
                      id: playdateInfo.id,
                      initialTitle: playdateInfo.title ?? "",
                      initialImage: playdateInfo.coverImageUrl ?? ""
                    }
                  } as any)
              : undefined
          }
        >
          <Text
            style={{
              fontSize: mobileTheme.typography.bodySemiBold.fontSize,
              fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            {isGroupChat
              ? (groupInfo?.name ?? initialTitle ?? otherUserName)
              : isPlaydateChat
              ? (playdateInfo?.title ?? initialTitle ?? otherUserName)
              : otherUserName}
          </Text>
          {isGroupChat ? (
            <Text
              style={{
                fontSize: mobileTheme.typography.micro.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}
            >
              {t("groups.members", { count: groupInfo?.memberCount ?? 0 })}
              {isAdmin ? ` · ${t("groups.adminBadge")}` : ""}
            </Text>
          ) : isPlaydateChat ? (
            <Text
              style={{
                fontSize: mobileTheme.typography.micro.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}
            >
              {t("playdates.detail.attendeePlural")} ·{" "}
              {playdateInfo?.slotsUsed ?? 0}
              {playdateInfo?.maxPets ? ` / ${playdateInfo.maxPets}` : ""}
              {playdateInfo?.isOrganizer
                ? ` · ${t("playdates.myPlaydates.roleHost")}`
                : ""}
            </Text>
          ) : petPairLabel ? (
            <Text
              style={{
                fontSize: mobileTheme.typography.micro.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}
            >
              {petPairLabel}
            </Text>
          ) : null}
        </Pressable>
        {/* v0.11.0 — bell available for both playdate and group chats. */}
        {(isPlaydateChat || isGroupChat) && isMember ? (
          <Pressable
            onPress={() => convMuteMutation.mutate()}
            hitSlop={12}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: theme.colors.background,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {isConvMuted ? (
              <BellOff size={18} color={theme.colors.primary} />
            ) : (
              <Bell size={18} color={theme.colors.muted} />
            )}
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setReportOpen(true)}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.colors.background,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Flag size={18} color={theme.colors.muted} />
        </Pressable>
      </View>

      {/* ── Pinned banner ──────────────────────────────────────── */}
      {isGroupChat && isMember && (
        <PinnedBanner
          pinned={pinned}
          onPress={() => setGroupInfoOpen(true)}
        />
      )}

      {/* ── Non-member gate ───────────────────────────────────── */}
      {isGroupChat && !isMember ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: mobileTheme.spacing.xl,
            gap: 14
          }}
        >
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: theme.colors.primaryBg,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Lock size={36} color={theme.colors.primary} />
          </View>
          <Text
            style={{
              fontSize: 18,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold",
              textAlign: "center"
            }}
          >
            {t("groups.joinToChatTitle")}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.muted,
              fontFamily: "Inter_500Medium",
              textAlign: "center",
              lineHeight: 20,
              maxWidth: 300
            }}
          >
            {t("groups.joinToChatBody")}
          </Text>
          <Pressable
            onPress={() => joinMutation.mutate()}
            disabled={joinMutation.isPending}
            style={{
              marginTop: 10,
              paddingHorizontal: 30,
              paddingVertical: 14,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: theme.colors.primary,
              opacity: joinMutation.isPending ? 0.6 : 1
            }}
          >
            <Text
              style={{
                color: theme.colors.white,
                fontFamily: "Inter_700Bold",
                fontSize: 15
              }}
            >
              {t("groups.joinToChat")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* ── Messages list ─────────────────────────────────── */}
          <FlatList
            ref={flatListRef}
            data={groupedMessages}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={8}
            updateCellsBatchingPeriod={50}
            // v0.11.4 — load older messages on scroll-to-top.
            onEndReached={loadOlderMessages}
            onEndReachedThreshold={0.3}
            inverted
            contentContainerStyle={{
              paddingVertical: mobileTheme.spacing.md,
              paddingHorizontal: 12,
              paddingBottom: 16
            }}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.primary}
                  style={{ paddingVertical: 16 }}
                />
              ) : null
            }
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
                      backgroundColor: theme.colors.secondarySoft,
                      borderRadius: mobileTheme.radius.pill,
                      paddingHorizontal: mobileTheme.spacing.md,
                      paddingVertical: mobileTheme.spacing.xs + 2
                    }}
                  >
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.micro.fontSize,
                        fontWeight: "600",
                        color: theme.colors.secondary,
                        fontFamily: "Inter_600SemiBold"
                      }}
                    >
                      {group.date}
                    </Text>
                  </View>
                </View>
                {group.messages.map((msg: Message, idx: number) => {
                  const next = group.messages[idx + 1];
                  const sameMinute =
                    next &&
                    new Date(msg.createdAt).getHours() ===
                      new Date(next.createdAt).getHours() &&
                    new Date(msg.createdAt).getMinutes() ===
                      new Date(next.createdAt).getMinutes();
                  const nextSameSender =
                    next &&
                    next.senderProfileId === msg.senderProfileId &&
                    next.type !== "system";
                  const showAvatar = isGroupChat && !msg.isMine && !nextSameSender;
                  const showName =
                    isGroupChat &&
                    !msg.isMine &&
                    (idx === 0 ||
                      group.messages[idx - 1]?.senderProfileId !== msg.senderProfileId ||
                      group.messages[idx - 1]?.type === "system");
                  return (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      showAvatar={showAvatar || (isGroupChat && !msg.isMine && idx === group.messages.length - 1)}
                      showName={showName}
                      showTimestamp={!sameMinute}
                      onLongPress={
                        msg.type === "system"
                          ? undefined
                          : () => setModMessage(msg)
                      }
                      onPressPetShare={setSharedPetId}
                    />
                  );
                })}
              </View>
            )}
          />

          {/* ── Composer ──────────────────────────────────────── */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              gap: mobileTheme.spacing.sm,
              paddingHorizontal: mobileTheme.spacing.lg,
              paddingVertical: mobileTheme.spacing.sm,
              paddingBottom: insets.bottom + mobileTheme.spacing.md,
              backgroundColor: theme.colors.white,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border
            }}
          >
            {isMuted ? (
              <MutedPill until={groupInfo?.mutedUntil ?? null} />
            ) : !isMember ? (
              // Playdate chat gate: non-joined users never get here (the
              // conversation id is blanked by the backend) but guard anyway.
              <View style={{ flex: 1, paddingVertical: 14, alignItems: "center" }}>
                <Text
                  style={{
                    color: theme.colors.muted,
                    fontSize: 13,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  {t("playdates.chat.joinToSend")}
                </Text>
              </View>
            ) : (
              <>
                {(isGroupChat || isPlaydateChat) && (
                  <>
                    <Pressable
                      onPress={() => setPetPickerOpen(true)}
                      disabled={!canSend}
                      hitSlop={10}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: theme.colors.background,
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 2
                      }}
                    >
                      <PawPrint size={18} color={theme.colors.primary} />
                    </Pressable>
                  </>
                )}
                <TextInput
                  placeholder={t("chat.typeMessage")}
                  placeholderTextColor={theme.colors.muted}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  scrollEnabled
                  editable={canSend}
                  style={{
                    flex: 1,
                    borderRadius: 20,
                    backgroundColor: theme.colors.background,
                    paddingHorizontal: mobileTheme.spacing.lg,
                    paddingVertical: 12,
                    maxHeight: 160,
                    fontSize: mobileTheme.typography.body.fontSize,
                    color: theme.colors.ink,
                    fontFamily: "Inter_400Regular",
                    lineHeight: mobileTheme.typography.body.lineHeight
                  }}
                />
                <Pressable
                  onPress={() => draft.trim() && sendMutation.mutate(draft)}
                  disabled={!draft.trim() || !canSend}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor:
                      draft.trim() && canSend
                        ? theme.colors.primary
                        : theme.colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 2,
                    opacity: sendMutation.isPending ? 0.5 : 1
                  }}
                >
                  <Send
                    size={18}
                    color={
                      draft.trim() && canSend ? theme.colors.white : theme.colors.muted
                    }
                  />
                </Pressable>
              </>
            )}
          </View>
        </>
      )}

      <ReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="chat"
        targetID={id}
        targetLabel={otherUserName}
      />

      <GroupInfoModal
        visible={groupInfoOpen}
        onClose={() => setGroupInfoOpen(false)}
        group={groupInfo ?? null}
      />

      <PetSharePicker
        visible={petPickerOpen}
        pets={myPets}
        onClose={() => setPetPickerOpen(false)}
        onSelect={handleSharePet}
      />

      <ModerationSheet
        visible={Boolean(modMessage)}
        message={modMessage}
        isAdmin={isAdmin}
        isOwnMessage={modMessage?.isMine ?? false}
        onClose={() => setModMessage(null)}
        onAction={handleModeration}
      />

      <PetDetailModal
        pet={sharedPet}
        visible={Boolean(sharedPetId && sharedPet)}
        onClose={() => setSharedPetId(null)}
      />
    </KeyboardAvoidingView>
  );
}

// ── Dynamic muted pill ─────────────────────────────────────────────
// Shows "You are muted — 1h 23m left" that ticks down every 30s, or
// "You are muted indefinitely" when the until is null.
function MutedPill({ until }: { until?: string | null }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!until) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [until]);

  const label = useMemo(() => {
    if (!until) return t("groups.mutedIndefinitelyLabel") as string;
    const msLeft = new Date(until).getTime() - now;
    if (msLeft <= 0) return t("groups.mutedExpiringLabel") as string;
    return t("groups.mutedForLabel", {
      duration: formatDurationShort(msLeft)
    }) as string;
  }, [until, now, t]);

  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: mobileTheme.spacing.lg,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: theme.colors.dangerBg
      }}
    >
      <MicOff size={16} color={theme.colors.danger} strokeWidth={2.2} />
      <Text
        style={{
          color: theme.colors.danger,
          fontFamily: "Inter_700Bold",
          fontSize: 13
        }}
      >
        {label}
      </Text>
    </View>
  );
}
