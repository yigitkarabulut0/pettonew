import type { Pet } from "@petto/contracts";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  View
} from "react-native";
import { Image } from "expo-image";
import { useState, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Activity,
  BookOpen,
  Calendar,
  CheckCircle2,
  Flag,
  Heart,
  MapPin,
  QrCode,
  Scale,
  Share2,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  X
} from "lucide-react-native";

import { AgeCalculator } from "@/components/age-calculator";
import { mobileTheme, useTheme } from "@/lib/theme";
import { QRCodeModal } from "@/components/qr-code-modal";
import { ReportModal } from "@/components/report-modal";
import { useSessionStore } from "@/store/session";

const ACTIVITY_COPY: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Very calm",
  2: "Relaxed",
  3: "Balanced",
  4: "Active",
  5: "Very active"
};

const ACTIVITY_COLORS: Record<number, string> = {
  1: "#5B9BD5",
  2: "#7EB87A",
  3: "#F7B267",
  4: "#E6694A",
  5: "#C95438"
};

function formatAge(value: number | undefined | null): string {
  if (value == null) return "—";
  return `${value}y`;
}

export function DiscoveryPetCard({
  card
}: {
  card: import("@petto/contracts").DiscoveryCard;
}) {
  const theme = useTheme();
  const photoUrl = card.pet.photos[0]?.url;

  return (
    <View
      style={{
        borderRadius: mobileTheme.radius.lg,
        overflow: "hidden",
        backgroundColor: theme.colors.white,
        ...mobileTheme.shadow.lg
      }}
    >
      {photoUrl && photoUrl.length > 0 ? (
        <Image
          source={{ uri: photoUrl }}
          style={{ width: "100%", height: 380 }}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View
          style={{
            width: "100%",
            height: 380,
            backgroundColor: theme.colors.background,
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <Sparkles size={40} color={theme.colors.muted} />
        </View>
      )}
      <View
        style={{ padding: mobileTheme.spacing.xl, gap: mobileTheme.spacing.sm }}
      >
        <Text
          style={{
            color: theme.colors.ink,
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
            color: theme.colors.secondary,
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
              color: theme.colors.muted,
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
              color: theme.colors.ink,
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
  const theme = useTheme();
  const content = (
    <View
      style={{
        borderRadius: mobileTheme.radius.lg,
        backgroundColor: theme.colors.white,
        borderWidth: 1,
        borderColor: isActive
          ? theme.colors.primary
          : theme.colors.border,
        overflow: "hidden",
        ...mobileTheme.shadow.sm
      }}
    >
      {pet.photos[0]?.url && pet.photos[0].url.length > 0 ? (
        <Image
          source={{ uri: pet.photos[0].url }}
          style={{ height: 180, width: "100%" }}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View
          style={{
            height: 180,
            width: "100%",
            backgroundColor: theme.colors.background,
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <Sparkles size={32} color={theme.colors.muted} />
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
              color: theme.colors.ink,
              fontFamily: "Inter_600SemiBold"
            }}
          >
            {pet.name}
          </Text>
          {isActive ? (
            <View
              style={{
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: theme.colors.primaryBg,
                paddingHorizontal: 10,
                paddingVertical: 4
              }}
            >
              <Text
                style={{
                  color: theme.colors.primary,
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
            color: theme.colors.muted,
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
              color: theme.colors.muted,
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
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const photos = (pet?.photos ?? []).filter((p) => p.url && p.url.length > 0);
  const hobbies = pet?.hobbies ?? [];
  const goodWith = pet?.goodWith ?? [];
  const screenWidth = Dimensions.get("window").width;
  const [activePhoto, setActivePhoto] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const galleryRef = useRef<ScrollView>(null);
  const session = useSessionStore((s) => s.session);
  const isOwnPet = pet?.ownerId === session?.user.id;

  if (!pet) return null;

  const activityLevel = pet.activityLevel as 1 | 2 | 3 | 4 | 5;
  const activityColor =
    ACTIVITY_COLORS[activityLevel] ?? theme.colors.primary;

  const hasDetails =
    pet.bio ||
    hobbies.length > 0 ||
    goodWith.length > 0 ||
    pet.cityLabel ||
    pet.isNeutered ||
    activityLevel;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            flexDirection: "row",
            alignItems: "center",
            paddingTop: insets.top + mobileTheme.spacing.md,
            paddingBottom: mobileTheme.spacing.md,
            paddingHorizontal: mobileTheme.spacing.xl,
            gap: 10
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "rgba(0,0,0,0.35)",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <X size={18} color={theme.colors.white} />
            </Pressable>
            {!isOwnPet && (
              <Pressable
                onPress={() => setReportOpen(true)}
                hitSlop={12}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "rgba(0,0,0,0.35)",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Flag size={16} color={theme.colors.white} />
              </Pressable>
            )}
            <Pressable
              onPress={() => setQrOpen(true)}
              hitSlop={12}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "rgba(0,0,0,0.35)",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <QrCode size={16} color={theme.colors.white} />
            </Pressable>
            <Pressable
              onPress={() => {
                Share.share({
                  message: `Check out ${pet.name} on Fetcht! ${pet.speciesLabel} - ${pet.breedLabel}. Download Fetcht to find playmates for your pet.`,
                  title: `Meet ${pet.name} on Fetcht`
                });
              }}
              hitSlop={12}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "rgba(0,0,0,0.35)",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Share2 size={16} color={theme.colors.white} />
            </Pressable>
          </View>
          <View style={{ flex: 1 }} />

          {photos.length > 1 && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "rgba(0,0,0,0.35)",
                borderRadius: mobileTheme.radius.pill,
                paddingHorizontal: 12,
                paddingVertical: 6
              }}
            >
              <Text
                style={{
                  color: theme.colors.white,
                  fontSize: 12,
                  fontWeight: "600",
                  fontFamily: "Inter_600SemiBold",
                  letterSpacing: 0.3
                }}
              >
                {activePhoto + 1} / {photos.length}
              </Text>
            </View>
          )}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
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
                    style={{ width: screenWidth, height: 420 }}
                    contentFit="cover"
                    transition={200}
                  />
                ))}
              </ScrollView>
            ) : (
              <View
                style={{
                  width: "100%",
                  height: 420,
                  backgroundColor: theme.colors.surface,
                  justifyContent: "center",
                  alignItems: "center"
                }}
              >
                <Sparkles size={48} color={theme.colors.muted} />
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
                      width: i === activePhoto ? 24 : 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor:
                        i === activePhoto
                          ? theme.colors.white
                          : "rgba(255,255,255,0.35)"
                    }}
                  />
                ))}
              </View>
            )}
          </View>

          <View
            style={{
              paddingHorizontal: mobileTheme.spacing.xl,
              paddingTop: mobileTheme.spacing["2xl"],
              gap: mobileTheme.spacing.xl
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: mobileTheme.typography.heading.fontSize,
                  fontWeight: mobileTheme.typography.heading.fontWeight,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold",
                  lineHeight: mobileTheme.typography.heading.lineHeight
                }}
              >
                {pet.name}
              </Text>
              <Text
                style={{
                  color: theme.colors.muted,
                  fontSize: mobileTheme.typography.caption.fontSize,
                  fontFamily: "Inter_500Medium",
                  marginTop: mobileTheme.spacing.xs
                }}
              >
                {pet.breedLabel} &middot; {pet.speciesLabel}
                {pet.ageYears != null
                  ? ` \u00B7 ${formatAge(pet.ageYears)}`
                  : ""}
              </Text>
            </View>

            {hasDetails && (
              <View
                style={{
                  backgroundColor: theme.colors.white,
                  borderRadius: mobileTheme.radius.lg,
                  padding: mobileTheme.spacing.xl,
                  gap: mobileTheme.spacing.lg,
                  ...mobileTheme.shadow.sm
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: mobileTheme.spacing.sm,
                    flexWrap: "wrap"
                  }}
                >
                  <StatChip
                    icon={ShieldCheck}
                    label={ACTIVITY_COPY[activityLevel]}
                    accentColor={activityColor}
                  />
                  <StatChip
                    icon={pet.isNeutered ? CheckCircle2 : Calendar}
                    label={pet.isNeutered ? "Neutered" : "Not neutered"}
                  />
                  {pet.cityLabel ? (
                    <StatChip icon={MapPin} label={pet.cityLabel} />
                  ) : null}
                </View>

                {pet.bio ? (
                  <View style={{ gap: mobileTheme.spacing.sm }}>
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                        fontWeight: "700",
                        color: theme.colors.ink,
                        fontFamily: "Inter_700Bold"
                      }}
                    >
                      About
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.ink,
                        lineHeight: mobileTheme.typography.body.lineHeight,
                        fontSize: mobileTheme.typography.body.fontSize,
                        fontFamily: "Inter_400Regular"
                      }}
                    >
                      {pet.bio}
                    </Text>
                  </View>
                ) : null}

                {hobbies.length > 0 ? (
                  <View style={{ gap: mobileTheme.spacing.sm }}>
                    <Text
                      style={{
                        color: theme.colors.ink,
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
                        <TagChip key={item} label={item} />
                      ))}
                    </View>
                  </View>
                ) : null}

                {goodWith.length > 0 ? (
                  <View style={{ gap: mobileTheme.spacing.sm }}>
                    <Text
                      style={{
                        color: theme.colors.ink,
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
                        <TagChip key={item} label={item} />
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            )}

            <AgeCalculator
              petName={pet.name}
              ageYears={pet.ageYears}
              speciesLabel={pet.speciesLabel}
            />

            {isOwnPet && (
              <>
                <View style={{ flexDirection: "row", gap: mobileTheme.spacing.sm }}>
                  {[
                    { label: "Health", icon: Activity, route: `/(app)/pet-health/${pet.id}` },
                    { label: "Weight", icon: Scale, route: `/(app)/pet-weight/${pet.id}` },
                    { label: "Feeding", icon: UtensilsCrossed, route: `/(app)/feeding/${pet.id}` }
                  ].map((action) => (
                    <Pressable
                      key={action.label}
                      onPress={() => {
                        onClose();
                        router.push(action.route as any);
                      }}
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: mobileTheme.spacing.xs,
                        paddingVertical: mobileTheme.spacing.md,
                        borderRadius: mobileTheme.radius.md,
                        backgroundColor: theme.colors.surface,
                        borderWidth: 1,
                        borderColor: theme.colors.border
                      }}
                    >
                      <action.icon size={14} color={theme.colors.primary} />
                      <Text
                        style={{
                          fontSize: mobileTheme.typography.micro.fontSize,
                          fontFamily: "Inter_600SemiBold",
                          color: theme.colors.primary
                        }}
                      >
                        {action.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Diary Button */}
                <Pressable
                  onPress={() => {
                    onClose();
                    router.push(`/(app)/diary/${pet.id}`);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: mobileTheme.spacing.sm,
                    backgroundColor: theme.colors.primaryBg,
                    borderRadius: mobileTheme.radius.lg,
                    paddingVertical: mobileTheme.spacing.lg,
                    ...mobileTheme.shadow.sm
                  }}
                >
                  <BookOpen size={18} color={theme.colors.primary} />
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                      fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                      color: theme.colors.primary,
                      fontFamily: "Inter_600SemiBold"
                    }}
                  >
                    View Diary
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>

        <ReportModal
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="pet"
          targetID={pet.id}
          targetLabel={pet.name}
        />

        <QRCodeModal
          visible={qrOpen}
          petId={pet.id}
          petName={pet.name}
          onClose={() => setQrOpen(false)}
        />
      </View>
    </Modal>
  );
}

function StatChip({
  label,
  icon: Icon,
  accentColor
}: {
  label: string;
  icon?: React.ComponentType<{ size: number; color: string }>;
  accentColor?: string;
}) {
  const theme = useTheme();
  const color = accentColor ?? theme.colors.secondary;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: accentColor
          ? `${color}10`
          : theme.colors.background,
        borderWidth: 1,
        borderColor: accentColor ? `${color}20` : theme.colors.border,
        paddingHorizontal: 10,
        paddingVertical: 6
      }}
    >
      {Icon ? <Icon size={13} color={color} /> : null}
      <Text
        style={{
          color,
          fontWeight: "600",
          fontSize: 12,
          fontFamily: "Inter_600SemiBold"
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function TagChip({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingHorizontal: 12,
        paddingVertical: 6
      }}
    >
      <Text
        style={{
          color: theme.colors.ink,
          fontWeight: "500",
          fontSize: 13,
          fontFamily: "Inter_500Medium"
        }}
      >
        {label}
      </Text>
    </View>
  );
}
