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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Flag, Send } from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { ReportModal } from "@/components/report-modal";
import { useTranslation } from "react-i18next";
import { listMessages, sendMessage } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import type { Conversation } from "@petto/contracts";

export default function ConversationPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const flatListRef = useRef<FlatList>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const conversations = queryClient.getQueryData<Conversation[]>([
    "conversations",
    session?.tokens.accessToken
  ]);
  const conversation = conversations?.find((c) => c.id === id) ?? null;

  const otherUserName = conversation?.title ?? t("chat.conversation");
  const otherUserAvatar = conversation?.matchPetPairs[0]?.matchedPetPhotoUrl;
  const subtitle = conversation?.subtitle ?? "";

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

  const renderMessage = (msg: (typeof messages)[0], showTimestamp: boolean) => (
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
            ? theme.colors.primary
            : theme.colors.white,
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
              ? theme.colors.white
              : theme.colors.ink,
            lineHeight: mobileTheme.typography.body.lineHeight,
            fontSize: mobileTheme.typography.body.fontSize,
            fontFamily: "Inter_400Regular"
          }}
        >
          {msg.body}
        </Text>
      </View>
      {showTimestamp && (
        <Text
          style={{
            fontSize: 10,
            color: theme.colors.muted,
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
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

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
        <Avatar uri={otherUserAvatar} name={otherUserName} size="sm" />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: mobileTheme.typography.bodySemiBold.fontSize,
              fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            {otherUserName}
          </Text>
          {subtitle ? (
            <Text
              style={{
                fontSize: mobileTheme.typography.micro.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
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

      <FlatList
        ref={flatListRef}
        data={groupedMessages}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: mobileTheme.spacing.md, paddingBottom: 80 }}
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
            {group.messages.map((msg, idx) => {
              const next = group.messages[idx + 1];
              const sameMinute =
                next &&
                new Date(msg.createdAt).getHours() ===
                  new Date(next.createdAt).getHours() &&
                new Date(msg.createdAt).getMinutes() ===
                  new Date(next.createdAt).getMinutes();
              return renderMessage(msg, !sameMinute);
            })}
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
          paddingBottom: insets.bottom + mobileTheme.spacing.md,
          backgroundColor: theme.colors.white,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border
        }}
      >
        <TextInput
          placeholder={t("chat.typeMessage")}
          placeholderTextColor={theme.colors.muted}
          value={draft}
          onChangeText={setDraft}
          multiline
          style={{
            flex: 1,
            borderRadius: mobileTheme.radius.pill,
            backgroundColor: theme.colors.background,
            paddingHorizontal: mobileTheme.spacing.lg,
            paddingVertical: mobileTheme.spacing.sm + 4,
            maxHeight: 120,
            fontSize: mobileTheme.typography.body.fontSize,
            color: theme.colors.ink,
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
              ? theme.colors.primary
              : theme.colors.border,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 2,
            opacity: mutation.isPending ? 0.5 : 1
          }}
        >
          <Send
            size={18}
            color={
              draft.trim() ? theme.colors.white : theme.colors.muted
            }
          />
        </Pressable>
      </View>

      <ReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="chat"
        targetID={id}
        targetLabel={otherUserName}
      />
    </KeyboardAvoidingView>
  );
}
