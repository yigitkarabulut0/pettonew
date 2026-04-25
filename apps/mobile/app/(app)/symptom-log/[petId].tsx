import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import * as Haptics from "expo-haptics";
import {
  AlertTriangle,
  ArrowLeft,
  Plus,
  Send,
  Trash2
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";

import { LottieLoading } from "@/components/lottie-loading";
import {
  createSymptomLog,
  deleteSymptomLog,
  listSymptomLogs
} from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useLocalRefresh } from "@/lib/use-local-refresh";
import { useSessionStore } from "@/store/session";

// Curated category set — matches the most common reasons pet owners book a
// vet visit. Free-text "Other" lives in the notes field, so this list stays
// short on purpose.
const SYMPTOM_CATEGORIES: { key: string; emoji: string }[] = [
  { key: "vomiting",  emoji: "\u{1F922}" },
  { key: "diarrhea",  emoji: "\u{1F4A6}" },
  { key: "lethargy",  emoji: "\u{1F634}" },
  { key: "itching",   emoji: "\u{1F43E}" },
  { key: "limping",   emoji: "\u{1F9B5}" },
  { key: "coughing",  emoji: "\u{1F926}" },
  { key: "appetite",  emoji: "\u{1F374}" },
  { key: "skin",      emoji: "\u{1FA79}" },
  { key: "eyes",      emoji: "\u{1F441}" }
];

const SEVERITY_LABELS: Record<number, string> = {
  1: "symptomLog.severity1",
  2: "symptomLog.severity2",
  3: "symptomLog.severity3",
  4: "symptomLog.severity4",
  5: "symptomLog.severity5"
};

function relativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return i18n.t("symptomLog.justNow");
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return new Date(dateString).toLocaleDateString();
}

export default function SymptomLogPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const token = session?.tokens.accessToken ?? "";

  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [severity, setSeverity] = useState(2);
  const [durationHours, setDurationHours] = useState("");
  const [notes, setNotes] = useState("");

  const logsQuery = useQuery({
    queryKey: ["symptom-logs", petId],
    queryFn: () => listSymptomLogs(token, petId!),
    enabled: Boolean(token && petId)
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const dh = parseInt(durationHours, 10);
      return createSymptomLog(token, petId!, {
        categories: selectedCats,
        severity,
        durationHours: Number.isFinite(dh) && dh > 0 ? dh : 0,
        notes: notes.trim(),
        occurredAt: new Date().toISOString()
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["symptom-logs", petId] });
      setSelectedCats([]);
      setSeverity(2);
      setDurationHours("");
      setNotes("");
      setComposerOpen(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (logId: string) => deleteSymptomLog(token, petId!, logId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["symptom-logs", petId] });
    }
  });

  const { refreshing, handleRefresh } = useLocalRefresh(
    useCallback(() => logsQuery.refetch(), [logsQuery])
  );

  const toggleCategory = (key: string) => {
    setSelectedCats((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    Haptics.selectionAsync();
  };

  const confirmDelete = (logId: string) => {
    Alert.alert(
      t("symptomLog.deleteConfirmTitle"),
      t("symptomLog.deleteConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteMutation.mutate(logId)
        }
      ]
    );
  };

  const canSave = selectedCats.length > 0 || notes.trim().length > 0;
  const logs = logsQuery.data ?? [];

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
            {t("symptomLog.title")}
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
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
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
              {t("symptomLog.newEntry")}
            </Text>

            {/* Category chips */}
            <View style={{ gap: mobileTheme.spacing.sm }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium"
                }}
              >
                {t("symptomLog.symptoms")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {SYMPTOM_CATEGORIES.map((cat) => {
                  const selected = selectedCats.includes(cat.key);
                  return (
                    <Pressable
                      key={cat.key}
                      onPress={() => toggleCategory(cat.key)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: mobileTheme.radius.pill,
                        backgroundColor: selected
                          ? theme.colors.primaryBg
                          : theme.colors.background,
                        borderWidth: 1,
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.border
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>{cat.emoji}</Text>
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.caption.fontSize,
                          fontWeight: selected ? "600" : "400",
                          color: selected
                            ? theme.colors.primary
                            : theme.colors.ink,
                          fontFamily: selected
                            ? "Inter_600SemiBold"
                            : "Inter_400Regular"
                        }}
                      >
                        {t(`symptomLog.cat_${cat.key}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Severity slider — five tappable dots, color-coded for instant
                visual scan when reviewing the timeline. */}
            <View style={{ gap: mobileTheme.spacing.sm }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <Text
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    color: theme.colors.muted,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  {t("symptomLog.severity")}
                </Text>
                <Text
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    color: severityColor(severity, theme),
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {t(SEVERITY_LABELS[severity] ?? "symptomLog.severity1")}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = n <= severity;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => {
                        setSeverity(n);
                        Haptics.selectionAsync();
                      }}
                      style={{
                        flex: 1,
                        height: 36,
                        borderRadius: mobileTheme.radius.md,
                        backgroundColor: active
                          ? severityColor(n, theme)
                          : theme.colors.background,
                        borderWidth: 1,
                        borderColor: active
                          ? severityColor(n, theme)
                          : theme.colors.border,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: active ? "#FFFFFF" : theme.colors.muted,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {n}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Duration */}
            <View style={{ gap: mobileTheme.spacing.sm }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium"
                }}
              >
                {t("symptomLog.duration")}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: mobileTheme.spacing.sm }}>
                <TextInput
                  value={durationHours}
                  onChangeText={(v) => setDurationHours(v.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  placeholderTextColor={theme.colors.muted}
                  keyboardType="number-pad"
                  style={{
                    width: 80,
                    backgroundColor: theme.colors.background,
                    borderRadius: mobileTheme.radius.md,
                    paddingHorizontal: mobileTheme.spacing.lg,
                    paddingVertical: 10,
                    fontSize: mobileTheme.typography.body.fontSize,
                    color: theme.colors.ink,
                    fontFamily: "Inter_400Regular",
                    textAlign: "center"
                  }}
                />
                <Text
                  style={{
                    fontSize: mobileTheme.typography.body.fontSize,
                    color: theme.colors.muted,
                    fontFamily: "Inter_400Regular"
                  }}
                >
                  {t("symptomLog.hours")}
                </Text>
              </View>
            </View>

            {/* Notes */}
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t("symptomLog.notesPlaceholder")}
              placeholderTextColor={theme.colors.muted}
              multiline
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                minHeight: 80,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink,
                fontFamily: "Inter_400Regular",
                lineHeight: mobileTheme.typography.body.lineHeight,
                textAlignVertical: "top"
              }}
            />

            <Pressable
              onPress={() => createMutation.mutate()}
              disabled={!canSave || createMutation.isPending}
              style={{
                backgroundColor: canSave
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
                    {t("symptomLog.saveEntry")}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {logsQuery.isLoading ? (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <LottieLoading size={70} />
          </View>
        ) : logs.length === 0 ? (
          <View
            style={{
              paddingVertical: mobileTheme.spacing["4xl"],
              alignItems: "center",
              gap: mobileTheme.spacing.lg
            }}
          >
            <AlertTriangle size={48} color={theme.colors.muted} />
            <Text
              style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                fontWeight: mobileTheme.typography.subheading.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {t("symptomLog.empty")}
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
              {t("symptomLog.emptyDescription")}
            </Text>
          </View>
        ) : (
          <View style={{ gap: mobileTheme.spacing.md }}>
            {logs.map((log) => (
              <View
                key={log.id}
                style={{
                  backgroundColor: theme.colors.white,
                  borderRadius: mobileTheme.radius.lg,
                  padding: mobileTheme.spacing.lg,
                  gap: mobileTheme.spacing.sm,
                  ...mobileTheme.shadow.sm
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6
                    }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: severityColor(log.severity, theme)
                      }}
                    />
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.caption.fontSize,
                        fontWeight: "700",
                        color: severityColor(log.severity, theme),
                        fontFamily: "Inter_700Bold"
                      }}
                    >
                      {t(SEVERITY_LABELS[log.severity] ?? "symptomLog.severity1")}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.caption.fontSize,
                        color: theme.colors.muted,
                        fontFamily: "Inter_400Regular"
                      }}
                    >
                      {relativeTime(log.occurredAt)}
                    </Text>
                    <Pressable
                      onPress={() => confirmDelete(log.id)}
                      hitSlop={8}
                    >
                      <Trash2 size={14} color={theme.colors.muted} />
                    </Pressable>
                  </View>
                </View>

                {log.categories.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {log.categories.map((cat) => {
                      const meta = SYMPTOM_CATEGORIES.find((c) => c.key === cat);
                      return (
                        <View
                          key={cat}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: mobileTheme.radius.pill,
                            backgroundColor: theme.colors.background
                          }}
                        >
                          {meta ? (
                            <Text style={{ fontSize: 12 }}>{meta.emoji}</Text>
                          ) : null}
                          <Text
                            style={{
                              fontSize: 11,
                              color: theme.colors.ink,
                              fontFamily: "Inter_500Medium"
                            }}
                          >
                            {t(`symptomLog.cat_${cat}`, { defaultValue: cat })}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {log.durationHours && log.durationHours > 0 ? (
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.caption.fontSize,
                      color: theme.colors.muted,
                      fontFamily: "Inter_400Regular"
                    }}
                  >
                    {t("symptomLog.lasted", { hours: log.durationHours })}
                  </Text>
                ) : null}

                {log.notes ? (
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.body.fontSize,
                      color: theme.colors.ink,
                      fontFamily: "Inter_400Regular",
                      lineHeight: mobileTheme.typography.body.lineHeight
                    }}
                  >
                    {log.notes}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function severityColor(severity: number, theme: ReturnType<typeof useTheme>): string {
  if (severity >= 5) return theme.colors.danger;
  if (severity >= 4) return "#D97706"; // amber
  if (severity >= 3) return "#C48A3F"; // accent gold
  if (severity >= 2) return "#5B9BD5"; // blue
  return theme.colors.success;
}
