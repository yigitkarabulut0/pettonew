import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react-native";

import { PrimaryButton } from "@/components/primary-button";
import { submitReport } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const REPORT_REASONS = [
  { value: "harassment", labelKey: "report.harassment" },
  { value: "spam", labelKey: "report.spam" },
  { value: "inappropriate", labelKey: "report.inappropriate" },
  { value: "fake_profile", labelKey: "report.fakeProfile" },
  { value: "other", labelKey: "report.other" }
] as const;

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  targetType: "chat" | "pet" | "post";
  targetID: string;
  targetLabel: string;
}

export function ReportModal({
  visible,
  onClose,
  targetType,
  targetID,
  targetLabel
}: ReportModalProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const session = useSessionStore((state) => state.session);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      if (!session) throw new Error("No session");
      const reason =
        selectedReason === "other"
          ? description.trim() || "Other"
          : (selectedReason ?? "Other");
      return submitReport(
        session.tokens.accessToken,
        reason,
        targetType,
        targetID,
        targetLabel
      );
    },
    onSuccess: (data: any) => {
      const isUpdated = data?.updated === true;
      const msg = isUpdated ? t("report.updated") : t("report.submitted");
      Alert.alert(t("report.successTitle"), msg);
      setSelectedReason(null);
      setDescription("");
      onClose();
    }
  });

  const handleClose = () => {
    if (mutation.isPending) return;
    setSelectedReason(null);
    setDescription("");
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: insets.top + mobileTheme.spacing.md,
            paddingBottom: mobileTheme.spacing.md,
            paddingHorizontal: mobileTheme.spacing.xl
          }}
        >
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text
              style={{
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}
            >
              {t("common.cancel")}
            </Text>
          </Pressable>
          <Text
            style={{
              fontSize: mobileTheme.typography.heading.fontSize,
              fontWeight: mobileTheme.typography.heading.fontWeight,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            {t("report.title")}
          </Text>
          <View style={{ width: 48 }} />
        </View>

        <View
          style={{
            flex: 1,
            paddingHorizontal: mobileTheme.spacing.xl,
            gap: mobileTheme.spacing.xl,
            paddingBottom: insets.bottom + 24
          }}
        >
          <Text
            style={{
              color: theme.colors.muted,
              fontSize: mobileTheme.typography.body.fontSize,
              fontFamily: "Inter_400Regular"
            }}
          >
            {t("report.reason", { type: targetType })}
          </Text>

          <View style={{ gap: mobileTheme.spacing.sm }}>
            {REPORT_REASONS.map((item) => {
              const isActive = selectedReason === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => setSelectedReason(item.value)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: isActive
                      ? theme.colors.primaryBg
                      : theme.colors.white,
                    borderRadius: mobileTheme.radius.lg,
                    borderWidth: 1,
                    borderColor: isActive
                      ? theme.colors.primary
                      : theme.colors.border,
                    paddingHorizontal: mobileTheme.spacing.lg,
                    paddingVertical: mobileTheme.spacing.md,
                    opacity: pressed ? 0.85 : 1,
                    ...mobileTheme.shadow.sm
                  })}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 2,
                      borderColor: isActive
                        ? theme.colors.primary
                        : theme.colors.border,
                      backgroundColor: isActive
                        ? theme.colors.primary
                        : "transparent",
                      marginRight: mobileTheme.spacing.md,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    {isActive && (
                      <Text
                        style={{
                          color: theme.colors.white,
                          fontSize: 12,
                          fontWeight: "700",
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: mobileTheme.typography.body.fontSize,
                      color: isActive
                        ? theme.colors.primary
                        : theme.colors.ink,
                      fontFamily: "Inter_500Medium",
                      fontWeight: isActive ? "600" : "400"
                    }}
                  >
                    {t(item.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selectedReason === "other" && (
            <View style={{ gap: mobileTheme.spacing.sm }}>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={t("report.descriptionPlaceholder")}
                placeholderTextColor={theme.colors.muted}
                multiline
                maxLength={300}
                style={{
                  minHeight: 100,
                  borderRadius: mobileTheme.radius.lg,
                  backgroundColor: theme.colors.white,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  paddingHorizontal: mobileTheme.spacing.lg,
                  paddingVertical: mobileTheme.spacing.md,
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.ink,
                  fontFamily: "Inter_400Regular",
                  lineHeight: mobileTheme.typography.body.lineHeight,
                  textAlignVertical: "top"
                }}
              />
            </View>
          )}

          <View style={{ marginTop: "auto" }}>
            <PrimaryButton
              label={mutation.isPending ? t("report.submitting") : t("report.submit")}
              onPress={() => mutation.mutate()}
              disabled={!selectedReason || mutation.isPending}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
