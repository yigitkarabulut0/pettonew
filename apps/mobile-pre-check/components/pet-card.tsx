import type { DiscoveryCard, Pet } from "@petto/contracts";
import { Ionicons } from "@expo/vector-icons";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { mobileTheme } from "@/lib/theme";

const c = mobileTheme.colors;
const f = mobileTheme.fontFamily;
const r = mobileTheme.radius;

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
    <View style={styles.discoveryCard}>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={styles.discoveryPhoto}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.discoveryPhotoPlaceholder}>
          <Ionicons name="paw-outline" size={40} color={c.inactive} />
        </View>
      )}
      <View style={styles.discoveryContent}>
        <Text style={styles.discoveryName}>
          {card.pet.name}, {card.pet.ageYears}
        </Text>
        <Text style={styles.discoveryMeta}>
          {card.pet.breedLabel} &middot; {card.distanceLabel}
        </Text>
        <Text style={styles.discoveryBio}>{card.pet.bio}</Text>
        <Text style={styles.discoveryPrompt}>{card.prompt}</Text>
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
    <View style={[styles.compactCard, isActive && styles.compactCardActive]}>
      {pet.photos[0]?.url ? (
        <Image
          source={{ uri: pet.photos[0].url }}
          style={styles.compactPhoto}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.compactPhotoPlaceholder}>
          <Ionicons name="paw-outline" size={32} color={c.inactive} />
        </View>
      )}
      <View style={styles.compactContent}>
        <View style={styles.compactHeader}>
          <Text style={styles.compactName}>{pet.name}</Text>
          {isActive ? (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.compactMeta}>
          {pet.speciesLabel} &middot; {pet.breedLabel} &middot; {pet.ageYears}y
        </Text>
        <Text style={styles.compactBio} numberOfLines={3}>
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
      <View style={styles.modalContainer}>
        <ScrollView
          contentContainerStyle={styles.modalScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleGroup}>
              <Text style={styles.modalEyebrow}>PET PROFILE</Text>
              <Text style={styles.modalTitle}>{pet?.name || "Pet"}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={c.muted} />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoScroll}
          >
            {(pet?.photos ?? []).map((photo) => (
              <Image
                key={photo.id}
                source={{ uri: photo.url }}
                style={styles.modalPhoto}
                resizeMode="cover"
              />
            ))}
          </ScrollView>

          <View style={styles.infoCard}>
            <View style={styles.pillRow}>
              <InfoPill label={`${pet?.ageYears ?? "-"} years`} />
              <InfoPill label={pet?.speciesLabel || "Unknown"} />
              <InfoPill label={pet?.breedLabel || "Unknown breed"} />
              <InfoPill
                label={pet ? ACTIVITY_COPY[pet.activityLevel] : "Activity"}
              />
              <InfoPill label={pet?.isNeutered ? "Neutered" : "Not neutered"} />
            </View>

            <Section title="About">
              <Text style={styles.sectionBody}>
                {pet?.bio || "No bio added yet."}
              </Text>
            </Section>

            <Section title="Hobbies">
              <WrapList
                items={pet?.hobbies ?? []}
                emptyLabel="No hobbies selected."
              />
            </Section>

            <Section title="Good with">
              <WrapList
                items={pet?.goodWith ?? []}
                emptyLabel="No compatibility tags selected."
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
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
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
    return <Text style={styles.emptyText}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.pillRow}>
      {items.map((item) => (
        <InfoPill key={item} label={item} />
      ))}
    </View>
  );
}

function InfoPill({ label }: { label: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  discoveryCard: {
    borderRadius: r.xl,
    overflow: "hidden",
    backgroundColor: c.surface,
    shadowColor: c.ink,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 40,
    elevation: 12
  },
  discoveryPhoto: {
    width: "100%",
    height: 340
  },
  discoveryPhotoPlaceholder: {
    width: "100%",
    height: 340,
    backgroundColor: c.canvas,
    justifyContent: "center",
    alignItems: "center"
  },
  discoveryContent: {
    padding: 18,
    gap: 8
  },
  discoveryName: {
    color: c.ink,
    fontSize: 26,
    fontWeight: "700" as const,
    fontFamily: f
  },
  discoveryMeta: {
    color: c.secondary,
    fontWeight: "500" as const,
    fontSize: 14,
    fontFamily: f
  },
  discoveryBio: {
    color: c.muted,
    lineHeight: 22,
    fontSize: 15,
    fontFamily: f
  },
  discoveryPrompt: {
    color: c.ink,
    lineHeight: 22,
    fontSize: 15,
    fontFamily: f
  },

  compactCard: {
    borderRadius: r.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    overflow: "hidden"
  },
  compactCardActive: {
    borderColor: c.primary,
    borderWidth: 1.5
  },
  compactPhoto: {
    height: 180,
    width: "100%"
  },
  compactPhotoPlaceholder: {
    height: 180,
    width: "100%",
    backgroundColor: c.canvas,
    justifyContent: "center",
    alignItems: "center"
  },
  compactContent: {
    padding: 14,
    gap: 6
  },
  compactHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  compactName: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: c.ink,
    fontFamily: f
  },
  compactMeta: {
    color: c.muted,
    fontWeight: "500" as const,
    fontSize: 13,
    fontFamily: f
  },
  compactBio: {
    color: c.muted,
    lineHeight: 20,
    fontSize: 14,
    fontFamily: f
  },
  activeBadge: {
    borderRadius: r.pill,
    backgroundColor: c.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  activeBadgeText: {
    color: c.secondary,
    fontWeight: "600" as const,
    fontSize: 11,
    fontFamily: f
  },

  modalContainer: {
    flex: 1,
    backgroundColor: c.canvas
  },
  modalScroll: {
    padding: 20,
    gap: 18,
    paddingBottom: 36
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16
  },
  modalTitleGroup: {
    gap: 4,
    flex: 1
  },
  modalEyebrow: {
    color: c.secondary,
    fontWeight: "600" as const,
    letterSpacing: 1,
    fontSize: 11,
    fontFamily: f,
    textTransform: "uppercase"
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: c.ink,
    fontFamily: f
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: r.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center"
  },
  photoScroll: {
    gap: 12
  },
  modalPhoto: {
    width: 240,
    height: 300,
    borderRadius: r.lg,
    backgroundColor: c.surface
  },
  infoCard: {
    borderRadius: r.xl,
    backgroundColor: c.surface,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: c.border
  },
  section: {
    gap: 8
  },
  sectionTitle: {
    color: c.secondary,
    fontWeight: "600" as const,
    fontSize: 14,
    fontFamily: f
  },
  sectionBody: {
    color: c.muted,
    lineHeight: 22,
    fontSize: 15,
    fontFamily: f
  },
  emptyText: {
    color: c.muted,
    lineHeight: 20,
    fontSize: 14,
    fontFamily: f
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  pill: {
    borderRadius: r.md,
    backgroundColor: c.canvas,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  pillText: {
    color: c.secondary,
    fontWeight: "500" as const,
    fontSize: 13,
    fontFamily: f
  }
});
