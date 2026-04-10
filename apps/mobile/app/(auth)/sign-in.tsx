import { useMutation } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Text, TextInput, View } from "react-native";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { useTranslation } from "react-i18next";

import { AnimatedLogo } from "@/components/animated-logo";
import { PrimaryButton } from "@/components/primary-button";
import { ScreenShell } from "@/components/screen-shell";
import { listMyPets, signIn } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

type SignInValues = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const setSession = useSessionStore((state) => state.setSession);
  const setPetCount = useSessionStore((state) => state.setPetCount);
  const setActivePetId = useSessionStore((state) => state.setActivePetId);
  const { control, handleSubmit } = useForm<SignInValues>({
    defaultValues: { email: "", password: "" },
    resolver: zodResolver(signInSchema)
  });

  const inputStyle = {
    borderRadius: mobileTheme.radius.md,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: mobileTheme.spacing.lg,
    paddingVertical: mobileTheme.spacing.md + 3,
    color: theme.colors.ink,
    fontSize: mobileTheme.typography.body.fontSize,
    fontFamily: "Inter_400Regular"
  } as const;

  const mutation = useMutation({
    mutationFn: async (values: SignInValues) => {
      const session = await signIn(values.email, values.password);
      const pets = await listMyPets(session.tokens.accessToken);
      return { session, pets };
    },
    onSuccess: ({ session, pets }) => {
      setSession(session);
      setPetCount(pets.length);
      setActivePetId(pets[0]?.id ?? null);
      router.replace("/");
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to sign in."
      );
    }
  });

  return (
    <ScreenShell
      eyebrow="Petto"
      title="Welcome back."
      subtitle="Sign in to continue discovering and matching."
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
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
              placeholder="Email"
              placeholderTextColor={theme.colors.muted}
              value={value}
              onChangeText={onChange}
              style={inputStyle}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <TextInput
              secureTextEntry
              returnKeyType="done"
              placeholder="Password"
              placeholderTextColor={theme.colors.muted}
              value={value}
              onChangeText={onChange}
              style={inputStyle}
            />
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
          label={mutation.isPending ? "Signing in..." : "Sign in"}
          onPress={handleSubmit((values) => mutation.mutate(values))}
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
        Need an account?{" "}
        <Link
          href="/(auth)/sign-up"
          style={{ color: theme.colors.primary, fontWeight: "700" }}
        >
          Create one
        </Link>
      </Text>
    </ScreenShell>
  );
}
