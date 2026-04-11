import { useMutation } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { FieldError } from "react-hook-form";
import { Text, TextInput, View } from "react-native";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { AnimatedLogo } from "@/components/animated-logo";
import { PrimaryButton } from "@/components/primary-button";
import { ScreenShell } from "@/components/screen-shell";
import { signUp } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const schema = z
  .object({
    email: z.string().email("Please enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(8, "Please confirm your password.")
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"]
  });

type SignUpValues = z.infer<typeof schema>;

export default function SignUpPage() {
  const theme = useTheme();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const setSession = useSessionStore((state) => state.setSession);
  const setPetCount = useSessionStore((state) => state.setPetCount);
  const setActivePetId = useSessionStore((state) => state.setActivePetId);
  const {
    control,
    handleSubmit,
    formState: { errors }
  } = useForm<SignUpValues>({
    defaultValues: { email: "", password: "", confirmPassword: "" },
    resolver: zodResolver(schema)
  });

  const mutation = useMutation({
    mutationFn: async (values: SignUpValues) =>
      signUp(values.email, values.password),
    onSuccess: (session) => {
      setSession(session);
      setPetCount(0);
      setActivePetId(null);
      router.replace("/(app)/onboarding/location");
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to sign up."
      );
    }
  });

  return (
    <ScreenShell
      eyebrow="Create account"
      title="Join Pett."
      subtitle="Create your account and start matching pets near you."
    >
      <View style={{ alignItems: "center", marginBottom: mobileTheme.spacing.md }}>
        <AnimatedLogo size="sm" />
      </View>
      <View
        style={{
          gap: mobileTheme.spacing.lg,
          padding: mobileTheme.spacing.xl,
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: theme.colors.white,
          borderWidth: 1,
          borderColor: theme.colors.border,
          ...mobileTheme.shadow.sm
        }}
      >
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <FieldShell error={errors.email} colors={theme.colors}>
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="next"
                placeholder="Email"
                placeholderTextColor={theme.colors.muted}
                value={value}
                onChangeText={(nextValue) => {
                  setErrorMessage(null);
                  onChange(nextValue);
                }}
                style={getInputStyle(Boolean(errors.email), theme.colors)}
              />
            </FieldShell>
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <FieldShell error={errors.password} colors={theme.colors}>
              <TextInput
                secureTextEntry
                textContentType="oneTimeCode"
                autoComplete="off"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="next"
                placeholder="Password"
                placeholderTextColor={theme.colors.muted}
                value={value}
                onChangeText={(nextValue) => {
                  setErrorMessage(null);
                  onChange(nextValue);
                }}
                style={getInputStyle(Boolean(errors.password), theme.colors)}
              />
            </FieldShell>
          )}
        />
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, value } }) => (
            <FieldShell error={errors.confirmPassword} colors={theme.colors}>
              <TextInput
                secureTextEntry
                textContentType="oneTimeCode"
                autoComplete="off"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="done"
                placeholder="Confirm password"
                placeholderTextColor={theme.colors.muted}
                value={value}
                onChangeText={(nextValue) => {
                  setErrorMessage(null);
                  onChange(nextValue);
                }}
                style={getInputStyle(Boolean(errors.confirmPassword), theme.colors)}
              />
            </FieldShell>
          )}
        />
        {errorMessage ? (
          <Text
            style={{
              color: theme.colors.danger,
              fontSize: mobileTheme.typography.caption.fontSize,
              fontFamily: "Inter_600SemiBold",
              fontWeight: "600"
            }}
          >
            {errorMessage}
          </Text>
        ) : null}
        <PrimaryButton
          label={mutation.isPending ? "Creating..." : "Create account"}
          onPress={handleSubmit(
            (values) => {
              setErrorMessage(null);
              mutation.mutate(values);
            },
            () => {
              setErrorMessage(
                "Please fix the highlighted fields and try again."
              );
            }
          )}
        />
      </View>
      <Text
        style={{
          color: theme.colors.muted,
          lineHeight: mobileTheme.typography.body.lineHeight,
          fontSize: mobileTheme.typography.body.fontSize,
          fontFamily: "Inter_400Regular"
        }}
      >
        Already have an account?{" "}
        <Link
          href="/(auth)/sign-in"
          style={{ color: theme.colors.primary, fontWeight: "700" }}
        >
          Sign in
        </Link>
      </Text>
    </ScreenShell>
  );
}

function FieldShell({
  children,
  error,
  colors
}: {
  children: React.ReactNode;
  error?: FieldError;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={{ gap: mobileTheme.spacing.xs }}>
      {children}
      {error?.message ? (
        <Text
          style={{
            color: colors.danger,
            fontSize: 12,
            fontWeight: "600",
            fontFamily: "Inter_600SemiBold"
          }}
        >
          {error.message}
        </Text>
      ) : null}
    </View>
  );
}

function getInputStyle(hasError: boolean, colors: ReturnType<typeof useTheme>["colors"]) {
  return {
    borderRadius: mobileTheme.radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: hasError
      ? colors.danger
      : colors.border,
    paddingHorizontal: mobileTheme.spacing.lg,
    paddingVertical: mobileTheme.spacing.md + 3,
    color: colors.ink,
    fontSize: mobileTheme.typography.body.fontSize,
    fontFamily: "Inter_400Regular"
  } as const;
}
