import { Modal, Pressable, ScrollView, Share, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  Bird,
  Cat,
  ChevronLeft,
  Compass,
  Dog,
  Globe,
  GraduationCap,
  Heart,
  Key,
  Lock,
  MapPin,
  PawPrint,
  Rabbit,
  Share2,
  Sparkles,
  Users2
} from "lucide-react-native";

import { mobileTheme, useTheme } from "@/lib/theme";
import type { CommunityGroup } from "@petto/contracts";

const SPECIES_ICON_MAP: Record<string, typeof PawPrint> = {
  dog: Dog,
  cat: Cat,
  bird: Bird,
  rabbit: Rabbit
};

const CATEGORY_ICON_MAP: Record<string, typeof PawPrint> = {
  breed: PawPrint,
  training: GraduationCap,
  social: Users2,
  adventure: Compass,
  rescue: Heart
};

const PET_EMOJI_MAP: Record<string, string> = {
  dog: "🐕",
  cat: "🐈",
  bird: "🐦",
  rabbit: "🐰"
};

interface GroupInfoModalProps {
  visible: boolean;
  onClose: () => void;
  group: CommunityGroup | null;
}

export function GroupInfoModal({ visible, onClose, group }: GroupInfoModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (!group) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: theme.colors.background }} />
      </Modal>
    );
  }

  const petTypeKey = (group.petType ?? "").toLowerCase();
  const PetIcon = SPECIES_ICON_MAP[petTypeKey] ?? PawPrint;
  const petEmoji = PET_EMOJI_MAP[petTypeKey] ?? "🐾";
  const categoryKey = (group.category ?? "").toLowerCase();
  const CategoryIcon = CATEGORY_ICON_MAP[categoryKey] ?? Sparkles;
  const categoryLabel =
    categoryKey === "breed"
      ? (t("groups.categoryBreed") as string)
      : categoryKey === "training"
      ? (t("groups.categoryTraining") as string)
      : categoryKey === "social"
      ? (t("groups.categorySocial") as string)
      : categoryKey === "adventure"
      ? (t("groups.categoryAdventure") as string)
      : categoryKey === "rescue"
      ? (t("groups.categoryRescue") as string)
      : group.category;

  const isPrivate = Boolean(group.isPrivate);

  const handleShareGroup = () => {
    Share.share({
      message: t("groups.shareGroupMessage", { name: group.name }) as string
    });
  };

  const handleShareCode = () => {
    if (!group.code) return;
    Share.share({
      message: t("groups.shareCodeMessage", { name: group.name, code: group.code }) as string
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={{ height: 240, backgroundColor: theme.colors.primary }}>
            {group.imageUrl ? (
              <Image
                source={{ uri: group.imageUrl }}
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                contentFit="cover"
                blurRadius={2}
              />
            ) : null}
            <LinearGradient
              colors={[
                "rgba(0,0,0,0.25)",
                "rgba(0,0,0,0.05)",
                "rgba(0,0,0,0.45)"
              ]}
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            />

            {/* Top bar */}
            <View
              style={{
                paddingTop: insets.top + mobileTheme.spacing.md,
                paddingHorizontal: mobileTheme.spacing.xl,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "rgba(255,255,255,0.92)",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.8 : 1
                })}
              >
                <ChevronLeft size={22} color={theme.colors.ink} />
              </Pressable>
              <Pressable
                onPress={handleShareGroup}
                hitSlop={12}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "rgba(255,255,255,0.92)",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.8 : 1
                })}
              >
                <Share2 size={20} color={theme.colors.ink} />
              </Pressable>
            </View>

            {/* Avatar ring */}
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: -44,
                alignItems: "center"
              }}
            >
              <View
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  backgroundColor: theme.colors.white,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 4,
                  borderColor: theme.colors.white,
                  ...mobileTheme.shadow.md
                }}
              >
                {group.imageUrl ? (
                  <Image
                    source={{ uri: group.imageUrl }}
                    style={{ width: 88, height: 88, borderRadius: 44 }}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: 44,
                      backgroundColor: theme.colors.primaryBg,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Text style={{ fontSize: 44 }}>{petEmoji}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Title block */}
          <View
            style={{
              marginHorizontal: mobileTheme.spacing.xl,
              marginTop: 60,
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              padding: mobileTheme.spacing.xl,
              alignItems: "center",
              gap: mobileTheme.spacing.sm,
              ...mobileTheme.shadow.sm
            }}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.heading.fontSize,
                fontWeight: "700",
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold",
                textAlign: "center"
              }}
            >
              {group.name}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                justifyContent: "center"
              }}
            >
              {group.cityLabel ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MapPin size={14} color={theme.colors.muted} />
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.caption.fontSize,
                      color: theme.colors.muted,
                      fontFamily: "Inter_500Medium"
                    }}
                  >
                    {group.cityLabel}
                  </Text>
                </View>
              ) : null}
              {group.cityLabel ? (
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>•</Text>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                {isPrivate ? (
                  <Lock size={13} color={theme.colors.primary} />
                ) : (
                  <Globe size={13} color={theme.colors.secondary} />
                )}
                <Text
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    color: isPrivate ? theme.colors.primary : theme.colors.secondary,
                    fontWeight: "600",
                    fontFamily: "Inter_600SemiBold"
                  }}
                >
                  {isPrivate ? (t("groups.private") as string) : (t("groups.public") as string)}
                </Text>
              </View>
            </View>

            {group.description ? (
              <Text
                style={{
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_400Regular",
                  textAlign: "center",
                  lineHeight: mobileTheme.typography.body.lineHeight,
                  marginTop: mobileTheme.spacing.xs
                }}
              >
                {group.description}
              </Text>
            ) : null}
          </View>

          {/* Stats chip row */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: mobileTheme.spacing.sm,
              marginTop: mobileTheme.spacing.lg,
              paddingHorizontal: mobileTheme.spacing.xl
            }}
          >
            <StatChip
              icon={<Users2 size={14} color={theme.colors.secondary} />}
              text={t("groups.members", { count: group.memberCount ?? 0 }) as string}
              bg={theme.colors.secondarySoft}
              color={theme.colors.secondary}
            />
            {petTypeKey ? (
              <StatChip
                icon={<PetIcon size={14} color={theme.colors.primary} />}
                text={petTypeKey.charAt(0).toUpperCase() + petTypeKey.slice(1)}
                bg={theme.colors.primaryBg}
                color={theme.colors.primary}
              />
            ) : null}
            {categoryLabel ? (
              <StatChip
                icon={<CategoryIcon size={14} color={theme.colors.primary} />}
                text={categoryLabel}
                bg={theme.colors.primaryBg}
                color={theme.colors.primary}
              />
            ) : null}
          </View>

          {/* Group Code (private members only) */}
          {isPrivate && group.code ? (
            <View
              style={{
                marginHorizontal: mobileTheme.spacing.xl,
                marginTop: mobileTheme.spacing.xl
              }}
            >
              <SectionLabel theme={theme}>{t("groups.groupCode") as string}</SectionLabel>
              <View
                style={{
                  backgroundColor: theme.colors.white,
                  borderRadius: mobileTheme.radius.lg,
                  padding: mobileTheme.spacing.lg,
                  gap: mobileTheme.spacing.md,
                  ...mobileTheme.shadow.sm
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: mobileTheme.spacing.sm
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: theme.colors.primaryBg,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Key size={16} color={theme.colors.primary} />
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: mobileTheme.typography.caption.fontSize,
                      color: theme.colors.muted,
                      fontFamily: "Inter_400Regular"
                    }}
                  >
                    {t("groups.shareCode") as string}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: theme.colors.primaryBg,
                    borderRadius: mobileTheme.radius.md,
                    borderWidth: 2,
                    borderColor: theme.colors.primary,
                    borderStyle: "dashed",
                    paddingVertical: mobileTheme.spacing.lg,
                    alignItems: "center"
                  }}
                >
                  <Text
                    selectable
                    style={{
                      fontSize: 28,
                      fontWeight: "800",
                      color: theme.colors.primary,
                      fontFamily: "Inter_700Bold",
                      letterSpacing: 5
                    }}
                  >
                    {group.code}
                  </Text>
                </View>
                <Pressable
                  onPress={handleShareCode}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 12,
                    borderRadius: mobileTheme.radius.md,
                    backgroundColor: theme.colors.primary,
                    minHeight: 44,
                    opacity: pressed ? 0.85 : 1
                  })}
                >
                  <Share2 size={16} color={theme.colors.white} />
                  <Text
                    style={{
                      fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                      fontWeight: "600",
                      color: theme.colors.white,
                      fontFamily: "Inter_600SemiBold"
                    }}
                  >
                    {t("common.share") as string}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Hashtags */}
          {group.hashtags && group.hashtags.length > 0 ? (
            <View
              style={{
                marginHorizontal: mobileTheme.spacing.xl,
                marginTop: mobileTheme.spacing.xl
              }}
            >
              <SectionLabel theme={theme}>{t("groups.hashtagsLabel") as string}</SectionLabel>
              <View
                style={{
                  backgroundColor: theme.colors.white,
                  borderRadius: mobileTheme.radius.lg,
                  padding: mobileTheme.spacing.lg,
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: mobileTheme.spacing.sm,
                  ...mobileTheme.shadow.sm
                }}
              >
                {group.hashtags.map((tag) => (
                  <View
                    key={tag}
                    style={{
                      backgroundColor: theme.colors.secondarySoft,
                      borderRadius: mobileTheme.radius.pill,
                      paddingHorizontal: 12,
                      paddingVertical: 6
                    }}
                  >
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.caption.fontSize,
                        fontWeight: "600",
                        color: theme.colors.secondary,
                        fontFamily: "Inter_600SemiBold"
                      }}
                    >
                      #{tag.replace(/^#/, "")}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Rules */}
          {group.rules && group.rules.length > 0 ? (
            <View
              style={{
                marginHorizontal: mobileTheme.spacing.xl,
                marginTop: mobileTheme.spacing.xl
              }}
            >
              <SectionLabel theme={theme}>{t("groups.rulesLabel") as string}</SectionLabel>
              <View
                style={{
                  backgroundColor: theme.colors.white,
                  borderRadius: mobileTheme.radius.lg,
                  paddingHorizontal: mobileTheme.spacing.lg,
                  paddingVertical: mobileTheme.spacing.sm,
                  ...mobileTheme.shadow.sm
                }}
              >
                {group.rules.map((rule, idx) => (
                  <View
                    key={`${idx}-${rule}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: mobileTheme.spacing.md,
                      paddingVertical: mobileTheme.spacing.md,
                      borderBottomWidth: idx === group.rules.length - 1 ? 0 : 1,
                      borderBottomColor: theme.colors.border
                    }}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: theme.colors.primaryBg,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: theme.colors.primary,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {idx + 1}
                      </Text>
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        fontSize: mobileTheme.typography.body.fontSize,
                        color: theme.colors.ink,
                        fontFamily: "Inter_400Regular",
                        lineHeight: mobileTheme.typography.body.lineHeight
                      }}
                    >
                      {rule}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Members */}
          <View
            style={{
              marginHorizontal: mobileTheme.spacing.xl,
              marginTop: mobileTheme.spacing.xl
            }}
          >
            <SectionLabel theme={theme}>
              {`${t("groups.membersLabel") as string} (${group.members?.length ?? 0})`}
            </SectionLabel>
            <View style={{ gap: mobileTheme.spacing.sm }}>
              {group.members?.map((member) => (
                <View
                  key={member.userId}
                  style={{
                    backgroundColor: theme.colors.white,
                    borderRadius: mobileTheme.radius.lg,
                    padding: mobileTheme.spacing.lg,
                    ...mobileTheme.shadow.sm
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: mobileTheme.spacing.md
                    }}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        overflow: "hidden",
                        backgroundColor: theme.colors.primaryBg
                      }}
                    >
                      {member.avatarUrl ? (
                        <Image
                          source={{ uri: member.avatarUrl }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="cover"
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
                              fontSize: 18,
                              fontWeight: "700",
                              color: theme.colors.primary
                            }}
                          >
                            {member.firstName?.[0] ?? "?"}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                        fontWeight: "600",
                        color: theme.colors.ink,
                        fontFamily: "Inter_600SemiBold"
                      }}
                    >
                      {member.firstName}
                    </Text>
                  </View>

                  {member.pets?.length > 0 ? (
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: mobileTheme.spacing.sm,
                        marginTop: mobileTheme.spacing.md,
                        paddingTop: mobileTheme.spacing.md,
                        borderTopWidth: 1,
                        borderTopColor: theme.colors.border
                      }}
                    >
                      {member.pets.map((pet) => (
                        <View
                          key={pet.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            backgroundColor: theme.colors.background,
                            borderRadius: mobileTheme.radius.pill,
                            paddingRight: 12,
                            paddingVertical: 4,
                            paddingLeft: 4
                          }}
                        >
                          <View
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 14,
                              overflow: "hidden",
                              backgroundColor: theme.colors.white
                            }}
                          >
                            {pet.photoUrl ? (
                              <Image
                                source={{ uri: pet.photoUrl }}
                                style={{ width: "100%", height: "100%" }}
                                contentFit="cover"
                              />
                            ) : (
                              <View
                                style={{
                                  flex: 1,
                                  justifyContent: "center",
                                  alignItems: "center"
                                }}
                              >
                                <Text style={{ fontSize: 12 }}>🐾</Text>
                              </View>
                            )}
                          </View>
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: mobileTheme.typography.caption.fontSize,
                              fontWeight: "500",
                              color: theme.colors.ink,
                              fontFamily: "Inter_500Medium",
                              maxWidth: 100
                            }}
                          >
                            {pet.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function SectionLabel({
  children,
  theme
}: {
  children: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Text
      style={{
        fontSize: mobileTheme.typography.label.fontSize,
        fontWeight: "700",
        color: theme.colors.ink,
        fontFamily: "Inter_700Bold",
        letterSpacing: 0.5,
        textTransform: "uppercase",
        marginBottom: mobileTheme.spacing.md
      }}
    >
      {children}
    </Text>
  );
}

function StatChip({
  icon,
  text,
  bg,
  color
}: {
  icon: React.ReactNode;
  text: string;
  bg: string;
  color: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: bg,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: mobileTheme.radius.pill
      }}
    >
      {icon}
      <Text
        style={{
          fontSize: mobileTheme.typography.caption.fontSize,
          fontWeight: "600",
          color,
          fontFamily: "Inter_600SemiBold"
        }}
      >
        {text}
      </Text>
    </View>
  );
}
