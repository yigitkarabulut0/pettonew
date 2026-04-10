import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  Activity,
  Award,
  BookOpen,
  ChevronRight,
  Eye,
  EyeOff,
  LogOut,
  MapPin,
  PawPrint,
  PenSquare,
  Phone,
  Plus,
  Scale,
  Star,
  Stethoscope,
  UtensilsCrossed
} from "lucide-react-native";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/avatar";
import { PetDetailModal } from "@/components/pet-card";
import { listBadges, listMyPets, setPetVisibility } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function ProfilePage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const session = useSessionStore((s) => s.session);
  const clearSession = useSessionStore((s) => s.clearSession);
  const activePetId = useSessionStore((s) => s.activePetId);
  const setActivePetId = useSessionStore((s) => s.setActivePetId);

  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);

  const {
    data: pets = [],
    isLoading,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ["my-pets", session?.tokens.accessToken],
    queryFn: () => listMyPets(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const { data: badges = [] } = useQuery({
    queryKey: ["badges", session?.tokens.accessToken],
    queryFn: () => listBadges(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const activePet = useMemo(
    () => pets.find((p) => p.id === activePetId) ?? pets[0] ?? null,
    [pets, activePetId]
  );

  const selectedPet = useMemo(
    () => pets.find((p) => p.id === selectedPetId) ?? null,
    [pets, selectedPetId]
  );

  const visibilityMutation = useMutation({
    mutationFn: ({ petId, hidden }: { petId: string; hidden: boolean }) =>
      setPetVisibility(session!.tokens.accessToken, petId, hidden),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["my-pets"] });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Pet action buttons config                                         */
  /* ------------------------------------------------------------------ */
  const petActionRow1 = (petId: string, isHidden: boolean) => [
    {
      key: "edit",
      label: "Edit",
      icon: PenSquare,
      onPress: () => router.push(`/(app)/edit-pet/${petId}` as any)
    },
    {
      key: "visibility",
      label: isHidden ? "Hidden" : "Visible",
      icon: isHidden ? EyeOff : Eye,
      onPress: () =>
        visibilityMutation.mutate({ petId, hidden: !isHidden })
    },
    {
      key: "health",
      label: "Health",
      icon: Activity,
      onPress: () => router.push(`/(app)/pet-health/${petId}` as any)
    },
    {
      key: "diary",
      label: "Diary",
      icon: BookOpen,
      onPress: () => router.push(`/(app)/diary/${petId}` as any)
    }
  ];

  const petActionRow2 = (petId: string) => [
    {
      key: "weight",
      label: "Weight",
      icon: Scale,
      onPress: () => router.push(`/(app)/pet-weight/${petId}` as any)
    },
    {
      key: "feeding",
      label: "Feeding",
      icon: UtensilsCrossed,
      onPress: () => router.push(`/(app)/feeding/${petId}` as any)
    }
  ];

  /* ------------------------------------------------------------------ */
  /*  Quick links config                                                */
  /* ------------------------------------------------------------------ */
  const quickLinks = [
    {
      key: "vet-contacts",
      label: "Vet Contacts",
      icon: Phone,
      route: "/(app)/vet-contacts"
    },
    {
      key: "pet-sitters",
      label: "Pet Sitters",
      icon: Stethoscope,
      route: "/(app)/pet-sitters"
    }
  ];

  /* ------------------------------------------------------------------ */
  /*  Render                                                            */
  /* ------------------------------------------------------------------ */
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.colors.primary}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingBottom: 100 + insets.bottom,
          gap: mobileTheme.spacing["2xl"]
        }}
      >
        {/* ============================================================ */}
        {/* SECTION A -- Header + User Card                              */}
        {/* ============================================================ */}
        <View style={{ gap: mobileTheme.spacing.xl }}>
          {/* Header row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: insets.top + mobileTheme.spacing.md
            }}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.heading.fontSize,
                fontWeight: mobileTheme.typography.heading.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold",
                letterSpacing: mobileTheme.typography.heading.letterSpacing
              }}
            >
              Profile
            </Text>

            <Pressable
              accessibilityLabel="Edit profile"
              onPress={() => router.push("/(app)/onboarding/profile")}
              hitSlop={10}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: mobileTheme.spacing.md,
                paddingVertical: mobileTheme.spacing.sm,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: theme.colors.primaryBg,
                opacity: pressed ? 0.8 : 1
              })}
            >
              <PenSquare size={14} color={theme.colors.primary} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  fontWeight: "600",
                  color: theme.colors.primary,
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                Edit Profile
              </Text>
            </Pressable>
          </View>

          {/* User card */}
          <View
            style={{
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: theme.colors.white,
              padding: mobileTheme.spacing.xl,
              alignItems: "center",
              gap: mobileTheme.spacing.lg,
              ...mobileTheme.shadow.sm
            }}
          >
            {/* Avatar with primary ring */}
            <View
              style={{
                width: 86,
                height: 86,
                borderRadius: 43,
                borderWidth: 3,
                borderColor: theme.colors.primary,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Avatar
                uri={session?.user.avatarUrl}
                name={session?.user.firstName}
                size="xl"
              />
            </View>

            {/* Name */}
            <Text
              style={{
                fontSize: mobileTheme.typography.heading.fontSize,
                fontWeight: mobileTheme.typography.heading.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold",
                textAlign: "center"
              }}
            >
              {session?.user.firstName} {session?.user.lastName}
            </Text>

            {/* Location */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4
              }}
            >
              <MapPin size={14} color={theme.colors.muted} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium"
                }}
              >
                {session?.user.cityLabel || "Location not shared"}
              </Text>
            </View>

            {/* Bio */}
            {session?.user.bio ? (
              <Text
                numberOfLines={3}
                style={{
                  fontSize: mobileTheme.typography.body.fontSize,
                  lineHeight: mobileTheme.typography.body.lineHeight,
                  color: theme.colors.muted,
                  fontFamily: "Inter_400Regular",
                  textAlign: "center",
                  maxWidth: 300
                }}
              >
                {session.user.bio}
              </Text>
            ) : null}

            {/* Stat boxes */}
            <View
              style={{
                flexDirection: "row",
                gap: mobileTheme.spacing.sm,
                width: "100%"
              }}
            >
              <StatBox label="Pets" value={String(pets.length)} />
              <StatBox label="Active" value={activePet?.name ?? "None"} />
              <StatBox label="Matches" value="--" />
            </View>
          </View>
        </View>

        {/* ============================================================ */}
        {/* SECTION B -- Active Pet Card                                 */}
        {/* ============================================================ */}
        {activePet && (
          <Pressable
            accessibilityLabel={`View details for ${activePet.name}`}
            onPress={() => setSelectedPetId(activePet.id)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: mobileTheme.spacing.md,
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              padding: mobileTheme.spacing.lg,
              opacity: pressed ? 0.85 : 1,
              ...mobileTheme.shadow.sm
            })}
          >
            {activePet.photos[0]?.url ? (
              <Image
                source={{ uri: activePet.photos[0].url }}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24
                }}
              />
            ) : (
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: theme.colors.primaryBg,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <PawPrint size={20} color={theme.colors.primary} />
              </View>
            )}

            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                  fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                  color: theme.colors.ink,
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                {activePet.name}
              </Text>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_400Regular"
                }}
              >
                {activePet.speciesLabel}
                {activePet.breedLabel ? ` \u00B7 ${activePet.breedLabel}` : ""}
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: theme.colors.successBg
              }}
            >
              <Text
                style={{
                  fontSize: mobileTheme.typography.micro.fontSize,
                  fontWeight: "700",
                  color: theme.colors.success,
                  fontFamily: "Inter_700Bold"
                }}
              >
                Active
              </Text>
            </View>
          </Pressable>
        )}

        {/* ============================================================ */}
        {/* SECTION C -- My Pets                                         */}
        {/* ============================================================ */}
        <View style={{ gap: mobileTheme.spacing.md }}>
          {/* Section header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                fontWeight: mobileTheme.typography.subheading.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              My Pets
            </Text>
            <Pressable
              accessibilityLabel="Add a new pet"
              onPress={() => router.push("/(app)/onboarding/pets")}
              hitSlop={8}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                opacity: pressed ? 0.7 : 1
              })}
            >
              <Plus size={14} color={theme.colors.primary} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  fontWeight: "600",
                  color: theme.colors.primary,
                  fontFamily: "Inter_600SemiBold"
                }}
              >
                Add
              </Text>
            </Pressable>
          </View>

          {/* Loading state */}
          {isLoading && pets.length === 0 ? (
            <View
              style={{
                paddingVertical: 60,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : pets.length > 0 ? (
            <View style={{ gap: mobileTheme.spacing.lg }}>
              {pets.map((pet) => {
                const isActive = pet.id === (activePetId ?? pets[0]?.id);
                return (
                  <View
                    key={pet.id}
                    style={{
                      backgroundColor: theme.colors.white,
                      borderRadius: mobileTheme.radius.lg,
                      padding: mobileTheme.spacing.lg,
                      gap: mobileTheme.spacing.md,
                      ...mobileTheme.shadow.sm
                    }}
                  >
                    {/* Pet info row */}
                    <Pressable
                      accessibilityLabel={`View ${pet.name} details`}
                      onPress={() => setSelectedPetId(pet.id)}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        gap: mobileTheme.spacing.md,
                        opacity: pressed ? 0.85 : 1
                      })}
                    >
                      {/* Pet photo */}
                      {pet.photos[0]?.url ? (
                        <Image
                          source={{ uri: pet.photos[0].url }}
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: mobileTheme.radius.md
                          }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: mobileTheme.radius.md,
                            backgroundColor: theme.colors.primaryBg,
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          <PawPrint size={24} color={theme.colors.primary} />
                        </View>
                      )}

                      {/* Pet text info */}
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text
                          style={{
                            fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                            fontWeight: "700",
                            color: theme.colors.ink,
                            fontFamily: "Inter_700Bold"
                          }}
                        >
                          {pet.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: mobileTheme.typography.caption.fontSize,
                            color: theme.colors.muted,
                            fontFamily: "Inter_400Regular"
                          }}
                        >
                          {pet.speciesLabel}
                          {pet.breedLabel
                            ? ` \u00B7 ${pet.breedLabel}`
                            : ""}
                        </Text>
                        <Text
                          style={{
                            fontSize: mobileTheme.typography.caption.fontSize,
                            color: theme.colors.muted,
                            fontFamily: "Inter_400Regular"
                          }}
                        >
                          {pet.ageYears != null
                            ? `${pet.ageYears} year${pet.ageYears === 1 ? "" : "s"} old`
                            : ""}
                        </Text>
                      </View>

                      {/* Active indicator / Set Active button */}
                      {isActive ? (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: mobileTheme.radius.pill,
                            backgroundColor: theme.colors.successBg
                          }}
                        >
                          <Star size={12} color={theme.colors.success} fill={theme.colors.success} />
                          <Text
                            style={{
                              fontSize: mobileTheme.typography.micro.fontSize,
                              fontWeight: "700",
                              color: theme.colors.success,
                              fontFamily: "Inter_700Bold"
                            }}
                          >
                            Active
                          </Text>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => {
                            setActivePetId(pet.id);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          }}
                          style={({ pressed }) => ({
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: mobileTheme.radius.pill,
                            backgroundColor: theme.colors.primaryBg,
                            opacity: pressed ? 0.7 : 1
                          })}
                        >
                          <Star size={12} color={theme.colors.primary} />
                          <Text
                            style={{
                              fontSize: mobileTheme.typography.micro.fontSize,
                              fontWeight: "600",
                              color: theme.colors.primary,
                              fontFamily: "Inter_600SemiBold"
                            }}
                          >
                            Set Active
                          </Text>
                        </Pressable>
                      )}
                    </Pressable>

                    {/* Action row 1 */}
                    <View
                      style={{
                        flexDirection: "row",
                        gap: mobileTheme.spacing.sm,
                        flexWrap: "wrap"
                      }}
                    >
                      {petActionRow1(pet.id, pet.isHidden).map((action) => (
                        <ActionChip
                          key={action.key}
                          label={action.label}
                          icon={action.icon}
                          onPress={action.onPress}
                        />
                      ))}
                    </View>

                    {/* Action row 2 */}
                    <View
                      style={{
                        flexDirection: "row",
                        gap: mobileTheme.spacing.sm,
                        flexWrap: "wrap"
                      }}
                    >
                      {petActionRow2(pet.id).map((action) => (
                        <ActionChip
                          key={action.key}
                          label={action.label}
                          icon={action.icon}
                          onPress={action.onPress}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            /* Empty state */
            <View
              style={{
                backgroundColor: theme.colors.white,
                borderRadius: mobileTheme.radius.lg,
                padding: mobileTheme.spacing["3xl"],
                alignItems: "center",
                gap: mobileTheme.spacing.md,
                ...mobileTheme.shadow.sm
              }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: theme.colors.primaryBg,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <PawPrint size={28} color={theme.colors.primary} />
              </View>
              <Text
                style={{
                  fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                  fontWeight: "700",
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                Add your first pet
              </Text>
              <Text
                style={{
                  fontSize: mobileTheme.typography.body.fontSize,
                  lineHeight: mobileTheme.typography.body.lineHeight,
                  color: theme.colors.muted,
                  fontFamily: "Inter_400Regular",
                  textAlign: "center",
                  maxWidth: 260
                }}
              >
                Register your pet to unlock discovery, matching, and all the
                fun features Pett. has to offer.
              </Text>
            </View>
          )}
        </View>

        {/* ============================================================ */}
        {/* SECTION D -- Achievements                                    */}
        {/* ============================================================ */}
        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text
            style={{
              fontSize: mobileTheme.typography.subheading.fontSize,
              fontWeight: mobileTheme.typography.subheading.fontWeight,
              color: theme.colors.ink,
              fontFamily: "Inter_600SemiBold"
            }}
          >
            Achievements
          </Text>

          {badges.length > 0 ? (
            <FlatList
              data={badges}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: mobileTheme.spacing.sm }}
              renderItem={({ item }) => (
                <View
                  style={{
                    width: 70,
                    alignItems: "center",
                    gap: mobileTheme.spacing.xs,
                    paddingVertical: mobileTheme.spacing.md,
                    paddingHorizontal: mobileTheme.spacing.xs,
                    borderRadius: mobileTheme.radius.md,
                    backgroundColor: theme.colors.white,
                    borderWidth: 1,
                    borderColor: theme.colors.border
                  }}
                >
                  <Award size={20} color={theme.colors.starGold} />
                  <Text
                    numberOfLines={2}
                    style={{
                      fontSize: mobileTheme.typography.micro.fontSize,
                      fontWeight: mobileTheme.typography.micro.fontWeight,
                      color: theme.colors.ink,
                      fontFamily: "Inter_600SemiBold",
                      textAlign: "center"
                    }}
                  >
                    {item.title}
                  </Text>
                </View>
              )}
            />
          ) : (
            <Text
              style={{
                fontSize: mobileTheme.typography.caption.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_400Regular",
                textAlign: "center",
                paddingVertical: mobileTheme.spacing.xl
              }}
            >
              No achievements yet
            </Text>
          )}
        </View>

        {/* ============================================================ */}
        {/* SECTION E -- Quick Links                                     */}
        {/* ============================================================ */}
        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text
            style={{
              fontSize: mobileTheme.typography.subheading.fontSize,
              fontWeight: mobileTheme.typography.subheading.fontWeight,
              color: theme.colors.ink,
              fontFamily: "Inter_600SemiBold"
            }}
          >
            More
          </Text>

          <View
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              overflow: "hidden",
              ...mobileTheme.shadow.sm
            }}
          >
            {quickLinks.map((link, index) => (
              <Pressable
                key={link.key}
                accessibilityLabel={link.label}
                onPress={() => router.push(link.route as any)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: mobileTheme.spacing.lg,
                  paddingHorizontal: mobileTheme.spacing.lg,
                  backgroundColor: pressed
                    ? theme.colors.background
                    : "transparent",
                  borderTopWidth: index > 0 ? 1 : 0,
                  borderTopColor: theme.colors.border
                })}
              >
                <link.icon size={18} color={theme.colors.muted} />
                <Text
                  style={{
                    flex: 1,
                    marginLeft: mobileTheme.spacing.md,
                    fontSize: mobileTheme.typography.body.fontSize,
                    color: theme.colors.ink,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  {link.label}
                </Text>
                <ChevronRight size={18} color={theme.colors.muted} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* ============================================================ */}
        {/* SECTION F -- Sign Out                                        */}
        {/* ============================================================ */}
        <View style={{ gap: mobileTheme.spacing.lg }}>
          <View
            style={{
              height: 1,
              backgroundColor: theme.colors.border
            }}
          />

          <Pressable
            accessibilityLabel="Sign out"
            onPress={() => {
              clearSession();
              router.replace("/");
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: mobileTheme.spacing.sm,
              paddingVertical: mobileTheme.spacing.lg,
              borderRadius: mobileTheme.radius.pill,
              opacity: pressed ? 0.7 : 1
            })}
          >
            <LogOut size={18} color={theme.colors.danger} />
            <Text
              style={{
                fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                fontWeight: "600",
                color: theme.colors.danger,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              Sign out
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Pet Detail Modal */}
      <PetDetailModal
        pet={selectedPet}
        visible={Boolean(selectedPet)}
        onClose={() => setSelectedPetId(null)}
      />
    </View>
  );
}

/* ==================================================================== */
/*  Sub-components                                                       */
/* ==================================================================== */

function StatBox({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        borderRadius: mobileTheme.radius.md,
        paddingVertical: mobileTheme.spacing.md,
        paddingHorizontal: mobileTheme.spacing.sm,
        alignItems: "center",
        gap: 2
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontSize: mobileTheme.typography.subheading.fontSize,
          fontWeight: "700",
          color: theme.colors.ink,
          fontFamily: "Inter_700Bold"
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: mobileTheme.typography.micro.fontSize,
          fontWeight: mobileTheme.typography.micro.fontWeight,
          color: theme.colors.muted,
          fontFamily: "Inter_500Medium",
          textTransform: "uppercase",
          letterSpacing: 0.5
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function ActionChip({
  label,
  icon: Icon,
  onPress
}: {
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: mobileTheme.spacing.md,
        paddingVertical: mobileTheme.spacing.sm,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.75 : 1
      })}
    >
      <Icon size={14} color={theme.colors.muted} />
      <Text
        style={{
          fontSize: mobileTheme.typography.micro.fontSize,
          fontWeight: "600",
          color: theme.colors.muted,
          fontFamily: "Inter_600SemiBold"
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
