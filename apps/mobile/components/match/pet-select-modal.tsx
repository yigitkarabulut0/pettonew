import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react-native";

import { mobileTheme, useTheme } from "@/lib/theme";
import type { Pet } from "@petto/contracts";

interface PetSelectModalProps {
  visible: boolean;
  pets: Pet[];
  activePetId: string | null;
  onSelect: (pet: Pet) => void;
  onClose: () => void;
}

export function PetSelectModal({
  visible,
  pets,
  activePetId,
  onSelect,
  onClose
}: PetSelectModalProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: insets.top + mobileTheme.spacing.md,
            paddingBottom: mobileTheme.spacing.md,
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
            {t("match.petSelect.switchPet")}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={22} color={theme.colors.ink} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingVertical: mobileTheme.spacing.sm,
            gap: mobileTheme.spacing.sm
          }}
        >
          <Text
            style={{
              fontSize: mobileTheme.typography.caption.fontSize,
              fontFamily: "Inter_500Medium",
              color: theme.colors.muted,
              marginBottom: mobileTheme.spacing.sm
            }}
          >
            {t("match.petSelect.chooseWhichPet")}
          </Text>
          {pets.map((pet) => {
            const isActive = pet.id === activePetId;
            return (
              <Pressable
                key={pet.id}
                onPress={() => onSelect(pet)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: mobileTheme.spacing.md,
                  padding: mobileTheme.spacing.lg,
                  borderRadius: mobileTheme.radius.lg,
                  backgroundColor: theme.colors.surface,
                  borderWidth: isActive ? 2 : 1,
                  borderColor: isActive
                    ? theme.colors.primary
                    : theme.colors.border,
                  ...mobileTheme.shadow.sm,
                  opacity: pressed ? 0.85 : 1
                })}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    overflow: "hidden",
                    backgroundColor: theme.colors.background
                  }}
                >
                  {pet.photos[0]?.url ? (
                    <Image
                      source={{ uri: pet.photos[0].url }}
                      style={{ width: "100%", height: "100%", backgroundColor: theme.colors.primaryBg }}
                      contentFit="cover"
                      transition={250}
                      cachePolicy="memory-disk"
                      recyclingKey={pet.id}
                    />
                  ) : (
                    <View
                      style={{
                        flex: 1,
                        justifyContent: "center",
                        alignItems: "center"
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: theme.colors.primary,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {pet.name.charAt(0)}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                      fontWeight:
                        mobileTheme.typography.bodySemiBold.fontWeight,
                      color: theme.colors.ink,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    {pet.name}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.muted,
                      fontSize: mobileTheme.typography.caption.fontSize,
                      fontFamily: "Inter_400Regular"
                    }}
                  >
                    {pet.speciesLabel} &middot; {pet.breedLabel} &middot;{" "}
                    {pet.ageYears}y
                  </Text>
                </View>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: isActive
                      ? theme.colors.primary
                      : "transparent",
                    borderWidth: 2,
                    borderColor: isActive
                      ? theme.colors.primary
                      : theme.colors.border,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {isActive && (
                    <Check size={14} color={theme.colors.white} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
