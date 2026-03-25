import { useMutation } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Text, TextInput, View } from "react-native";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { PrimaryButton } from "@/components/primary-button";
import { ScreenShell } from "@/components/screen-shell";
import { listMyPets, signIn } from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

type SignInValues = z.infer<typeof signInSchema>;

const inputStyle = {
  borderRadius: mobileTheme.radius.md,
  backgroundColor: mobileTheme.colors.background,
  borderWidth: 1,
  borderColor: mobileTheme.colors.border,
  paddingHorizontal: mobileTheme.spacing.lg,
  paddingVertical: mobileTheme.spacing.md + 3,
  color: mobileTheme.colors.ink,
  fontSize: mobileTheme.typography.body.fontSize,
  fontFamily: "Inter_400Regular"
} as const;

export default function SignInPage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const setSession = useSessionStore((state) => state.setSession);
  const setPetCount = useSessionStore((state) => state.setPetCount);
  const setActivePetId = useSessionStore((state) => state.setActivePetId);
  const { control, handleSubmit } = useForm<SignInValues>({
    defaultValues: { email: "", password: "" },
    resolver: zodResolver(signInSchema)
  });

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
            <TextInput
              autoCapitalize="none"
              placeholder="Email"
              placeholderTextColor={mobileTheme.colors.muted}
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
              placeholder="Password"
              placeholderTextColor={mobileTheme.colors.muted}
              value={value}
              onChangeText={onChange}
              style={inputStyle}
            />
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
          label={mutation.isPending ? "Signing in..." : "Sign in"}
          onPress={handleSubmit((values) => mutation.mutate(values))}
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
        Need an account?{" "}
        <Link
          href="/(auth)/sign-up"
          style={{ color: mobileTheme.colors.primary, fontWeight: "700" }}
        >
          Create one
        </Link>
      </Text>
    </ScreenShell>
  );
}
