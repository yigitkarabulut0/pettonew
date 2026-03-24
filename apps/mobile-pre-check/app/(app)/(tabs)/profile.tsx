import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { CompactPetCard, PetDetailModal } from "@/components/pet-card";
import { PrimaryButton } from "@/components/primary-button";
import { ScreenShell } from "@/components/screen-shell";
import { listMyPets } from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const styles = StyleSheet.create({
  profileCard: {
    borderRadius: 20,
    padding: 20,
    backgroundColor: mobileTheme.colors.surface,
    gap: 18
  },
  avatarRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center"
  },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarPlaceholder: {
    color: mobileTheme.colors.muted
  },
  infoCol: {
    flex: 1,
    gap: 6
  },
  name: {
    fontSize: 24,
    fontWeight: "700",
    color: mobileTheme.colors.ink,
    fontFamily: mobileTheme.fontFamily
  },
  location: {
    color: mobileTheme.colors.secondary,
    fontWeight: "700",
    fontFamily: mobileTheme.fontFamily
  },
  bio: {
    color: mobileTheme.colors.muted,
    lineHeight: 22,
    fontFamily: mobileTheme.fontFamily
  },
  statsRow: {
    flexDirection: "row",
    gap: 12
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  petsSection: {
    gap: 12
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: mobileTheme.colors.ink,
    fontFamily: mobileTheme.fontFamily
  },
  sectionDesc: {
    color: mobileTheme.colors.muted,
    lineHeight: 22,
    fontFamily: mobileTheme.fontFamily
  },
  petItem: {
    gap: 10
  },
  emptyPetsCard: {
    borderRadius: 28,
    padding: 20,
    backgroundColor: mobileTheme.colors.surface,
    gap: 8
  },
  emptyPetsTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: mobileTheme.colors.ink,
    fontFamily: mobileTheme.fontFamily
  },
  emptyPetsDesc: {
    color: mobileTheme.colors.muted,
    lineHeight: 22,
    fontFamily: mobileTheme.fontFamily
  },
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  signOutIcon: {
    color: mobileTheme.colors.muted
  },
  signOutText: {
    color: mobileTheme.colors.muted,
    fontFamily: mobileTheme.fontFamily
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    padding: 16,
    gap: 6
  },
  statLabel: {
    color: mobileTheme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    fontFamily: mobileTheme.fontFamily
  },
  statValue: {
    color: mobileTheme.colors.ink,
    fontSize: 20,
    fontWeight: "800",
    fontFamily: mobileTheme.fontFamily
  }
});

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

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === selectedPetId) ?? null,
    [pets, selectedPetId]
  );
  const activePet = useMemo(
    () => pets.find((pet) => pet.id === activePetId) ?? pets[0] ?? null,
    [pets, activePetId]
  );

  return (
    <ScreenShell
      eyebrow="Profile"
      title={
        session?.user.firstName
          ? `${session.user.firstName}'s space`
          : "Your profile"
      }
      subtitle="Keep your own profile clean, choose your active pet, and open any pet card to review every detail."
    >
      <View style={styles.profileCard}>
        <View style={styles.avatarRow}>
          <View style={styles.avatar}>
            {session?.user.avatarUrl ? (
              <Image
                source={{ uri: session.user.avatarUrl }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            ) : (
              <Ionicons
                name="person"
                size={40}
                style={styles.avatarPlaceholder}
              />
            )}
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.name}>
              {session?.user.firstName} {session?.user.lastName}
            </Text>
            <Text style={styles.location}>
              {session?.user.cityLabel || "Location not shared yet"}
            </Text>
            <Text style={styles.bio}>
              {session?.user.bio ||
                "Add a short human bio so other pet parents know who they are meeting."}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard label="Pets" value={String(pets.length)} />
          <StatCard label="Active pet" value={activePet?.name || "None"} />
        </View>

        <View style={styles.actionsRow}>
          <PrimaryButton
            label="Edit profile"
            variant="secondary"
            onPress={() => router.push("/(app)/onboarding/profile")}
          />
          <PrimaryButton
            label="Update location"
            variant="ghost"
            onPress={() => router.push("/(app)/onboarding/location")}
          />
          <PrimaryButton
            label="Add another pet"
            variant="ghost"
            onPress={() => router.push("/(app)/onboarding/pets")}
          />
        </View>
      </View>

      <View style={styles.petsSection}>
        <Text style={styles.sectionTitle}>Your pets</Text>
        <Text style={styles.sectionDesc}>
          Tap any pet card to open the full profile and check exactly what you
          added.
        </Text>
        {pets.length ? (
          pets.map((pet) => (
            <View key={pet.id} style={styles.petItem}>
              <CompactPetCard
                pet={pet}
                isActive={pet.id === activePetId}
                onPress={() => setSelectedPetId(pet.id)}
              />
              <PrimaryButton
                label={
                  pet.id === activePetId
                    ? "Currently active"
                    : "Use as active pet"
                }
                variant={pet.id === activePetId ? "secondary" : "ghost"}
                onPress={() => setActivePetId(pet.id)}
              />
            </View>
          ))
        ) : (
          <View style={styles.emptyPetsCard}>
            <Text style={styles.emptyPetsTitle}>No pets yet</Text>
            <Text style={styles.emptyPetsDesc}>
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
        style={styles.signOutRow}
      >
        <Ionicons name="log-out-outline" size={20} style={styles.signOutIcon} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <PetDetailModal
        pet={selectedPet}
        visible={Boolean(selectedPet)}
        onClose={() => setSelectedPetId(null)}
      />
    </ScreenShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
    </View>
  );
}
