// Favorites — adopter's hearted shelter listings. Reached from the
// discovery home's header icon. Uses the /v1/adoption/favorites endpoint
// so the targets are ShelterPet rows (photos: string[] URLs, not the
// social PetPhoto shape).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Localization from "expo-localization";
import { ArrowLeft, Heart, PawPrint } from "lucide-react-native";

import {
  listAdoptionFavorites,
  removeAdoptionFavorite
} from "@/lib/api";
import {
  formatAge,
  formatDistance,
  humanSex,
  resolveDistanceUnit
} from "@/lib/adoption-format";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function FavoritesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const token = session?.tokens.accessToken ?? "";
  const qc = useQueryClient();
  const distanceUnit = resolveDistanceUnit(
    Localization.getLocales()[0]?.languageTag
  );

  const { data: favorites = [] } = useQuery({
    queryKey: ["adoption-favorites"],
    queryFn: () => listAdoptionFavorites(token),
    enabled: Boolean(token),
    staleTime: 60_000
  });

  const removeMut = useMutation({
    mutationFn: (petId: string) => removeAdoptionFavorite(token, petId),
    onMutate: (petId: string) => {
      const previous = qc.getQueryData<typeof favorites>([
        "adoption-favorites"
      ]);
      qc.setQueryData<typeof favorites>(["adoption-favorites"], (cur) =>
        (cur ?? []).filter((p) => p.id !== petId)
      );
      return { previous };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.previous)
        qc.setQueryData(["adoption-favorites"], ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["adoption-favorites"] });
    }
  });

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={["top"]}
    >
      <View
        style={{
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingVertical: mobileTheme.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={22} color={theme.colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 18,
              fontFamily: "Inter_700Bold",
              color: theme.colors.ink
            }}
          >
            Favorites
          </Text>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "Inter_400Regular",
              color: theme.colors.muted
            }}
          >
            {favorites.length === 0
              ? "Hearts you save appear here"
              : `${favorites.length} saved pet${favorites.length === 1 ? "" : "s"}`}
          </Text>
        </View>
        <Heart size={18} color={theme.colors.primary} fill={theme.colors.primary} />
      </View>

      {favorites.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: mobileTheme.spacing.xl
          }}
        >
          <PawPrint size={32} color={theme.colors.muted} />
          <Text
            style={{
              marginTop: 10,
              fontSize: 14,
              fontFamily: "Inter_600SemiBold",
              color: theme.colors.ink
            }}
          >
            No favorites yet
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontSize: 12,
              fontFamily: "Inter_400Regular",
              color: theme.colors.muted,
              textAlign: "center"
            }}
          >
            Tap the heart on any listing to save it here.
          </Text>
          <Pressable
            onPress={() => router.replace("/(app)/adopt" as any)}
            style={{
              marginTop: 20,
              paddingHorizontal: 18,
              paddingVertical: 10,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: theme.colors.primary
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontFamily: "Inter_700Bold",
                fontSize: 13
              }}
            >
              Browse pets
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{
            padding: mobileTheme.spacing.xl,
            gap: mobileTheme.spacing.md
          }}
          renderItem={({ item }) => {
            const photoUrl = item.photos?.[0];
            const age = formatAge(item.ageMonths);
            const distance = formatDistance(item.distanceKm, distanceUnit);
            const caption = [
              item.breed,
              humanSex(item.sex),
              age,
              distance ? `· ${distance}` : null
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <Pressable
                onPress={() => router.push(`/(app)/adopt/${item.id}` as any)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  gap: mobileTheme.spacing.md,
                  padding: mobileTheme.spacing.md,
                  borderRadius: mobileTheme.radius.lg,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.88 : 1
                })}
              >
                {photoUrl ? (
                  <Image
                    source={{ uri: photoUrl }}
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: mobileTheme.radius.md,
                      backgroundColor: theme.colors.border
                    }}
                    contentFit="cover"
                    transition={220}
                    cachePolicy="memory-disk"
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
                    <PawPrint size={22} color={theme.colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 15,
                      fontFamily: "Inter_700Bold",
                      color: theme.colors.ink
                    }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={{
                      marginTop: 2,
                      fontSize: 11,
                      color: theme.colors.muted,
                      fontFamily: "Inter_500Medium"
                    }}
                    numberOfLines={1}
                  >
                    {caption || "—"}
                  </Text>
                  {item.shelterName ? (
                    <Text
                      style={{
                        marginTop: 1,
                        fontSize: 10,
                        color: theme.colors.muted,
                        fontFamily: "Inter_500Medium"
                      }}
                      numberOfLines={1}
                    >
                      {item.shelterName}
                      {item.shelterCity ? ` · ${item.shelterCity}` : ""}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    removeMut.mutate(item.id);
                  }}
                  hitSlop={8}
                  style={{ alignSelf: "center" }}
                  accessibilityLabel="Remove from favorites"
                >
                  <Heart
                    size={18}
                    color={theme.colors.primary}
                    fill={theme.colors.primary}
                  />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
