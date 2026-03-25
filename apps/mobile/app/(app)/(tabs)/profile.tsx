import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogOut, PlusCircle } from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { CompactPetCard, PetDetailModal } from "@/components/pet-card";
import { PrimaryButton } from "@/components/primary-button";
import { listMyPets } from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function ProfilePage() {
  const session = useSessionStore((state) => state.session);
  const clearSession = useSessionStore((state) => state.clearSession);
  const activePetId = useSessionStore((state) => state.activePetId);
  const setActivePetId = useSessionStore((state) => state.setActivePetId);
  const insets = useSafeAreaInsets();
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const { data: pets = [] } = useQuery({
    queryKey: ["my-pets", session?.tokens.accessToken],
    queryFn: () => listMyPets(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === selectedPetId) ?? null,
    [pets, selectedPetId]
  );
  const activePet = useMemo(
    () => pets.find((pet) => pet.id === activePetId) ?? pets[0] ?? null,
    [pets, activePetId]
  );

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ flex: 1, backgroundColor: mobileTheme.colors.background }}
      contentContainerStyle={{
        paddingHorizontal: mobileTheme.spacing.xl,
        paddingBottom: 120,
        gap: mobileTheme.spacing.xl
      }}
    >
      <View
        style={{
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.sm
        }}
      >
        <Text
          style={{
            fontSize: mobileTheme.typography.display.fontSize,
            fontWeight: mobileTheme.typography.display.fontWeight,
            color: mobileTheme.colors.ink,
            fontFamily: "Inter_800ExtraBold",
            lineHeight: mobileTheme.typography.display.lineHeight
          }}
        >
          Profile
        </Text>
      </View>

      <View
        style={{
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: mobileTheme.colors.white,
          padding: mobileTheme.spacing.xl,
          gap: mobileTheme.spacing.xl,
          ...mobileTheme.shadow.sm
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: mobileTheme.spacing.lg,
            alignItems: "center"
          }}
        >
          <Avatar
            uri={session?.user.avatarUrl}
            name={session?.user.firstName}
            size="xl"
          />
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              style={{
                fontSize: mobileTheme.typography.heading.fontSize,
                fontWeight: mobileTheme.typography.heading.fontWeight,
                color: mobileTheme.colors.ink,
                fontFamily: "Inter_700Bold"
              }}
            >
              {session?.user.firstName} {session?.user.lastName}
            </Text>
            <Text
              style={{
                color: mobileTheme.colors.muted,
                fontSize: mobileTheme.typography.caption.fontSize,
                fontFamily: "Inter_500Medium"
              }}
            >
              {session?.user.cityLabel || "Location not shared"}
            </Text>
            {session?.user.bio ? (
              <Text
                numberOfLines={2}
                style={{
                  color: mobileTheme.colors.muted,
                  fontSize: mobileTheme.typography.body.fontSize,
                  fontFamily: "Inter_400Regular",
                  lineHeight: mobileTheme.typography.body.lineHeight
                }}
              >
                {session.user.bio}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: mobileTheme.spacing.md }}>
          <StatCard label="Pets" value={String(pets.length)} />
          <StatCard label="Active" value={activePet?.name ?? "None"} />
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: mobileTheme.spacing.sm,
            flexWrap: "wrap"
          }}
        >
          <PrimaryButton
            label="Edit profile"
            variant="secondary"
            onPress={() => router.push("/(app)/onboarding/profile")}
            size="sm"
          />
          <PrimaryButton
            label="Location"
            variant="ghost"
            onPress={() => router.push("/(app)/onboarding/location")}
            size="sm"
          />
          <PrimaryButton
            label="Add pet"
            variant="ghost"
            onPress={() => router.push("/(app)/onboarding/pets")}
            size="sm"
          />
        </View>
      </View>

      <View style={{ gap: mobileTheme.spacing.md }}>
        <Text
          style={{
            fontSize: mobileTheme.typography.subheading.fontSize,
            fontWeight: mobileTheme.typography.subheading.fontWeight,
            color: mobileTheme.colors.ink,
            fontFamily: "Inter_600SemiBold"
          }}
        >
          Your pets
        </Text>
        {pets.length ? (
          pets.map((pet) => (
            <View key={pet.id} style={{ gap: mobileTheme.spacing.sm }}>
              <CompactPetCard
                pet={pet}
                isActive={pet.id === activePetId}
                onPress={() => setSelectedPetId(pet.id)}
              />
              <PrimaryButton
                label={
                  pet.id === activePetId ? "Currently active" : "Use as active"
                }
                variant={pet.id === activePetId ? "secondary" : "ghost"}
                onPress={() => setActivePetId(pet.id)}
                size="sm"
              />
            </View>
          ))
        ) : (
          <View
            style={{
              padding: mobileTheme.spacing.xl,
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: mobileTheme.colors.white,
              alignItems: "center",
              gap: mobileTheme.spacing.md,
              ...mobileTheme.shadow.sm
            }}
          >
            <PlusCircle size={32} color={mobileTheme.colors.muted} />
            <Text
              style={{
                fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                color: mobileTheme.colors.ink,
                fontFamily: "Inter_700Bold"
              }}
            >
              No pets yet
            </Text>
            <Text
              style={{
                color: mobileTheme.colors.muted,
                fontSize: mobileTheme.typography.body.fontSize,
                fontFamily: "Inter_400Regular",
                textAlign: "center"
              }}
            >
              Add your first pet to unlock discovery, matches, and chat.
            </Text>
          </View>
        )}
      </View>

      <Pressable
        onPress={() => {
          clearSession();
          router.replace("/");
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: mobileTheme.spacing.sm,
          paddingVertical: mobileTheme.spacing.md,
          borderRadius: mobileTheme.radius.pill,
          borderWidth: 1,
          borderColor: mobileTheme.colors.borderStrong
        }}
      >
        <LogOut size={16} color={mobileTheme.colors.danger} />
        <Text
          style={{
            color: mobileTheme.colors.danger,
            fontWeight: "600",
            fontSize: mobileTheme.typography.caption.fontSize,
            fontFamily: "Inter_600SemiBold"
          }}
        >
          Sign out
        </Text>
      </Pressable>

      <PetDetailModal
        pet={selectedPet}
        visible={Boolean(selectedPet)}
        onClose={() => setSelectedPetId(null)}
      />
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: mobileTheme.radius.md,
        backgroundColor: mobileTheme.colors.background,
        padding: mobileTheme.spacing.lg,
        gap: mobileTheme.spacing.xs
      }}
    >
      <Text
        style={{
          color: mobileTheme.colors.muted,
          fontSize: mobileTheme.typography.label.fontSize,
          fontWeight: mobileTheme.typography.label.fontWeight,
          fontFamily: "Inter_700Bold",
          letterSpacing: mobileTheme.typography.label.letterSpacing,
          textTransform: "uppercase"
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          color: mobileTheme.colors.ink,
          fontSize: mobileTheme.typography.subheading.fontSize,
          fontWeight: mobileTheme.typography.subheading.fontWeight,
          fontFamily: "Inter_600SemiBold"
        }}
      >
        {value}
      </Text>
    </View>
  );
}
