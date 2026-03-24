import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Text, View } from "react-native";

import { CompactPetCard, PetDetailModal } from "@/components/pet-card";
import { PrimaryButton } from "@/components/primary-button";
import { ScreenShell } from "@/components/screen-shell";
import { listMyPets } from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function ProfilePage() {
  const session = useSessionStore((state) => state.session);
  const clearSession = useSessionStore((state) => state.clearSession);
  const activePetId = useSessionStore((state) => state.activePetId);
  const setActivePetId = useSessionStore((state) => state.setActivePetId);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const { data: pets = [] } = useQuery({
    queryKey: ["my-pets", session?.tokens.accessToken],
    queryFn: () => listMyPets(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const selectedPet = useMemo(() => pets.find((pet) => pet.id === selectedPetId) ?? null, [pets, selectedPetId]);
  const activePet = useMemo(() => pets.find((pet) => pet.id === activePetId) ?? pets[0] ?? null, [pets, activePetId]);

  return (
    <ScreenShell
      eyebrow="Profile"
      title={session?.user.firstName ? `${session.user.firstName}'s space` : "Your profile"}
      subtitle="Keep your own profile clean, choose your active pet, and open any pet card to review every detail."
    >
      <View
        style={{
          borderRadius: 30,
          padding: 20,
          backgroundColor: mobileTheme.colors.surface,
          gap: 18
        }}
      >
        <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
          <View
            style={{
              width: 82,
              height: 82,
              borderRadius: 999,
              overflow: "hidden",
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: mobileTheme.colors.border,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {session?.user.avatarUrl ? (
              <Image source={{ uri: session.user.avatarUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            ) : (
              <Text selectable style={{ color: mobileTheme.colors.muted, fontWeight: "700" }}>
                No photo
              </Text>
            )}
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text selectable style={{ fontSize: 28, fontWeight: "800", color: mobileTheme.colors.ink }}>
              {session?.user.firstName} {session?.user.lastName}
            </Text>
            <Text selectable style={{ color: mobileTheme.colors.secondary, fontWeight: "700" }}>
              {session?.user.cityLabel || "Location not shared yet"}
            </Text>
            <Text selectable style={{ color: mobileTheme.colors.muted, lineHeight: 22 }}>
              {session?.user.bio || "Add a short human bio so other pet parents know who they are meeting."}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <StatCard label="Pets" value={String(pets.length)} />
          <StatCard label="Active pet" value={activePet?.name || "None"} />
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <PrimaryButton label="Edit profile" variant="secondary" onPress={() => router.push("/(app)/onboarding/profile")} />
          <PrimaryButton label="Update location" variant="ghost" onPress={() => router.push("/(app)/onboarding/location")} />
          <PrimaryButton label="Add another pet" variant="ghost" onPress={() => router.push("/(app)/onboarding/pets")} />
        </View>
      </View>

      <View style={{ gap: 12 }}>
        <Text selectable style={{ fontSize: 24, fontWeight: "800", color: mobileTheme.colors.ink }}>
          Your pets
        </Text>
        <Text selectable style={{ color: mobileTheme.colors.muted, lineHeight: 22 }}>
          Tap any pet card to open the full profile and check exactly what you added.
        </Text>
        {pets.length ? (
          pets.map((pet) => (
            <View key={pet.id} style={{ gap: 10 }}>
              <CompactPetCard pet={pet} isActive={pet.id === activePetId} onPress={() => setSelectedPetId(pet.id)} />
              <PrimaryButton
                label={pet.id === activePetId ? "Currently active" : "Use as active pet"}
                variant={pet.id === activePetId ? "secondary" : "ghost"}
                onPress={() => setActivePetId(pet.id)}
              />
            </View>
          ))
        ) : (
          <View
            style={{
              borderRadius: 28,
              padding: 20,
              backgroundColor: mobileTheme.colors.surface,
              gap: 8
            }}
          >
            <Text selectable style={{ fontSize: 22, fontWeight: "800", color: mobileTheme.colors.ink }}>
              No pets yet
            </Text>
            <Text selectable style={{ color: mobileTheme.colors.muted, lineHeight: 22 }}>
              Add your first pet to unlock discovery, matches, and chat.
            </Text>
          </View>
        )}
      </View>

      <PrimaryButton
        label="Sign out"
        variant="ghost"
        onPress={() => {
          clearSession();
          router.replace("/");
        }}
      />

      <PetDetailModal pet={selectedPet} visible={Boolean(selectedPet)} onClose={() => setSelectedPetId(null)} />
    </ScreenShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 24,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: mobileTheme.colors.border,
        padding: 16,
        gap: 6
      }}
    >
      <Text selectable style={{ color: mobileTheme.colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1 }}>
        {label.toUpperCase()}
      </Text>
      <Text selectable numberOfLines={1} style={{ color: mobileTheme.colors.ink, fontSize: 20, fontWeight: "800" }}>
        {value}
      </Text>
    </View>
  );
}
