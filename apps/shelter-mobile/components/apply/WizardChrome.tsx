// Shared wizard chrome — safe-area wrapper + sticky footer with back/next
// buttons. Lets each step screen focus on its own fields without
// re-implementing layout boilerplate.

import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, ArrowRight } from "lucide-react-native";

import { Stepper } from "@/components/apply/Stepper";
import { theme } from "@/lib/theme";

const STEP_LABELS = ["Entity", "Docs", "Org", "Contact", "Review"];

type Props = {
  stepIndex: number; // 0..4
  title: string;
  eyebrow: string;
  description?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  hideBack?: boolean;
};

export function WizardChrome({
  stepIndex,
  title,
  eyebrow,
  description,
  children,
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
  hideBack
}: Props) {
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <Stepper steps={STEP_LABELS} current={stepIndex} />
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 24,
            paddingBottom: 40,
            gap: 20
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: theme.colors.primary,
                letterSpacing: 1.6,
                textTransform: "uppercase"
              }}
            >
              {eyebrow}
            </Text>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "700",
                color: theme.colors.ink
              }}
            >
              {title}
            </Text>
            {description && (
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.muted,
                  lineHeight: 20
                }}
              >
                {description}
              </Text>
            )}
          </View>
          {children}
        </ScrollView>
        {onNext && (
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              padding: 16,
              paddingBottom: Platform.OS === "ios" ? 0 : 16,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              backgroundColor: "#FFFFFF"
            }}
          >
            {!hideBack && (
              <Pressable
                onPress={onBack}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingHorizontal: 18,
                  height: 48,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.8 : 1
                })}
              >
                <ArrowLeft size={16} color={theme.colors.ink} />
                <Text style={{ fontWeight: "600", color: theme.colors.ink }}>
                  Back
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={onNext}
              disabled={nextDisabled}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                height: 48,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.primary,
                opacity: nextDisabled ? 0.5 : pressed ? 0.9 : 1
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                {nextLabel}
              </Text>
              <ArrowRight size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: "700",
        color: theme.colors.muted,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        marginBottom: 6
      }}
    >
      {children}
    </Text>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text style={{ marginTop: 6, fontSize: 12, color: theme.colors.danger }}>
      {message}
    </Text>
  );
}

export const inputStyle = {
  height: 46,
  borderWidth: 1,
  borderColor: theme.colors.border,
  borderRadius: theme.radius.md,
  paddingHorizontal: 12,
  backgroundColor: "#FFFFFF",
  color: theme.colors.ink,
  fontSize: 14
} as const;
