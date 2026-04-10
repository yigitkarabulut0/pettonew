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
import { ArrowLeft, Clock, Plus, UtensilsCrossed } from "lucide-react-native";

import { listFeedingSchedules, createFeedingSchedule } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function FeedingPage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();

  const [composerOpen, setComposerOpen] = useState(false);
  const [mealName, setMealName] = useState("");
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [foodType, setFoodType] = useState("");
  const [amount, setAmount] = useState("");

  const token = session?.tokens.accessToken ?? "";

  const feedingQuery = useQuery({
    queryKey: ["feeding-schedules", petId],
    queryFn: () => listFeedingSchedules(token, petId!),
    enabled: Boolean(token && petId)
  });

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const createMutation = useMutation({
    mutationFn: () =>
      createFeedingSchedule(token, petId!, {
        mealName: mealName.trim(),
        time: formatTime(selectedTime),
        foodType: foodType.trim(),
        amount: amount.trim(),
        notes: ""
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeding-schedules", petId] });
      setMealName("");
      setSelectedTime(new Date());
      setFoodType("");
      setAmount("");
      setComposerOpen(false);
    }
  });

  const onRefresh = useCallback(() => {
    feedingQuery.refetch();
  }, [feedingQuery]);

  const schedules = feedingQuery.data ?? [];

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
            Feeding Schedule
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
            refreshing={feedingQuery.isRefetching}
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
              New Feeding Schedule
            </Text>

            <TextInput
              value={mealName}
              onChangeText={setMealName}
              placeholder="Meal Name (e.g. Breakfast)"
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
              onPress={() => setShowTimePicker(true)}
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                flexDirection: "row",
                alignItems: "center",
                gap: mobileTheme.spacing.sm
              }}
            >
              <Clock size={16} color={theme.colors.muted} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.ink
                }}
              >
                {formatTime(selectedTime)}
              </Text>
            </Pressable>
            {showTimePicker && (
              <DateTimePicker
                value={selectedTime}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_event, date) => {
                  setShowTimePicker(Platform.OS === "ios");
                  if (date) setSelectedTime(date);
                }}
              />
            )}

            <TextInput
              value={foodType}
              onChangeText={setFoodType}
              placeholder="Food Type (e.g. Dry Kibble)"
              placeholderTextColor={theme.colors.muted}
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink
              }}
            />

            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="Amount (e.g. 1 cup)"
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
              onPress={() => createMutation.mutate()}
              disabled={!mealName.trim() || createMutation.isPending}
              style={{
                backgroundColor: mealName.trim() ? theme.colors.primary : theme.colors.border,
                borderRadius: mobileTheme.radius.md,
                paddingVertical: mobileTheme.spacing.md,
                alignItems: "center"
              }}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: mobileTheme.typography.body.fontSize }}>
                  Save Schedule
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Loading */}
        {feedingQuery.isLoading && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <LottieLoading size={70} />
          </View>
        )}

        {/* Empty */}
        {!feedingQuery.isLoading && schedules.length === 0 && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center", gap: mobileTheme.spacing.lg }}>
            <UtensilsCrossed size={48} color={theme.colors.muted} />
            <Text style={{ fontSize: mobileTheme.typography.subheading.fontSize, fontWeight: mobileTheme.typography.subheading.fontWeight, color: theme.colors.ink }}>
              No feeding schedules yet
            </Text>
            <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.muted, textAlign: "center", paddingHorizontal: mobileTheme.spacing["3xl"] }}>
              Tap the + button to create a feeding schedule.
            </Text>
          </View>
        )}

        {/* Schedules */}
        {schedules.map((schedule) => (
          <View
            key={schedule.id}
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
              <Text style={{ fontSize: mobileTheme.typography.bodySemiBold.fontSize, fontWeight: "600", color: theme.colors.ink }}>
                {schedule.mealName}
              </Text>
              <View
                style={{
                  backgroundColor: theme.colors.primaryBg,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: mobileTheme.radius.pill
                }}
              >
                <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontWeight: "600", color: theme.colors.primary }}>
                  {schedule.time}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.muted }}>
              {schedule.foodType} - {schedule.amount}
            </Text>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
