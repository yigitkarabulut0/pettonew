import { useMutation } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { FieldError } from "react-hook-form";
import { Text, TextInput, View } from "react-native";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { PrimaryButton } from "@/components/primary-button";
import { ScreenShell } from "@/components/screen-shell";
import { signUp } from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
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
      title="Join Petto."
      subtitle="Create your account and start matching pets near you."
    >
      <View
        style={{
          gap: mobileTheme.spacing.lg,
          padding: mobileTheme.spacing.xl,
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: mobileTheme.colors.white,
          borderWidth: 1,
          borderColor: mobileTheme.colors.border,
          ...mobileTheme.shadow.sm
        }}
      >
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <FieldShell error={errors.email}>
              <TextInput
                autoCapitalize="none"
                placeholder="Email"
                placeholderTextColor={mobileTheme.colors.muted}
                value={value}
                onChangeText={(nextValue) => {
                  setErrorMessage(null);
                  onChange(nextValue);
                }}
                style={getInputStyle(Boolean(errors.email))}
              />
            </FieldShell>
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <FieldShell error={errors.password}>
              <TextInput
                secureTextEntry
                placeholder="Password"
                placeholderTextColor={mobileTheme.colors.muted}
                value={value}
                onChangeText={(nextValue) => {
                  setErrorMessage(null);
                  onChange(nextValue);
                }}
                style={getInputStyle(Boolean(errors.password))}
              />
            </FieldShell>
          )}
        />
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, value } }) => (
            <FieldShell error={errors.confirmPassword}>
              <TextInput
                secureTextEntry
                placeholder="Confirm password"
                placeholderTextColor={mobileTheme.colors.muted}
                value={value}
                onChangeText={(nextValue) => {
                  setErrorMessage(null);
                  onChange(nextValue);
                }}
                style={getInputStyle(Boolean(errors.confirmPassword))}
              />
            </FieldShell>
          )}
        />
        {errorMessage ? (
          <Text
            style={{
              color: mobileTheme.colors.danger,
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
          color: mobileTheme.colors.muted,
          lineHeight: mobileTheme.typography.body.lineHeight,
          fontSize: mobileTheme.typography.body.fontSize,
          fontFamily: "Inter_400Regular"
        }}
      >
        Already have an account?{" "}
        <Link
          href="/(auth)/sign-in"
          style={{ color: mobileTheme.colors.primary, fontWeight: "700" }}
        >
          Sign in
        </Link>
      </Text>
    </ScreenShell>
  );
}

function FieldShell({
  children,
  error
}: {
  children: React.ReactNode;
  error?: FieldError;
}) {
  return (
    <View style={{ gap: mobileTheme.spacing.xs }}>
      {children}
      {error?.message ? (
        <Text
          style={{
            color: mobileTheme.colors.danger,
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

function getInputStyle(hasError: boolean) {
  return {
    borderRadius: mobileTheme.radius.md,
    backgroundColor: mobileTheme.colors.background,
    borderWidth: 1,
    borderColor: hasError
      ? mobileTheme.colors.danger
      : mobileTheme.colors.border,
    paddingHorizontal: mobileTheme.spacing.lg,
    paddingVertical: mobileTheme.spacing.md + 3,
    color: mobileTheme.colors.ink,
    fontSize: mobileTheme.typography.body.fontSize,
    fontFamily: "Inter_400Regular"
  } as const;
}
