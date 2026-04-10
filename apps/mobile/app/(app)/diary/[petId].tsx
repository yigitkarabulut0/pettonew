import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useCallback } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, BookOpen, Plus, Send } from "lucide-react-native";

import { listDiary, createDiaryEntry } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const MOOD_OPTIONS: { key: string; emoji: string; label: string }[] = [
  { key: "happy", emoji: "\u{1F60A}", label: "Happy" },
  { key: "sad", emoji: "\u{1F622}", label: "Sad" },
  { key: "excited", emoji: "\u{1F389}", label: "Excited" },
  { key: "calm", emoji: "\u{1F60C}", label: "Calm" },
  { key: "playful", emoji: "\u{1F43E}", label: "Playful" }
];

function moodEmoji(mood: string): string {
  return MOOD_OPTIONS.find((m) => m.key === mood)?.emoji ?? "\u{1F43E}";
}

function relativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateString).toLocaleDateString();
}

export default function DiaryPage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();

  const [body, setBody] = useState("");
  const [selectedMood, setSelectedMood] = useState("happy");
  const [composerOpen, setComposerOpen] = useState(false);

  const token = session?.tokens.accessToken ?? "";

  const diaryQuery = useQuery({
    queryKey: ["diary", petId],
    queryFn: () => listDiary(token, petId!),
    enabled: Boolean(token && petId)
  });

  const createMutation = useMutation({
    mutationFn: () => createDiaryEntry(token, petId!, body.trim(), selectedMood),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diary", petId] });
      setBody("");
      setSelectedMood("happy");
      setComposerOpen(false);
    }
  });

  const onRefresh = useCallback(() => {
    diaryQuery.refetch();
  }, [diaryQuery]);

  const entries = diaryQuery.data ?? [];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.lg,
          paddingHorizontal: mobileTheme.spacing.xl,
          backgroundColor: theme.colors.white,
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
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
          <ArrowLeft size={18} color={theme.colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: mobileTheme.typography.subheading.fontSize,
              fontWeight: mobileTheme.typography.subheading.fontWeight,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            Pet Diary
          </Text>
        </View>
        <Pressable
          onPress={() => setComposerOpen(!composerOpen)}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.colors.primaryBg,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Plus size={18} color={theme.colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingTop: mobileTheme.spacing.xl,
          paddingBottom: insets.bottom + 24
        }}
        refreshControl={
          <RefreshControl
            refreshing={diaryQuery.isRefetching}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Composer */}
        {composerOpen && (
          <View
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              padding: mobileTheme.spacing.xl,
              marginBottom: mobileTheme.spacing.xl,
              gap: mobileTheme.spacing.lg,
              ...mobileTheme.shadow.sm
            }}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              New Entry
            </Text>

            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="What happened today?"
              placeholderTextColor={theme.colors.muted}
              multiline
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                minHeight: 100,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink,
                fontFamily: "Inter_400Regular",
                lineHeight: mobileTheme.typography.body.lineHeight,
                textAlignVertical: "top"
              }}
            />

            {/* Mood Selector */}
            <View style={{ gap: mobileTheme.spacing.sm }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium"
                }}
              >
                Mood
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: mobileTheme.spacing.sm,
                  flexWrap: "wrap"
                }}
              >
                {MOOD_OPTIONS.map((mood) => (
                  <Pressable
                    key={mood.key}
                    onPress={() => setSelectedMood(mood.key)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: mobileTheme.radius.pill,
                      backgroundColor:
                        selectedMood === mood.key
                          ? theme.colors.primaryBg
                          : theme.colors.background,
                      borderWidth: 1,
                      borderColor:
                        selectedMood === mood.key
                          ? theme.colors.primary
                          : theme.colors.border
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>{mood.emoji}</Text>
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.caption.fontSize,
                        fontWeight: selectedMood === mood.key ? "600" : "400",
                        color:
                          selectedMood === mood.key
                            ? theme.colors.primary
                            : theme.colors.ink,
                        fontFamily:
                          selectedMood === mood.key
                            ? "Inter_600SemiBold"
                            : "Inter_400Regular"
                      }}
                    >
                      {mood.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable
              onPress={() => createMutation.mutate()}
              disabled={!body.trim() || createMutation.isPending}
              style={{
                backgroundColor: body.trim()
                  ? theme.colors.primary
                  : theme.colors.border,
                borderRadius: mobileTheme.radius.md,
                paddingVertical: mobileTheme.spacing.md,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: mobileTheme.spacing.sm
              }}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Send size={16} color="#FFFFFF" />
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontWeight: "600",
                      fontSize: mobileTheme.typography.body.fontSize,
                      fontFamily: "Inter_600SemiBold"
                    }}
                  >
                    Save Entry
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {/* Loading State */}
        {diaryQuery.isLoading && (
          <View
            style={{
              paddingVertical: mobileTheme.spacing["4xl"],
              alignItems: "center"
            }}
          >
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        )}

        {/* Empty State */}
        {!diaryQuery.isLoading && entries.length === 0 && (
          <View
            style={{
              paddingVertical: mobileTheme.spacing["4xl"],
              alignItems: "center",
              gap: mobileTheme.spacing.lg
            }}
          >
            <BookOpen size={48} color={theme.colors.muted} />
            <Text
              style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                fontWeight: mobileTheme.typography.subheading.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              No diary entries yet
            </Text>
            <Text
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_400Regular",
                textAlign: "center",
                paddingHorizontal: mobileTheme.spacing["3xl"]
              }}
            >
              Tap the + button to add your first diary entry for your pet.
            </Text>
          </View>
        )}

        {/* Entries */}
        {entries.map((entry) => (
          <View
            key={entry.id}
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              padding: mobileTheme.spacing.xl,
              marginBottom: mobileTheme.spacing.md,
              gap: mobileTheme.spacing.sm,
              ...mobileTheme.shadow.sm
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <Text style={{ fontSize: 24 }}>{moodEmoji(entry.mood)}</Text>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium"
                }}
              >
                {relativeTime(entry.createdAt)}
              </Text>
            </View>
            <Text
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                lineHeight: mobileTheme.typography.body.lineHeight,
                color: theme.colors.ink,
                fontFamily: "Inter_400Regular"
              }}
            >
              {entry.body}
            </Text>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
