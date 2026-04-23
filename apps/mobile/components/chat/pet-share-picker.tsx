import { Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { PawPrint, X } from "lucide-react-native";
import type { Pet } from "@petto/contracts";
import { DraggableSheet } from "@/components/draggable-sheet";
import { mobileTheme, useTheme } from "@/lib/theme";

type PetSharePickerProps = {
  visible: boolean;
  pets: Pet[];
  onClose: () => void;
  onSelect: (pet: Pet) => void;
};

/**
 * Bottom-sheet modal letting the user choose which of their pets to share
 * into the current chat. Shows avatar, name, species/breed.
 */
export function PetSharePicker({
  visible,
  pets,
  onClose,
  onSelect
}: PetSharePickerProps) {
  const theme = useTheme();
  return (
    <DraggableSheet
      visible={visible}
      onClose={onClose}
      initialSnap="medium"
      snapPoints={{ medium: 0.55, large: 0.9 }}
    >
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: 4 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: mobileTheme.spacing.xl,
              marginBottom: 14
            }}
          >
            <PawPrint size={20} color={theme.colors.primary} />
            <Text
              style={{
                flex: 1,
                marginLeft: 10,
                fontSize: 18,
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold"
              }}
            >
              Share a pet
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={22} color={theme.colors.muted} />
            </Pressable>
          </View>

          {pets.length === 0 ? (
            <Text
              style={{
                textAlign: "center",
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium",
                paddingVertical: 24
              }}
            >
              You haven&apos;t added a pet yet.
            </Text>
          ) : (
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: mobileTheme.spacing.xl,
                gap: 10
              }}
            >
              {pets.map((pet) => {
                const photo = pet.photos?.find((p) => p.isPrimary)?.url ?? pet.photos?.[0]?.url;
                return (
                  <Pressable
                    key={pet.id}
                    onPress={() => onSelect(pet)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 14,
                      padding: 12,
                      borderRadius: mobileTheme.radius.lg,
                      backgroundColor: theme.colors.background,
                      borderWidth: 1,
                      borderColor: theme.colors.border
                    }}
                  >
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        overflow: "hidden",
                        backgroundColor: theme.colors.primaryBg,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      {photo ? (
                        <Image
                          source={{ uri: photo }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="cover"
                        />
                      ) : (
                        <PawPrint size={24} color={theme.colors.primary} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          color: theme.colors.ink,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {pet.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: theme.colors.muted,
                          fontFamily: "Inter_500Medium"
                        }}
                      >
                        {[pet.speciesLabel, pet.breedLabel].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </DraggableSheet>
  );
}
