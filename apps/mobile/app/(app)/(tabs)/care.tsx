import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Activity,
  BookOpen,
  Calendar,
  GraduationCap,
  Heart as HeartIcon,
  Phone,
  Scale,
  Stethoscope,
  UtensilsCrossed
} from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { listMyPets } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const CARE_SECTIONS = [
  {
    title: "Health & Tracking",
    items: [
      { label: "Health Records", subtitle: "Vaccines, checkups, surgeries", icon: Activity, color: "#3F7D4E", routeKey: "pet-health" },
      { label: "Weight Log", subtitle: "Track weight over time", icon: Scale, color: "#5B9BD5", routeKey: "pet-weight" },
      { label: "Feeding Plan", subtitle: "Meal schedules & nutrition", icon: UtensilsCrossed, color: "#E6694A", routeKey: "feeding" },
      { label: "Diary", subtitle: "Notes, moods & memories", icon: BookOpen, color: "#8B6F47", routeKey: "diary" }
    ]
  },
  {
    title: "Resources",
    items: [
      { label: "Vet Contacts", subtitle: "Your veterinarians", icon: Phone, color: "#A14632", route: "/(app)/vet-contacts" },
      { label: "Training Tips", subtitle: "Commands & behavior", icon: GraduationCap, color: "#21433C", route: "/(app)/training-tips" },
      { label: "Pet Sitters", subtitle: "Find trusted caregivers", icon: Stethoscope, color: "#C48A3F", route: "/(app)/pet-sitters" }
    ]
  }
] as const;

export default function CarePage() {
  const theme = useTheme();
  const session = useSessionStore((s) => s.session);
  const activePetId = useSessionStore((s) => s.activePetId);
  const insets = useSafeAreaInsets();

  const { data: pets = [], refetch, isRefetching } = useQuery({
    queryKey: ["my-pets", session?.tokens.accessToken],
    queryFn: () => listMyPets(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const [selectedPetId, setSelectedPetId] = useState<string | null>(activePetId);

  const selectedPet = useMemo(
    () => pets.find((p) => p.id === selectedPetId) ?? pets[0] ?? null,
    [pets, selectedPetId]
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.sm,
          paddingHorizontal: mobileTheme.spacing.xl
        }}
      >
        <Text
          style={{
            fontSize: mobileTheme.typography.heading.fontSize,
            fontWeight: mobileTheme.typography.heading.fontWeight,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          Care
        </Text>
        <Text
          style={{
            fontSize: mobileTheme.typography.caption.fontSize,
            color: theme.colors.muted,
            fontFamily: "Inter_500Medium",
            marginTop: 2
          }}
        >
          Everything your pet needs in one place
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#F48C28" />
        }
        contentContainerStyle={{
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingBottom: 100 + insets.bottom,
          gap: mobileTheme.spacing.xl
        }}
      >
        {pets.length > 0 && (
          <FlatList
            horizontal
            data={pets}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}
            renderItem={({ item }) => (
              <Pressable onPress={() => setSelectedPetId(item.id)} style={{ alignItems: "center", gap: 4 }}>
                <View style={{
                  width: 52, height: 52, borderRadius: 26,
                  borderWidth: item.id === selectedPetId ? 2.5 : 0,
                  borderColor: theme.colors.primary,
                  padding: 2
                }}>
                  <Avatar uri={item.photos[0]?.url} name={item.name} size="md" />
                </View>
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: item.id === selectedPetId ? theme.colors.primary : theme.colors.muted }}>
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        )}

        {selectedPet && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: mobileTheme.spacing.md,
              padding: mobileTheme.spacing.lg,
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: theme.colors.white,
              ...mobileTheme.shadow.sm
            }}
          >
            <Avatar uri={selectedPet.photos[0]?.url} name={selectedPet.name} size="md" />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                  fontFamily: "Inter_700Bold",
                  color: theme.colors.ink
                }}
              >
                {selectedPet.name}
              </Text>
              <Text
                style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  fontFamily: "Inter_400Regular",
                  color: theme.colors.muted
                }}
              >
                {selectedPet.speciesLabel} · {selectedPet.breedLabel}
              </Text>
            </View>
          </View>
        )}

        {CARE_SECTIONS.map((section) => (
          <View key={section.title} style={{ gap: mobileTheme.spacing.md }}>
            <Text
              style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                fontWeight: mobileTheme.typography.subheading.fontWeight,
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold"
              }}
            >
              {section.title}
            </Text>
            <View style={{ gap: mobileTheme.spacing.sm }}>
              {section.items.map((item) => {
                const targetRoute = "route" in item
                  ? item.route
                  : selectedPet
                    ? `/(app)/${item.routeKey}/${selectedPet.id}`
                    : null;

                return (
                  <Pressable
                    key={item.label}
                    disabled={!targetRoute}
                    onPress={() => targetRoute && router.push(targetRoute as any)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: mobileTheme.spacing.lg,
                      padding: mobileTheme.spacing.lg,
                      borderRadius: mobileTheme.radius.lg,
                      backgroundColor: theme.colors.white,
                      ...mobileTheme.shadow.sm,
                      opacity: !targetRoute ? 0.5 : pressed ? 0.85 : 1
                    })}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        backgroundColor: `${item.color}14`,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <item.icon size={22} color={item.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                          fontFamily: "Inter_600SemiBold",
                          color: theme.colors.ink
                        }}
                      >
                        {item.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.caption.fontSize,
                          fontFamily: "Inter_400Regular",
                          color: theme.colors.muted,
                          marginTop: 1
                        }}
                      >
                        {item.subtitle}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: theme.colors.surface,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Text style={{ color: theme.colors.muted, fontSize: 16 }}>›</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {!selectedPet && (
          <View
            style={{
              alignItems: "center",
              padding: mobileTheme.spacing["3xl"],
              gap: mobileTheme.spacing.md
            }}
          >
            <Stethoscope size={40} color={theme.colors.muted} />
            <Text
              style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                fontFamily: "Inter_600SemiBold",
                color: theme.colors.ink
              }}
            >
              Add a pet first
            </Text>
            <Text
              style={{
                color: theme.colors.muted,
                fontFamily: "Inter_400Regular",
                textAlign: "center",
                maxWidth: 260
              }}
            >
              Go to Profile and add your first pet to unlock all care features.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
