import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
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
import { LottieLoading } from "@/components/lottie-loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CalendarDays, HeartPulse, Plus, Trash2 } from "lucide-react-native";

import { listHealthRecords, createHealthRecord } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const RECORD_TYPES = ["vaccine", "checkup", "surgery", "other"] as const;

function typeBadgeColor(type: string, colors: ReturnType<typeof useTheme>["colors"]) {
  switch (type) {
    case "vaccine":
      return { bg: colors.successBg, text: colors.success };
    case "checkup":
      return { bg: colors.primaryBg, text: colors.primary };
    case "surgery":
      return { bg: colors.dangerBg, text: colors.danger };
    default:
      return { bg: colors.secondarySoft, text: colors.secondary };
  }
}

export default function PetHealthPage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();

  const [composerOpen, setComposerOpen] = useState(false);
  const [type, setType] = useState<"vaccine" | "checkup" | "surgery" | "other">("vaccine");
  const [title, setTitle] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState("");
  const [selectedNextDueDate, setSelectedNextDueDate] = useState<Date | null>(null);
  const [showNextDuePicker, setShowNextDuePicker] = useState(false);

  const token = session?.tokens.accessToken ?? "";

  const healthQuery = useQuery({
    queryKey: ["health-records", petId],
    queryFn: () => listHealthRecords(token, petId!),
    enabled: Boolean(token && petId)
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createHealthRecord(token, petId!, {
        type,
        title: title.trim(),
        date: selectedDate.toISOString(),
        notes: notes.trim(),
        nextDueDate: selectedNextDueDate ? selectedNextDueDate.toISOString() : undefined
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health-records", petId] });
      setTitle("");
      setSelectedDate(new Date());
      setNotes("");
      setSelectedNextDueDate(null);
      setType("vaccine");
      setComposerOpen(false);
    }
  });

  const onRefresh = useCallback(() => {
    healthQuery.refetch();
  }, [healthQuery]);

  const records = healthQuery.data ?? [];

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
              color: theme.colors.ink
            }}
          >
            Health Records
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
            refreshing={healthQuery.isRefetching}
            onRefresh={onRefresh}
            tintColor="#F48C28"
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
                color: theme.colors.ink
              }}
            >
              New Health Record
            </Text>

            {/* Type Selector */}
            <View style={{ gap: mobileTheme.spacing.sm }}>
              <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.muted }}>Type</Text>
              <View style={{ flexDirection: "row", gap: mobileTheme.spacing.sm, flexWrap: "wrap" }}>
                {RECORD_TYPES.map((t) => {
                  const badge = typeBadgeColor(t, theme.colors);
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setType(t)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: mobileTheme.radius.pill,
                        backgroundColor: type === t ? badge.bg : theme.colors.background,
                        borderWidth: 1,
                        borderColor: type === t ? badge.text : theme.colors.border
                      }}
                    >
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.caption.fontSize,
                          fontWeight: type === t ? "600" : "400",
                          color: type === t ? badge.text : theme.colors.ink,
                          textTransform: "capitalize"
                        }}
                      >
                        {t}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title (e.g. Rabies Vaccine)"
              placeholderTextColor={theme.colors.muted}
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink
              }}
            />

            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                flexDirection: "row",
                alignItems: "center",
                gap: mobileTheme.spacing.sm
              }}
            >
              <CalendarDays size={16} color={theme.colors.muted} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.ink
                }}
              >
                {selectedDate.toLocaleDateString()}
              </Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_event, date) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (date) setSelectedDate(date);
                }}
              />
            )}

            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes"
              placeholderTextColor={theme.colors.muted}
              multiline
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                minHeight: 80,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink,
                textAlignVertical: "top"
              }}
            />

            <Pressable
              onPress={() => setShowNextDuePicker(true)}
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                flexDirection: "row",
                alignItems: "center",
                gap: mobileTheme.spacing.sm
              }}
            >
              <CalendarDays size={16} color={theme.colors.muted} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: selectedNextDueDate ? theme.colors.ink : theme.colors.muted
                }}
              >
                {selectedNextDueDate ? selectedNextDueDate.toLocaleDateString() : "Next Due Date (optional)"}
              </Text>
            </Pressable>
            {showNextDuePicker && (
              <DateTimePicker
                value={selectedNextDueDate ?? new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={new Date()}
                onChange={(_event, date) => {
                  setShowNextDuePicker(Platform.OS === "ios");
                  if (date) setSelectedNextDueDate(date);
                }}
              />
            )}

            <Pressable
              onPress={() => createMutation.mutate()}
              disabled={!title.trim() || createMutation.isPending}
              style={{
                backgroundColor: title.trim() ? theme.colors.primary : theme.colors.border,
                borderRadius: mobileTheme.radius.md,
                paddingVertical: mobileTheme.spacing.md,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: mobileTheme.typography.body.fontSize }}>
                  Save Record
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Loading */}
        {healthQuery.isLoading && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <LottieLoading size={70} />
          </View>
        )}

        {/* Empty */}
        {!healthQuery.isLoading && records.length === 0 && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center", gap: mobileTheme.spacing.lg }}>
            <HeartPulse size={48} color={theme.colors.muted} />
            <Text style={{ fontSize: mobileTheme.typography.subheading.fontSize, fontWeight: mobileTheme.typography.subheading.fontWeight, color: theme.colors.ink }}>
              No health records yet
            </Text>
            <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.muted, textAlign: "center", paddingHorizontal: mobileTheme.spacing["3xl"] }}>
              Tap the + button to add your first health record.
            </Text>
          </View>
        )}

        {/* Records */}
        {records.map((record) => {
          const badge = typeBadgeColor(record.type, theme.colors);
          return (
            <View
              key={record.id}
              style={{
                backgroundColor: theme.colors.white,
                borderRadius: mobileTheme.radius.lg,
                padding: mobileTheme.spacing.xl,
                marginBottom: mobileTheme.spacing.md,
                gap: mobileTheme.spacing.sm,
                ...mobileTheme.shadow.sm
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View
                  style={{
                    backgroundColor: badge.bg,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: mobileTheme.radius.pill
                  }}
                >
                  <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontWeight: "600", color: badge.text, textTransform: "capitalize" }}>
                    {record.type}
                  </Text>
                </View>
                <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.muted }}>
                  {new Date(record.date).toLocaleDateString()}
                </Text>
              </View>
              <Text style={{ fontSize: mobileTheme.typography.bodySemiBold.fontSize, fontWeight: "600", color: theme.colors.ink }}>
                {record.title}
              </Text>
              {record.notes ? (
                <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.muted, lineHeight: mobileTheme.typography.body.lineHeight }}>
                  {record.notes}
                </Text>
              ) : null}
              {record.nextDueDate ? (
                <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.primary }}>
                  Next due: {new Date(record.nextDueDate).toLocaleDateString()}
                </Text>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
