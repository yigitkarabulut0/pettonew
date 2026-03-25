import type { DiscoveryCard, Pet } from "@petto/contracts";
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View
} from "react-native";
import { useState, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapPin, X } from "lucide-react-native";

import { mobileTheme } from "@/lib/theme";

const ACTIVITY_COPY: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Very calm",
  2: "Relaxed",
  3: "Balanced",
  4: "Active",
  5: "Very active"
};

export function DiscoveryPetCard({ card }: { card: DiscoveryCard }) {
  const photoUrl = card.pet.photos[0]?.url;

  return (
    <View
      style={{
        borderRadius: mobileTheme.radius.lg,
        overflow: "hidden",
        backgroundColor: mobileTheme.colors.white,
        ...mobileTheme.shadow.lg
      }}
    >
      {photoUrl && photoUrl.length > 0 ? (
        <Image
          source={{ uri: photoUrl }}
          style={{ width: "100%", height: 380 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            width: "100%",
            height: 380,
            backgroundColor: mobileTheme.colors.background,
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <Text style={{ fontSize: 48, color: mobileTheme.colors.muted }}>
            🐾
          </Text>
        </View>
      )}
      <View
        style={{ padding: mobileTheme.spacing.xl, gap: mobileTheme.spacing.sm }}
      >
        <Text
          style={{
            color: mobileTheme.colors.ink,
            fontSize: mobileTheme.typography.heading.fontSize,
            fontWeight: mobileTheme.typography.heading.fontWeight,
            fontFamily: "Inter_700Bold",
            lineHeight: mobileTheme.typography.heading.lineHeight
          }}
        >
          {card.pet.name}, {card.pet.ageYears}
        </Text>
        <Text
          style={{
            color: mobileTheme.colors.secondary,
            fontWeight: "600",
            fontSize: mobileTheme.typography.caption.fontSize,
            fontFamily: "Inter_600SemiBold"
          }}
        >
          {card.pet.breedLabel} &middot; {card.distanceLabel}
        </Text>
        {card.pet.bio ? (
          <Text
            style={{
              color: mobileTheme.colors.muted,
              lineHeight: mobileTheme.typography.body.lineHeight,
              fontSize: mobileTheme.typography.body.fontSize,
              fontFamily: "Inter_400Regular"
            }}
          >
            {card.pet.bio}
          </Text>
        ) : null}
        {card.prompt ? (
          <Text
            style={{
              color: mobileTheme.colors.ink,
              lineHeight: mobileTheme.typography.body.lineHeight,
              fontSize: mobileTheme.typography.body.fontSize,
              fontFamily: "Inter_400Regular",
              marginTop: mobileTheme.spacing.xs
            }}
          >
            {card.prompt}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function CompactPetCard({
  pet,
  isActive = false,
  onPress
}: {
  pet: Pet;
  isActive?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <View
      style={{
        borderRadius: mobileTheme.radius.lg,
        backgroundColor: mobileTheme.colors.white,
        borderWidth: 1,
        borderColor: isActive
          ? mobileTheme.colors.primary
          : mobileTheme.colors.border,
        overflow: "hidden",
        ...mobileTheme.shadow.sm
      }}
    >
      {pet.photos[0]?.url && pet.photos[0].url.length > 0 ? (
        <Image
          source={{ uri: pet.photos[0].url }}
          style={{ height: 180, width: "100%" }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            height: 180,
            width: "100%",
            backgroundColor: mobileTheme.colors.background,
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <Text style={{ fontSize: 32, color: mobileTheme.colors.muted }}>
            🐾
          </Text>
        </View>
      )}
      <View
        style={{ padding: mobileTheme.spacing.lg, gap: mobileTheme.spacing.sm }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: mobileTheme.spacing.md
          }}
        >
          <Text
            style={{
              fontSize: mobileTheme.typography.subheading.fontSize,
              fontWeight: mobileTheme.typography.subheading.fontWeight,
              color: mobileTheme.colors.ink,
              fontFamily: "Inter_600SemiBold"
            }}
          >
            {pet.name}
          </Text>
          {isActive ? (
            <View
              style={{
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: mobileTheme.colors.primaryBg,
                paddingHorizontal: 10,
                paddingVertical: 4
              }}
            >
              <Text
                style={{
                  color: mobileTheme.colors.primary,
                  fontWeight: "700",
                  fontSize: mobileTheme.typography.micro.fontSize,
                  fontFamily: "Inter_700Bold"
                }}
              >
                Active
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={{
            color: mobileTheme.colors.muted,
            fontSize: mobileTheme.typography.caption.fontSize,
            fontFamily: "Inter_500Medium"
          }}
        >
          {pet.speciesLabel} &middot; {pet.breedLabel} &middot; {pet.ageYears}y
        </Text>
        {pet.bio ? (
          <Text
            numberOfLines={2}
            style={{
              color: mobileTheme.colors.muted,
              lineHeight: mobileTheme.typography.body.lineHeight,
              fontSize: mobileTheme.typography.body.fontSize,
              fontFamily: "Inter_400Regular"
            }}
          >
            {pet.bio}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return <Pressable onPress={onPress}>{content}</Pressable>;
}

export function PetDetailModal({
  pet,
  visible,
  onClose
}: {
  pet: Pet | null;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const photos = (pet?.photos ?? []).filter((p) => p.url && p.url.length > 0);
  const hobbies = pet?.hobbies ?? [];
  const goodWith = pet?.goodWith ?? [];
  const screenWidth = Dimensions.get("window").width;
  const [activePhoto, setActivePhoto] = useState(0);
  const galleryRef = useRef<ScrollView>(null);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: mobileTheme.colors.background }}>
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: insets.top + mobileTheme.spacing.md,
            paddingBottom: mobileTheme.spacing.md,
            paddingHorizontal: mobileTheme.spacing.xl
          }}
        >
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(0,0,0,0.4)",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <X size={20} color={mobileTheme.colors.white} />
          </Pressable>
          <View style={{ flex: 1 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        >
          <View style={{ position: "relative" }}>
            {photos.length > 0 ? (
              <ScrollView
                ref={galleryRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={(e) => {
                  const offset = e.nativeEvent.contentOffset.x;
                  const index = Math.round(offset / screenWidth);
                  setActivePhoto(index);
                }}
                scrollEventThrottle={16}
              >
                {photos.map((photo) => (
                  <Image
                    key={photo.id}
                    source={{ uri: photo.url }}
                    style={{ width: screenWidth, height: 400 }}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
            ) : (
              <View
                style={{
                  width: "100%",
                  height: 400,
                  backgroundColor: mobileTheme.colors.surface,
                  justifyContent: "center",
                  alignItems: "center"
                }}
              >
                <Text style={{ fontSize: 64, color: mobileTheme.colors.muted }}>
                  🐾
                </Text>
              </View>
            )}

            {photos.length > 1 && (
              <View
                style={{
                  position: "absolute",
                  bottom: mobileTheme.spacing.lg,
                  left: 0,
                  right: 0,
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 6
                }}
              >
                {photos.map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: i === activePhoto ? 20 : 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor:
                        i === activePhoto
                          ? mobileTheme.colors.white
                          : "rgba(255,255,255,0.4)"
                    }}
                  />
                ))}
              </View>
            )}
          </View>

          <View
            style={{
              paddingHorizontal: mobileTheme.spacing.xl,
              paddingTop: mobileTheme.spacing.xl,
              gap: mobileTheme.spacing.lg
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: mobileTheme.typography.display.fontSize,
                  fontWeight: mobileTheme.typography.display.fontWeight,
                  color: mobileTheme.colors.ink,
                  fontFamily: "Inter_800ExtraBold",
                  lineHeight: mobileTheme.typography.display.lineHeight
                }}
              >
                {pet?.name}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: mobileTheme.spacing.sm,
                  marginTop: mobileTheme.spacing.sm
                }}
              >
                <Text
                  style={{
                    color: mobileTheme.colors.secondary,
                    fontWeight: "600",
                    fontSize: mobileTheme.typography.caption.fontSize,
                    fontFamily: "Inter_600SemiBold"
                  }}
                >
                  {pet?.breedLabel}
                </Text>
                <View
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: 1.5,
                    backgroundColor: mobileTheme.colors.muted
                  }}
                />
                <Text
                  style={{
                    color: mobileTheme.colors.muted,
                    fontSize: mobileTheme.typography.caption.fontSize,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  {pet?.speciesLabel} &middot; {pet?.ageYears ?? "-"} years old
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: mobileTheme.spacing.sm }}>
              <InfoPill
                label={
                  pet
                    ? ACTIVITY_COPY[pet.activityLevel as 1 | 2 | 3 | 4 | 5]
                    : "Activity"
                }
              />
              <InfoPill label={pet?.isNeutered ? "Neutered" : "Not neutered"} />
              {pet?.cityLabel ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    borderRadius: mobileTheme.radius.pill,
                    backgroundColor: mobileTheme.colors.background,
                    borderWidth: 1,
                    borderColor: mobileTheme.colors.border,
                    paddingHorizontal: mobileTheme.spacing.md,
                    paddingVertical: mobileTheme.spacing.sm + 2
                  }}
                >
                  <MapPin size={12} color={mobileTheme.colors.secondary} />
                  <Text
                    style={{
                      color: mobileTheme.colors.secondary,
                      fontWeight: "600",
                      fontSize: mobileTheme.typography.caption.fontSize,
                      fontFamily: "Inter_600SemiBold"
                    }}
                  >
                    {pet.cityLabel}
                  </Text>
                </View>
              ) : null}
            </View>

            {pet?.bio ? (
              <View
                style={{
                  backgroundColor: mobileTheme.colors.white,
                  borderRadius: mobileTheme.radius.lg,
                  padding: mobileTheme.spacing.xl,
                  ...mobileTheme.shadow.sm
                }}
              >
                <Text
                  style={{
                    color: mobileTheme.colors.ink,
                    fontWeight: "700",
                    fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                    fontFamily: "Inter_700Bold",
                    marginBottom: mobileTheme.spacing.sm
                  }}
                >
                  About
                </Text>
                <Text
                  style={{
                    color: mobileTheme.colors.ink,
                    lineHeight: mobileTheme.typography.body.lineHeight,
                    fontSize: mobileTheme.typography.body.fontSize,
                    fontFamily: "Inter_400Regular"
                  }}
                >
                  {pet.bio}
                </Text>
              </View>
            ) : null}

            {hobbies.length > 0 || goodWith.length > 0 ? (
              <View
                style={{
                  backgroundColor: mobileTheme.colors.white,
                  borderRadius: mobileTheme.radius.lg,
                  padding: mobileTheme.spacing.xl,
                  gap: mobileTheme.spacing.lg,
                  ...mobileTheme.shadow.sm
                }}
              >
                {hobbies.length > 0 ? (
                  <View style={{ gap: mobileTheme.spacing.sm }}>
                    <Text
                      style={{
                        color: mobileTheme.colors.ink,
                        fontWeight: "700",
                        fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                        fontFamily: "Inter_700Bold"
                      }}
                    >
                      Hobbies
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: mobileTheme.spacing.sm
                      }}
                    >
                      {hobbies.map((item) => (
                        <InfoPill key={item} label={item} />
                      ))}
                    </View>
                  </View>
                ) : null}
                {goodWith.length > 0 ? (
                  <View style={{ gap: mobileTheme.spacing.sm }}>
                    <Text
                      style={{
                        color: mobileTheme.colors.ink,
                        fontWeight: "700",
                        fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                        fontFamily: "Inter_700Bold"
                      }}
                    >
                      Good with
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: mobileTheme.spacing.sm
                      }}
                    >
                      {goodWith.map((item) => (
                        <InfoPill key={item} label={item} />
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function InfoPill({ label }: { label: string }) {
  return (
    <View
      style={{
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: mobileTheme.colors.background,
        borderWidth: 1,
        borderColor: mobileTheme.colors.border,
        paddingHorizontal: mobileTheme.spacing.md,
        paddingVertical: mobileTheme.spacing.sm + 2
      }}
    >
      <Text
        style={{
          color: mobileTheme.colors.secondary,
          fontWeight: "600",
          fontSize: mobileTheme.typography.caption.fontSize,
          fontFamily: "Inter_600SemiBold"
        }}
      >
        {label}
      </Text>
    </View>
  );
}
