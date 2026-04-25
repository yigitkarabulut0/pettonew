import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { ArrowLeft, Check, Plus, ShieldAlert, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { LottieLoading } from "@/components/lottie-loading";
import { getHealthProfile, upsertHealthProfile } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

// Curated quick-add chips so users can tap to add common allergies / dietary
// rules without typing. Power users still get the free-text input.
const COMMON_ALLERGIES = [
  "Chicken",
  "Beef",
  "Wheat",
  "Dairy",
  "Eggs",
  "Fish",
  "Soy",
  "Pollen",
  "Fleas"
];
const COMMON_DIETS = [
  "Grain-free",
  "Low-fat",
  "Hypoallergenic",
  "Senior",
  "Puppy / Kitten",
  "Prescription"
];

export default function HealthProfilePage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const token = session?.tokens.accessToken ?? "";

  const [allergies, setAllergies] = useState<string[]>([]);
  const [diets, setDiets] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [allergyDraft, setAllergyDraft] = useState("");
  const [dietDraft, setDietDraft] = useState("");

  const profileQuery = useQuery({
    queryKey: ["health-profile", petId],
    queryFn: () => getHealthProfile(token, petId!),
    enabled: Boolean(token && petId)
  });

  // Hydrate local form state once when the server profile arrives.
  useEffect(() => {
    if (profileQuery.data) {
      setAllergies(profileQuery.data.allergies ?? []);
      setDiets(profileQuery.data.dietaryRestrictions ?? []);
      setNotes(profileQuery.data.emergencyNotes ?? "");
    }
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertHealthProfile(token, petId!, {
        allergies,
        dietaryRestrictions: diets,
        emergencyNotes: notes.trim()
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["health-profile", petId] });
      router.back();
    }
  });

  const addItem = (
    list: string[],
    setter: (next: string[]) => void,
    raw: string
  ) => {
    const value = raw.trim();
    if (!value) return;
    if (list.some((v) => v.toLowerCase() === value.toLowerCase())) return;
    setter([...list, value]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const removeItem = (
    list: string[],
    setter: (next: string[]) => void,
    value: string
  ) => {
    setter(list.filter((v) => v !== value));
  };

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
            {t("healthProfile.title")}
          </Text>
          <Text
            style={{
              fontSize: mobileTheme.typography.caption.fontSize,
              color: theme.colors.muted,
              fontFamily: "Inter_400Regular"
            }}
            numberOfLines={1}
          >
            {t("healthProfile.subtitle")}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingTop: mobileTheme.spacing.xl,
          paddingBottom: insets.bottom + 96
        }}
        keyboardShouldPersistTaps="handled"
      >
        {profileQuery.isLoading ? (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <LottieLoading size={70} />
          </View>
        ) : (
          <>
            {/* Hero — explains why this screen matters at a glance. */}
            <View
              style={{
                flexDirection: "row",
                gap: mobileTheme.spacing.md,
                padding: mobileTheme.spacing.lg,
                marginBottom: mobileTheme.spacing.xl,
                borderRadius: mobileTheme.radius.lg,
                backgroundColor: theme.colors.dangerBg,
                borderWidth: 1,
                borderColor: theme.colors.danger + "33"
              }}
            >
              <ShieldAlert size={20} color={theme.colors.danger} />
              <Text
                style={{
                  flex: 1,
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.danger,
                  fontFamily: "Inter_500Medium",
                  lineHeight: 18
                }}
              >
                {t("healthProfile.heroDescription")}
              </Text>
            </View>

            {/* Allergies */}
            <ChipSection
              title={t("healthProfile.allergies")}
              description={t("healthProfile.allergiesDescription")}
              suggestions={COMMON_ALLERGIES}
              values={allergies}
              draft={allergyDraft}
              setDraft={setAllergyDraft}
              onAdd={(raw) => addItem(allergies, setAllergies, raw)}
              onRemove={(v) => removeItem(allergies, setAllergies, v)}
              theme={theme}
              t={t}
            />

            {/* Dietary restrictions */}
            <ChipSection
              title={t("healthProfile.dietaryRestrictions")}
              description={t("healthProfile.dietaryRestrictionsDescription")}
              suggestions={COMMON_DIETS}
              values={diets}
              draft={dietDraft}
              setDraft={setDietDraft}
              onAdd={(raw) => addItem(diets, setDiets, raw)}
              onRemove={(v) => removeItem(diets, setDiets, v)}
              theme={theme}
              t={t}
            />

            {/* Emergency notes */}
            <View style={{ marginTop: mobileTheme.spacing.xl, gap: mobileTheme.spacing.sm }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                  fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {t("healthProfile.emergencyNotes")}
              </Text>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_400Regular"
                }}
              >
                {t("healthProfile.emergencyNotesDescription")}
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder={t("healthProfile.emergencyNotesPlaceholder")}
                placeholderTextColor={theme.colors.muted}
                multiline
                style={{
                  marginTop: mobileTheme.spacing.sm,
                  backgroundColor: theme.colors.white,
                  borderRadius: mobileTheme.radius.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  padding: mobileTheme.spacing.lg,
                  minHeight: 96,
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.ink,
                  fontFamily: "Inter_400Regular",
                  lineHeight: mobileTheme.typography.body.lineHeight,
                  textAlignVertical: "top"
                }}
              />
            </View>
          </>
        )}
      </ScrollView>

      {/* Save bar — pinned at the bottom so the primary action stays in
          reach without scrolling, even on long forms. */}
      {!profileQuery.isLoading && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingTop: mobileTheme.spacing.md,
            paddingBottom: insets.bottom + mobileTheme.spacing.md,
            backgroundColor: theme.colors.white,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border
          }}
        >
          <Pressable
            onPress={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            style={{
              backgroundColor: theme.colors.primary,
              opacity: saveMutation.isPending ? 0.6 : 1,
              borderRadius: mobileTheme.radius.md,
              paddingVertical: mobileTheme.spacing.md + 2,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: mobileTheme.spacing.sm
            }}
          >
            {saveMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Check size={18} color="#FFFFFF" />
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontWeight: "700",
                    fontSize: mobileTheme.typography.body.fontSize,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {t("healthProfile.save")}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

interface ChipSectionProps {
  title: string;
  description: string;
  suggestions: string[];
  values: string[];
  draft: string;
  setDraft: (v: string) => void;
  onAdd: (raw: string) => void;
  onRemove: (v: string) => void;
  theme: ReturnType<typeof useTheme>;
  t: (key: string) => string;
}

function ChipSection({
  title,
  description,
  suggestions,
  values,
  draft,
  setDraft,
  onAdd,
  onRemove,
  theme,
  t
}: ChipSectionProps) {
  return (
    <View style={{ marginBottom: mobileTheme.spacing.xl, gap: mobileTheme.spacing.sm }}>
      <Text
        style={{
          fontSize: mobileTheme.typography.bodySemiBold.fontSize,
          fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
          color: theme.colors.ink,
          fontFamily: "Inter_700Bold"
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: mobileTheme.typography.caption.fontSize,
          color: theme.colors.muted,
          fontFamily: "Inter_400Regular"
        }}
      >
        {description}
      </Text>

      {/* Selected chips */}
      {values.length > 0 && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: mobileTheme.spacing.sm,
            marginTop: mobileTheme.spacing.sm
          }}
        >
          {values.map((v) => (
            <Pressable
              key={v}
              onPress={() => onRemove(v)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: theme.colors.primaryBg,
                borderWidth: 1,
                borderColor: theme.colors.primary + "55"
              }}
            >
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  fontWeight: "600",
                  color: theme.colors.primary,
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                {v}
              </Text>
              <X size={12} color={theme.colors.primary} />
            </Pressable>
          ))}
        </View>
      )}

      {/* Free-text composer */}
      <View
        style={{
          flexDirection: "row",
          gap: mobileTheme.spacing.sm,
          marginTop: mobileTheme.spacing.sm
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t("healthProfile.addPlaceholder")}
          placeholderTextColor={theme.colors.muted}
          onSubmitEditing={() => {
            onAdd(draft);
            setDraft("");
          }}
          returnKeyType="done"
          style={{
            flex: 1,
            backgroundColor: theme.colors.white,
            borderRadius: mobileTheme.radius.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingHorizontal: mobileTheme.spacing.lg,
            paddingVertical: 10,
            fontSize: mobileTheme.typography.body.fontSize,
            color: theme.colors.ink,
            fontFamily: "Inter_400Regular"
          }}
        />
        <Pressable
          onPress={() => {
            onAdd(draft);
            setDraft("");
          }}
          disabled={!draft.trim()}
          style={{
            width: 44,
            backgroundColor: draft.trim() ? theme.colors.primary : theme.colors.border,
            borderRadius: mobileTheme.radius.md,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Plus size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Suggestion chips — only show ones not already selected */}
      {(() => {
        const remaining = suggestions.filter(
          (s) => !values.some((v) => v.toLowerCase() === s.toLowerCase())
        );
        if (remaining.length === 0) return null;
        return (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              marginTop: mobileTheme.spacing.sm
            }}
          >
            {remaining.map((s) => (
              <Pressable
                key={s}
                onPress={() => onAdd(s)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: theme.colors.background,
                  borderWidth: 1,
                  borderColor: theme.colors.border
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.muted,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  + {s}
                </Text>
              </Pressable>
            ))}
          </View>
        );
      })()}
    </View>
  );
}
