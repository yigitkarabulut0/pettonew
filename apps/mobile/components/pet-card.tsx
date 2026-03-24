import type { DiscoveryCard, Pet } from "@petto/contracts";
import { Image, Modal, Pressable, ScrollView, Text, View } from "react-native";

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
        backgroundColor: mobileTheme.colors.surface,
        shadowColor: "#161514",
        shadowOpacity: 0.14,
        shadowOffset: { width: 0, height: 24 },
        shadowRadius: 80,
        elevation: 16
      }}
    >
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={{ width: "100%", height: 360 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            width: "100%",
            height: 360,
            backgroundColor: mobileTheme.colors.background,
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <Text selectable style={{ fontSize: 48 }}>
            🐾
          </Text>
        </View>
      )}
      <View style={{ padding: 18, gap: 10 }}>
        <Text
          selectable
          style={{
            color: mobileTheme.colors.ink,
            fontSize: 30,
            fontWeight: "700"
          }}
        >
          {card.pet.name}, {card.pet.ageYears}
        </Text>
        <Text
          selectable
          style={{ color: mobileTheme.colors.secondary, fontWeight: "600" }}
        >
          {card.pet.breedLabel} • {card.distanceLabel}
        </Text>
        <Text
          selectable
          style={{ color: mobileTheme.colors.muted, lineHeight: 22 }}
        >
          {card.pet.bio}
        </Text>
        <Text
          selectable
          style={{ color: mobileTheme.colors.ink, lineHeight: 22 }}
        >
          {card.prompt}
        </Text>
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
        borderRadius: mobileTheme.radius.md,
        backgroundColor: mobileTheme.colors.surface,
        borderWidth: 1,
        borderColor: isActive
          ? mobileTheme.colors.primary
          : mobileTheme.colors.border,
        overflow: "hidden"
      }}
    >
      {pet.photos[0]?.url ? (
        <Image
          source={{ uri: pet.photos[0].url }}
          style={{ height: 190, width: "100%" }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            height: 190,
            width: "100%",
            backgroundColor: mobileTheme.colors.background,
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <Text selectable style={{ fontSize: 36 }}>
            🐾
          </Text>
        </View>
      )}
      <View style={{ padding: 16, gap: 8 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12
          }}
        >
          <Text
            selectable
            style={{
              fontSize: 22,
              fontWeight: "700",
              color: mobileTheme.colors.ink
            }}
          >
            {pet.name}
          </Text>
          {isActive ? (
            <View
              style={{
                borderRadius: 999,
                backgroundColor: mobileTheme.colors.primarySoft,
                paddingHorizontal: 10,
                paddingVertical: 6
              }}
            >
              <Text
                selectable
                style={{
                  color: mobileTheme.colors.secondary,
                  fontWeight: "700",
                  fontSize: 12
                }}
              >
                Active
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          selectable
          style={{ color: mobileTheme.colors.secondary, fontWeight: "600" }}
        >
          {pet.speciesLabel} • {pet.breedLabel} • {pet.ageYears} years
        </Text>
        <Text
          selectable
          style={{ color: mobileTheme.colors.muted, lineHeight: 22 }}
          numberOfLines={3}
        >
          {pet.bio}
        </Text>
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
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: mobileTheme.colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 36 }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16
            }}
          >
            <View style={{ gap: 6 }}>
              <Text
                selectable
                style={{
                  color: mobileTheme.colors.secondary,
                  fontWeight: "700",
                  letterSpacing: 1.2
                }}
              >
                PET PROFILE
              </Text>
              <Text
                selectable
                style={{
                  fontSize: 32,
                  fontWeight: "800",
                  color: mobileTheme.colors.ink
                }}
              >
                {pet?.name || "Pet"}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: mobileTheme.colors.border,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: "#FFFFFF"
              }}
            >
              <Text
                selectable
                style={{
                  color: mobileTheme.colors.secondary,
                  fontWeight: "700"
                }}
              >
                Close
              </Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
          >
            {(pet?.photos ?? []).map((photo) => (
              <Image
                key={photo.id}
                source={{ uri: photo.url }}
                style={{
                  width: 260,
                  height: 320,
                  borderRadius: 28,
                  backgroundColor: mobileTheme.colors.surface
                }}
                resizeMode="cover"
              />
            ))}
          </ScrollView>

          <View
            style={{
              borderRadius: 28,
              backgroundColor: mobileTheme.colors.surface,
              padding: 18,
              gap: 14
            }}
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <InfoPill label={`${pet?.ageYears ?? "-"} years`} />
              <InfoPill label={pet?.speciesLabel || "Unknown species"} />
              <InfoPill label={pet?.breedLabel || "Unknown breed"} />
              <InfoPill
                label={
                  pet
                    ? ACTIVITY_COPY[pet.activityLevel as 1 | 2 | 3 | 4 | 5]
                    : "Activity"
                }
              />
              <InfoPill label={pet?.isNeutered ? "Neutered" : "Not neutered"} />
            </View>

            <Section title="About">
              <Text
                selectable
                style={{ color: mobileTheme.colors.muted, lineHeight: 24 }}
              >
                {pet?.bio || "No bio added yet."}
              </Text>
            </Section>

            <Section title="Hobbies">
              <WrapList
                items={pet?.hobbies ?? []}
                emptyLabel="No hobbies selected yet."
              />
            </Section>

            <Section title="Good with">
              <WrapList
                items={pet?.goodWith ?? []}
                emptyLabel="No compatibility tags selected yet."
              />
            </Section>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Section({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Text
        selectable
        style={{
          color: mobileTheme.colors.secondary,
          fontWeight: "700",
          fontSize: 16
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function WrapList({
  items,
  emptyLabel
}: {
  items: string[];
  emptyLabel: string;
}) {
  if (!items.length) {
    return (
      <Text
        selectable
        style={{ color: mobileTheme.colors.muted, lineHeight: 22 }}
      >
        {emptyLabel}
      </Text>
    );
  }

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {items.map((item) => (
        <InfoPill key={item} label={item} />
      ))}
    </View>
  );
}

function InfoPill({ label }: { label: string }) {
  return (
    <View
      style={{
        borderRadius: 999,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: mobileTheme.colors.border,
        paddingHorizontal: 12,
        paddingVertical: 8
      }}
    >
      <Text
        selectable
        style={{ color: mobileTheme.colors.secondary, fontWeight: "700" }}
      >
        {label}
      </Text>
    </View>
  );
}
