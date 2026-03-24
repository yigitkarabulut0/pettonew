import { useMutation } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, Text, TextInput, View } from "react-native";
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

export default function SignInPage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const setSession = useSessionStore((state) => state.setSession);
  const setPetCount = useSessionStore((state) => state.setPetCount);
  const setActivePetId = useSessionStore((state) => state.setActivePetId);
  const { control, handleSubmit } = useForm<SignInValues>({
    defaultValues: {
      email: "",
      password: ""
    },
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
      title="Welcome back"
      subtitle="Sign in to continue."
    >
      <View
        style={{
          gap: 14,
          padding: 18,
          borderRadius: 20,
          backgroundColor: mobileTheme.colors.surface,
          borderWidth: 1,
          borderColor: mobileTheme.colors.border
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
              style={styles.input}
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
              style={styles.input}
            />
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
          label={mutation.isPending ? "Signing in..." : "Sign in"}
          onPress={handleSubmit((values) => mutation.mutate(values))}
        />
      </View>
      <Text
        style={{
          color: mobileTheme.colors.muted,
          lineHeight: 22,
          fontFamily: mobileTheme.fontFamily
        }}
      >
        Need an account?{" "}
        <Link
          href="/(auth)/sign-up"
          style={{
            color: mobileTheme.colors.secondary,
            fontWeight: "700",
            fontFamily: mobileTheme.fontFamily
          }}
        >
          Create one
        </Link>
      </Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: mobileTheme.radius.md,
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: mobileTheme.colors.ink,
    fontFamily: mobileTheme.fontFamily
  }
});
