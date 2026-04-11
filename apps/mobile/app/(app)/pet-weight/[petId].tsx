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
import { LottieLoading } from "@/components/lottie-loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Plus, TrendingUp } from "lucide-react-native";

import { listWeightEntries, createWeightEntry } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function PetWeightPage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();

  const [composerOpen, setComposerOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState("kg");

  const token = session?.tokens.accessToken ?? "";

  const weightQuery = useQuery({
    queryKey: ["weight-entries", petId],
    queryFn: () => listWeightEntries(token, petId!),
    enabled: Boolean(token && petId)
  });

  const createMutation = useMutation({
    mutationFn: () => createWeightEntry(token, petId!, parseFloat(weight), unit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weight-entries", petId] });
      setWeight("");
      setComposerOpen(false);
    }
  });

  const onRefresh = useCallback(() => {
    weightQuery.refetch();
  }, [weightQuery]);

  const entries = weightQuery.data ?? [];

  // Simple bar chart computation
  const maxWeight = entries.length > 0 ? Math.max(...entries.map((e) => e.weight)) : 1;
  const chartHeight = 120;

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
            Weight Tracking
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
            refreshing={weightQuery.isRefetching}
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
                color: theme.colors.ink
              }}
            >
              Log Weight
            </Text>

            <TextInput
              value={weight}
              onChangeText={setWeight}
              placeholder="Weight"
              placeholderTextColor={theme.colors.muted}
              keyboardType="decimal-pad"
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink
              }}
            />

            {/* Unit Toggle */}
            <View style={{ flexDirection: "row", gap: mobileTheme.spacing.sm }}>
              {["kg", "lbs"].map((u) => (
                <Pressable
                  key={u}
                  onPress={() => setUnit(u)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: mobileTheme.radius.md,
                    backgroundColor: unit === u ? theme.colors.primaryBg : theme.colors.background,
                    borderWidth: 1,
                    borderColor: unit === u ? theme.colors.primary : theme.colors.border,
                    alignItems: "center"
                  }}
                >
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.body.fontSize,
                      fontWeight: unit === u ? "600" : "400",
                      color: unit === u ? theme.colors.primary : theme.colors.ink
                    }}
                  >
                    {u}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={() => createMutation.mutate()}
              disabled={!weight.trim() || isNaN(parseFloat(weight)) || createMutation.isPending}
              style={{
                backgroundColor: weight.trim() && !isNaN(parseFloat(weight)) ? theme.colors.primary : theme.colors.border,
                borderRadius: mobileTheme.radius.md,
                paddingVertical: mobileTheme.spacing.md,
                alignItems: "center"
              }}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: mobileTheme.typography.body.fontSize }}>
                  Save Weight
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Loading */}
        {weightQuery.isLoading && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <LottieLoading size={70} />
          </View>
        )}

        {/* Empty */}
        {!weightQuery.isLoading && entries.length === 0 && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center", gap: mobileTheme.spacing.lg }}>
            <TrendingUp size={48} color={theme.colors.muted} />
            <Text style={{ fontSize: mobileTheme.typography.subheading.fontSize, fontWeight: mobileTheme.typography.subheading.fontWeight, color: theme.colors.ink }}>
              No weight entries yet
            </Text>
            <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.muted, textAlign: "center", paddingHorizontal: mobileTheme.spacing["3xl"] }}>
              Tap the + button to log your pet's weight.
            </Text>
          </View>
        )}

        {/* Bar Chart */}
        {entries.length > 0 && (
          <View
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              padding: mobileTheme.spacing.xl,
              marginBottom: mobileTheme.spacing.xl,
              ...mobileTheme.shadow.sm
            }}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                fontWeight: "600",
                color: theme.colors.ink,
                marginBottom: mobileTheme.spacing.lg
              }}
            >
              Weight History
            </Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", height: chartHeight, gap: 4 }}>
              {entries.slice(-10).map((entry, index) => {
                const barHeight = maxWeight > 0 ? (entry.weight / maxWeight) * chartHeight : 0;
                return (
                  <View key={entry.id || index} style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontSize: 9, color: theme.colors.muted, marginBottom: 4 }}>
                      {entry.weight}
                    </Text>
                    <View
                      style={{
                        width: "80%",
                        height: Math.max(barHeight, 4),
                        backgroundColor: theme.colors.primary,
                        borderRadius: 4
                      }}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Entries List */}
        {entries.map((entry) => (
          <View
            key={entry.id}
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              padding: mobileTheme.spacing.xl,
              marginBottom: mobileTheme.spacing.md,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              ...mobileTheme.shadow.sm
            }}
          >
            <View>
              <Text style={{ fontSize: mobileTheme.typography.bodySemiBold.fontSize, fontWeight: "600", color: theme.colors.ink }}>
                {entry.weight} {entry.unit}
              </Text>
              <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.muted, marginTop: 2 }}>
                {new Date(entry.date).toLocaleDateString()}
              </Text>
            </View>
            <TrendingUp size={20} color={theme.colors.primary} />
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
