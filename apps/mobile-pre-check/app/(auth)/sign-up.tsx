import { useMutation } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { FieldError } from "react-hook-form";
import { StyleSheet, Text, TextInput, View } from "react-native";
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
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: ""
    },
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
      title="Get started"
      subtitle="Set up your Petto access."
    >
      <View
        style={{
          gap: 14,
          padding: 18,
          borderRadius: 20,
          backgroundColor: mobileTheme.colors.surface
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
                style={errors.email ? styles.inputError : styles.inputDefault}
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
                style={
                  errors.password ? styles.inputError : styles.inputDefault
                }
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
                style={
                  errors.confirmPassword
                    ? styles.inputError
                    : styles.inputDefault
                }
              />
            </FieldShell>
          )}
        />
        {errorMessage ? (
          <Text
            style={{
              color: mobileTheme.colors.danger,
              fontFamily: mobileTheme.fontFamily
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
          lineHeight: 22,
          fontFamily: mobileTheme.fontFamily
        }}
      >
        Already have an account?{" "}
        <Link
          href="/(auth)/sign-in"
          style={{
            color: mobileTheme.colors.secondary,
            fontWeight: "700",
            fontFamily: mobileTheme.fontFamily
          }}
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
    <View style={{ gap: 8 }}>
      {children}
      {error?.message ? (
        <Text
          style={{
            color: mobileTheme.colors.danger,
            fontSize: 13,
            fontWeight: "600",
            fontFamily: mobileTheme.fontFamily
          }}
        >
          {error.message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inputDefault: {
    borderRadius: mobileTheme.radius.md,
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: mobileTheme.colors.ink,
    fontFamily: mobileTheme.fontFamily
  },
  inputError: {
    borderRadius: mobileTheme.radius.md,
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: mobileTheme.colors.ink,
    fontFamily: mobileTheme.fontFamily
  }
});
