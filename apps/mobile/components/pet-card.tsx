import type { Pet } from "@petto/contracts";
import { useRouter } from "expo-router";
import {
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
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import {
  Activity,
  BookOpen,
  Calendar,
  CheckCircle2,
  Flag,
  Heart,
  MapPin,
  PawPrint,
  Pencil,
  QrCode,
  ShieldCheck,
  Share2,
  Sparkles,
  X
} from "lucide-react-native";

import { mobileTheme, useTheme } from "@/lib/theme";
import { QRCodeModal } from "@/components/qr-code-modal";
import { ReportModal } from "@/components/report-modal";
import { useSessionStore } from "@/store/session";

const ACTIVITY_KEYS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "onboarding.pets.activityVeryCalmShort",
  2: "onboarding.pets.activityRelaxed",
  3: "onboarding.pets.activityBalanced",
  4: "onboarding.pets.activityActive",
  5: "onboarding.pets.activityVeryActive"
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
  const { t } = useTranslation();
  const content = (
    <View
      style={{
        borderRadius: mobileTheme.radius.lg,
        backgroundColor: theme.colors.white,
        borderWidth: 1,
        borderColor: isActive ? theme.colors.primary : theme.colors.border,
        overflow: "hidden",
        ...mobileTheme.shadow.sm
      }}
    >
      {pet.photos[0]?.url && pet.photos[0].url.length > 0 ? (
        <View style={{ position: "relative" }}>
          <Image
            source={{ uri: pet.photos[0].url }}
            style={{
              height: 160,
              width: "100%",
              backgroundColor: theme.colors.primaryBg
            }}
            contentFit="cover"
            transition={250}
            cachePolicy="memory-disk"
            recyclingKey={pet.id}
          />
          <LinearGradient
            colors={["transparent", "rgba(22,21,20,0.55)"]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 80
            }}
          />
          <View
            style={{
              position: "absolute",
              left: 14,
              bottom: 12,
              right: 14
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: "#FFFFFF",
                fontSize: 20,
                fontFamily: "Inter_700Bold"
              }}
            >
              {pet.name}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: "rgba(255,255,255,0.85)",
                fontSize: 11,
                marginTop: 1,
                fontFamily: "Inter_500Medium"
              }}
            >
              {[pet.speciesLabel, pet.breedLabel, `${pet.ageYears}y`]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          {isActive ? (
            <View
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: theme.colors.primary,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: mobileTheme.radius.pill
              }}
            >
              <Sparkles size={11} color={theme.colors.white} />
              <Text
                style={{
                  color: theme.colors.white,
                  fontSize: 10,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {t("profile.active")}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View
          style={{
            height: 160,
            width: "100%",
            backgroundColor: theme.colors.primaryBg,
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <PawPrint size={40} color={theme.colors.primary} />
        </View>
      )}
      {pet.bio ? (
        <View style={{ padding: mobileTheme.spacing.lg }}>
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
        </View>
      ) : null}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>
      {content}
    </Pressable>
  );
}

// ──────────────────────────────────────────────────────────────────
// PetDetailModal — clean carousel + lifted body card.
//
// Design rules that fix the previous version's problems:
// 1. The photo carousel is the ONLY thing in the hero area. No title,
//    no chips, no captions overlapping it — so horizontal swipe gestures
//    are never intercepted by absolutely-positioned text.
// 2. The body card sits BELOW the hero and lifts up with a negative
//    margin, creating a layered Dribbble-style "card on photo" look
//    without any of its content sitting on the photo.
// 3. The top floating action bar (close / report / QR / share) is the
//    only absolute element in the hero, positioned in the true safe
//    area (insets.top), out of the swipe zone entirely.
// 4. Photo dots sit just below the action bar, also in the safe area,
//    with pointerEvents="none" so they never touch the gesture stream.
// 5. Every color comes from the theme — dark mode works out of the box.
// ──────────────────────────────────────────────────────────────────
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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSessionStore((s) => s.session);

  const [activePhoto, setActivePhoto] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const galleryRef = useRef<ScrollView>(null);

  const screenWidth = Dimensions.get("window").width;
  // Hero fills from the true top of the screen down to ~56% of screen
  // height. This gives the photo plenty of breathing room without
  // crowding out the body on small devices.
  const HERO_HEIGHT = Math.round(Dimensions.get("window").height * 0.56);
  const BODY_LIFT = 28;

  if (!pet) return null;

  const photos = (pet.photos ?? []).filter((p) => p.url && p.url.length > 0);
  const isOwnPet = pet.ownerId === session?.user.id;
  const activityLevel = (pet.activityLevel as 1 | 2 | 3 | 4 | 5) || 3;

  const hobbies = pet.hobbies ?? [];
  const goodWith = pet.goodWith ?? [];
  const characters = pet.characters ?? [];
  const personality = Array.from(new Set([...characters, ...goodWith]));

  const handleShare = async () => {
    try {
      await Share.share({
        message: t("petDetail.shareMessage", {
          name: pet.name,
          breed: pet.breedLabel || pet.speciesLabel || "pet",
          defaultValue: `Meet ${pet.name} on Petto 🐾`
        }) as string
      });
    } catch {
      // user cancelled
    }
  };

  const handleScroll = (e: {
    nativeEvent: { contentOffset: { x: number } };
  }) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    if (idx !== activePhoto) setActivePhoto(idx);
  };

  const glassBtnStyle = {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.18)"
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 140 }}
          bounces={false}
        >
          {/* ── Hero: clean, unobstructed photo carousel ─────── */}
          <View
            style={{
              width: "100%",
              height: HERO_HEIGHT,
              backgroundColor: theme.colors.primaryBg
            }}
          >
            {photos.length > 0 ? (
              <ScrollView
                ref={galleryRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                style={{ width: "100%", height: "100%" }}
              >
                {photos.map((photo) => (
                  <Image
                    key={photo.id || photo.url}
                    source={{ uri: photo.url }}
                    style={{ width: screenWidth, height: HERO_HEIGHT }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={250}
                    recyclingKey={photo.id || photo.url}
                  />
                ))}
              </ScrollView>
            ) : (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <PawPrint size={80} color={theme.colors.primary} />
              </View>
            )}

            {/* Bottom gradient blending hero into the body card. */}
            <LinearGradient
              colors={["transparent", theme.colors.background]}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 80
              }}
              pointerEvents="none"
            />

            {/* Floating action bar — absolute in safe area, doesn't
                touch the swipe gesture surface because it sits above
                the active photo region on the Y axis. */}
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                top: insets.top + 10,
                left: 16,
                right: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              <Pressable onPress={onClose} hitSlop={10} style={glassBtnStyle}>
                <X size={20} color="#FFFFFF" strokeWidth={2.3} />
              </Pressable>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {!isOwnPet ? (
                  <Pressable
                    onPress={() => setReportOpen(true)}
                    hitSlop={10}
                    style={glassBtnStyle}
                  >
                    <Flag size={18} color="#FFFFFF" strokeWidth={2.3} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => setQrOpen(true)}
                  hitSlop={10}
                  style={glassBtnStyle}
                >
                  <QrCode size={18} color="#FFFFFF" strokeWidth={2.3} />
                </Pressable>
                <Pressable
                  onPress={handleShare}
                  hitSlop={10}
                  style={glassBtnStyle}
                >
                  <Share2 size={18} color="#FFFFFF" strokeWidth={2.3} />
                </Pressable>
              </View>
            </View>

            {/* Photo dot indicators — pointerEvents none so the
                swipeable carousel below them stays fully reactive. */}
            {photos.length > 1 ? (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: insets.top + 62,
                  left: 0,
                  right: 0,
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 5
                }}
              >
                {photos.map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: i === activePhoto ? 18 : 5,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor:
                        i === activePhoto
                          ? "#FFFFFF"
                          : "rgba(255,255,255,0.45)"
                    }}
                  />
                ))}
              </View>
            ) : null}
          </View>

          {/* ── Body card (lifts up to overlap hero bottom) ─── */}
          <View
            style={{
              marginTop: -BODY_LIFT,
              backgroundColor: theme.colors.background,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingTop: 24,
              paddingHorizontal: 20,
              gap: 20
            }}
          >
            {/* Title block — name + age inline, then species, then chips. */}
            <View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  gap: 10
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.colors.ink,
                    fontSize: 32,
                    lineHeight: 36,
                    fontFamily: "Inter_700Bold",
                    flexShrink: 1
                  }}
                >
                  {pet.name}
                </Text>
                <Text
                  style={{
                    color: theme.colors.primary,
                    fontSize: 20,
                    fontFamily: "Inter_700Bold",
                    marginBottom: 3
                  }}
                >
                  {formatAge(pet.ageYears)}
                </Text>
              </View>
              <Text
                style={{
                  color: theme.colors.muted,
                  fontSize: 14,
                  marginTop: 4,
                  fontFamily: "Inter_500Medium"
                }}
              >
                {[pet.speciesLabel, pet.breedLabel].filter(Boolean).join(" · ")}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  marginTop: 14,
                  flexWrap: "wrap"
                }}
              >
                {pet.cityLabel ? (
                  <MetaChip
                    icon={<MapPin size={12} color={theme.colors.secondary} />}
                    label={pet.cityLabel}
                    bg={theme.colors.secondarySoft}
                    fg={theme.colors.secondary}
                  />
                ) : null}
                {pet.isNeutered ? (
                  <MetaChip
                    icon={
                      <CheckCircle2 size={12} color={theme.colors.success} />
                    }
                    label={t("petCard.neutered") as string}
                    bg={theme.colors.successBg}
                    fg={theme.colors.success}
                  />
                ) : null}
                <MetaChip
                  icon={<Activity size={12} color={theme.colors.primary} />}
                  label={t(ACTIVITY_KEYS[activityLevel]) as string}
                  bg={theme.colors.primaryBg}
                  fg={theme.colors.primary}
                />
              </View>
            </View>

            {/* About */}
            {pet.bio ? (
              <Section
                title={
                  t("petDetail.about", { defaultValue: "About" }) as string
                }
                icon={<BookOpen size={14} color={theme.colors.muted} />}
              >
                <Text
                  style={{
                    color: theme.colors.ink,
                    fontSize: 15,
                    lineHeight: 22,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  {pet.bio}
                </Text>
              </Section>
            ) : null}

            {/* Vitals grid */}
            <View>
              <SectionLabel
                icon={<Sparkles size={14} color={theme.colors.muted} />}
                text={
                  t("petDetail.vitals", { defaultValue: "Vitals" }) as string
                }
              />
              <View
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
              >
                <VitalCard
                  icon={<Calendar size={16} color={theme.colors.primary} />}
                  label={
                    t("petDetail.age", { defaultValue: "Age" }) as string
                  }
                  value={`${pet.ageYears}y`}
                />
                <VitalCard
                  icon={<Activity size={16} color={theme.colors.accent} />}
                  label={
                    t("petDetail.activity", {
                      defaultValue: "Activity"
                    }) as string
                  }
                  value={<ActivityDots level={activityLevel} />}
                />
                <VitalCard
                  icon={
                    <ShieldCheck size={16} color={theme.colors.secondary} />
                  }
                  label={
                    t("petDetail.neutered", {
                      defaultValue: "Neutered"
                    }) as string
                  }
                  value={
                    pet.isNeutered
                      ? (t("common.yes") as string)
                      : (t("common.no") as string)
                  }
                />
                <VitalCard
                  icon={<MapPin size={16} color={theme.colors.muted} />}
                  label={
                    t("petDetail.location", {
                      defaultValue: "City"
                    }) as string
                  }
                  value={pet.cityLabel || "—"}
                />
              </View>
            </View>

            {/* Personality */}
            {personality.length > 0 ? (
              <View>
                <SectionLabel
                  icon={<Sparkles size={14} color={theme.colors.muted} />}
                  text={
                    t("petDetail.personality", {
                      defaultValue: "Personality"
                    }) as string
                  }
                />
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8
                  }}
                >
                  {personality.map((item) => (
                    <View
                      key={item}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: mobileTheme.radius.pill,
                        backgroundColor: theme.colors.secondarySoft
                      }}
                    >
                      <Text
                        style={{
                          color: theme.colors.secondary,
                          fontSize: 13,
                          fontFamily: "Inter_600SemiBold"
                        }}
                      >
                        {item}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Loves */}
            {hobbies.length > 0 ? (
              <View>
                <SectionLabel
                  icon={<Heart size={14} color={theme.colors.muted} />}
                  text={
                    t("petDetail.loves", { defaultValue: "Loves" }) as string
                  }
                />
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8
                  }}
                >
                  {hobbies.map((h) => (
                    <View
                      key={h}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: mobileTheme.radius.pill,
                        backgroundColor: theme.colors.primaryBg
                      }}
                    >
                      <Text
                        style={{
                          color: theme.colors.primary,
                          fontSize: 13,
                          fontFamily: "Inter_600SemiBold"
                        }}
                      >
                        {h}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>

        {/* ── Sticky bottom action bar ──────────────────────── */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: insets.bottom + 14,
            backgroundColor: theme.colors.surface,
            borderTopWidth: 0.5,
            borderTopColor: theme.colors.border
          }}
        >
          {isOwnPet ? (
            <Pressable
              onPress={() => {
                onClose();
                router.push(`/(app)/edit-pet/${pet.id}` as any);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 16,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: theme.colors.primary,
                opacity: pressed ? 0.88 : 1,
                ...mobileTheme.shadow.sm
              })}
            >
              <Pencil size={16} color="#FFFFFF" strokeWidth={2.3} />
              <Text
                style={{
                  color: "#FFFFFF",
                  fontFamily: "Inter_700Bold",
                  fontSize: 15
                }}
              >
                {
                  t("petDetail.editPet", {
                    defaultValue: "Edit pet"
                  }) as string
                }
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                if (!pet.ownerId) return;
                onClose();
                router.push(`/(app)/user/${pet.ownerId}` as any);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 16,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: theme.colors.primary,
                opacity: pressed ? 0.88 : 1,
                ...mobileTheme.shadow.sm
              })}
            >
              <Heart size={16} color="#FFFFFF" strokeWidth={2.3} />
              <Text
                style={{
                  color: "#FFFFFF",
                  fontFamily: "Inter_700Bold",
                  fontSize: 15
                }}
              >
                {
                  t("petDetail.viewOwner", {
                    defaultValue: "View owner profile"
                  }) as string
                }
              </Text>
            </Pressable>
          )}
        </View>

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

// ── Internal helpers ──────────────────────────────────────────────

function MetaChip({
  icon,
  label,
  bg,
  fg
}: {
  icon: React.ReactNode;
  label: string;
  bg: string;
  fg: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: bg
      }}
    >
      {icon}
      <Text
        style={{
          color: fg,
          fontSize: 12,
          fontFamily: "Inter_700Bold"
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function SectionLabel({
  icon,
  text
}: {
  icon: React.ReactNode;
  text: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 10
      }}
    >
      {icon}
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 1,
          color: theme.colors.muted,
          fontFamily: "Inter_700Bold",
          textTransform: "uppercase"
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function Section({
  title,
  icon,
  children
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View>
      <SectionLabel icon={icon} text={title} />
      <View
        style={{
          padding: 16,
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border
        }}
      >
        {children}
      </View>
    </View>
  );
}

function VitalCard({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexBasis: "47%",
        flexGrow: 1,
        padding: 14,
        borderRadius: mobileTheme.radius.lg,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 6
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon}
        <Text
          style={{
            fontSize: 11,
            color: theme.colors.muted,
            fontFamily: "Inter_600SemiBold",
            letterSpacing: 0.3,
            textTransform: "uppercase"
          }}
        >
          {label}
        </Text>
      </View>
      {typeof value === "string" ? (
        <Text
          numberOfLines={1}
          style={{
            fontSize: 16,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          {value}
        </Text>
      ) : (
        <View style={{ marginTop: 2 }}>{value}</View>
      )}
    </View>
  );
}

function ActivityDots({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor:
              i <= level ? theme.colors.primary : theme.colors.border
          }}
        />
      ))}
    </View>
  );
}
