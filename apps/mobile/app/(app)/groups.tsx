import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { LottieLoading } from "@/components/lottie-loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Bird,
  Cat,
  Compass,
  Dog,
  Globe,
  GraduationCap,
  Hash,
  Heart,
  Key,
  Lock,
  MapPin,
  MessageCircle,
  PawPrint,
  Plus,
  Rabbit,
  Search,
  Sparkles,
  Users2,
  X
} from "lucide-react-native";
import * as Location from "expo-location";

import { useTranslation } from "react-i18next";
import { CreateGroupModal } from "@/components/groups/create-group-modal";
import { listGroups, listTaxonomies, joinGroup, joinGroupByCode } from "@/lib/api";
import { getCurrentLanguage } from "@/lib/i18n";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useLocalRefresh } from "@/lib/use-local-refresh";
import { useSessionStore } from "@/store/session";
import type { CommunityGroup } from "@petto/contracts";

const SPECIES_ICON_MAP: Record<string, typeof PawPrint> = {
  dog: Dog, cat: Cat, bird: Bird, rabbit: Rabbit
};

const CATEGORY_ICON_MAP: Record<string, typeof PawPrint> = {
  breed: PawPrint,
  training: GraduationCap,
  social: Users2,
  adventure: Compass,
  rescue: Heart
};

const PET_EMOJI_MAP: Record<string, string> = {
  dog: "🐕", cat: "🐈", bird: "🐦", rabbit: "🐰"
};

export default function GroupsPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
  const token = session?.tokens.accessToken ?? "";

  const [tab, setTab] = useState<"discover" | "myGroups">("discover");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPetType, setSelectedPetType] = useState("all");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      }
    })();
  }, []);

  const speciesQuery = useQuery({
    queryKey: ["taxonomy", "species", getCurrentLanguage()],
    queryFn: () => listTaxonomies(token, "species", getCurrentLanguage()),
    enabled: Boolean(token)
  });

  const petTypeChips = useMemo(() => {
    const speciesList = speciesQuery.data ?? [];
    return [
      { key: "all", label: t("groups.all"), icon: PawPrint },
      ...speciesList.map((s) => ({
        key: s.slug,
        label: s.label,
        icon: SPECIES_ICON_MAP[s.slug] ?? PawPrint
      }))
    ];
  }, [speciesQuery.data, t]);

  const groupsQuery = useQuery({
    queryKey: ["groups", debouncedSearch, selectedPetType, userLocation?.latitude],
    queryFn: () => listGroups(token, {
      lat: userLocation?.latitude,
      lng: userLocation?.longitude,
      search: debouncedSearch || undefined,
      petType: selectedPetType
    }),
    enabled: Boolean(token),
    keepPreviousData: true
  });

  const joinMutation = useMutation({
    mutationFn: (groupId: string) => joinGroup(token, groupId),
    onMutate: async (groupId: string) => {
      await queryClient.cancelQueries({ queryKey: ["groups"] });
      const prev = queryClient.getQueryData(["groups", debouncedSearch, selectedPetType, userLocation?.latitude]);
      queryClient.setQueryData(["groups", debouncedSearch, selectedPetType, userLocation?.latitude], (old: any) =>
        old?.map((g: CommunityGroup) => g.id === groupId ? { ...g, isMember: true, memberCount: g.memberCount + 1 } : g) ?? []
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["groups", debouncedSearch, selectedPetType, userLocation?.latitude], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["groups"] })
  });

  const codeMutation = useMutation({
    mutationFn: (code: string) => joinGroupByCode(token, code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setCodeModalVisible(false);
      setCodeInput("");
    },
    onError: () => {
      Alert.alert(t("common.error"), t("groups.invalidCode"));
    }
  });

  const { refreshing, handleRefresh } = useLocalRefresh(
    useCallback(() => groupsQuery.refetch(), [groupsQuery])
  );

  const allGroups = groupsQuery.data ?? [];
  const myGroups = useMemo(() => allGroups.filter((g) => g.isMember), [allGroups]);
  const nearbyGroups = useMemo(() => allGroups.filter((g) => g.distance != null && g.distance > 0 && g.distance <= 50), [allGroups]);
  const globalGroups = useMemo(() => allGroups.filter((g) => !g.distance || g.distance > 50 || g.distance === 0), [allGroups]);

  const formatDistance = (d: number) => d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;

  // ── Category helper ───────────────────────────────────────────
  const getCategoryLabel = (cat?: string) => {
    const key = (cat ?? "").toLowerCase();
    if (!key) return null;
    switch (key) {
      case "breed": return t("groups.categoryBreed") as string;
      case "training": return t("groups.categoryTraining") as string;
      case "social": return t("groups.categorySocial") as string;
      case "adventure": return t("groups.categoryAdventure") as string;
      case "rescue": return t("groups.categoryRescue") as string;
      default: return cat ?? null;
    }
  };

  // ── Group Card (hero-style) ───────────────────────────────────
  const renderGroupCard = (group: CommunityGroup) => {
    const petTypeKey = (group.petType ?? "").toLowerCase();
    const petEmoji = PET_EMOJI_MAP[petTypeKey] ?? "🐾";
    const PetIcon = SPECIES_ICON_MAP[petTypeKey] ?? PawPrint;
    const categoryKey = (group.category ?? "").toLowerCase();
    const CategoryIcon = CATEGORY_ICON_MAP[categoryKey] ?? Sparkles;
    const categoryLabel = getCategoryLabel(group.category);
    const isPrivate = Boolean(group.isPrivate);

    const handleOpen = () => {
      // Joined members go straight to chat (per product decision). Anyone
      // else (discover/preview) gets sent to the full detail page where a
      // non-member preview + "Join to chat" CTA lives.
      if (group.isMember && group.conversationId) {
        router.push(`/(app)/conversation/${group.conversationId}` as any);
      } else {
        router.push(`/(app)/group/${group.id}` as any);
      }
    };

    return (
      <Pressable
        key={group.id}
        onPress={handleOpen}
        style={({ pressed }) => ({
          backgroundColor: theme.colors.white,
          borderRadius: mobileTheme.radius.lg,
          marginBottom: mobileTheme.spacing.md,
          overflow: "hidden",
          ...mobileTheme.shadow.sm,
          opacity: pressed && group.isMember ? 0.88 : 1
        })}
      >
        {/* ── Hero band ─────────────────────────────── */}
        <View style={{ height: 112, backgroundColor: theme.colors.primary }}>
          {group.imageUrl ? (
            <Image
              source={{ uri: group.imageUrl }}
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
              contentFit="cover"
            />
          ) : (
            <View style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              alignItems: "center", justifyContent: "center"
            }}>
              <Text style={{ fontSize: 48, opacity: 0.35 }}>{petEmoji}</Text>
            </View>
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.55)"]}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />

          {/* Top-right pills: distance + private lock */}
          <View style={{
            position: "absolute", top: 12, right: 12,
            flexDirection: "row", gap: 6, alignItems: "center"
          }}>
            {group.distance != null && group.distance > 0 && (
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 4,
                backgroundColor: "rgba(255,255,255,0.95)",
                paddingHorizontal: 10, paddingVertical: 5,
                borderRadius: mobileTheme.radius.pill
              }}>
                <MapPin size={11} color={theme.colors.primary} />
                <Text style={{
                  fontSize: mobileTheme.typography.micro.fontSize,
                  fontWeight: "700", color: theme.colors.primary,
                  fontFamily: "Inter_700Bold"
                }}>
                  {formatDistance(group.distance)}
                </Text>
              </View>
            )}
            {isPrivate && (
              <View style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: "rgba(255,255,255,0.95)",
                alignItems: "center", justifyContent: "center"
              }}>
                <Lock size={13} color={theme.colors.primary} />
              </View>
            )}
          </View>

          {/* Bottom-left: category chip */}
          {categoryLabel ? (
            <View style={{
              position: "absolute", bottom: 12, left: 12,
              flexDirection: "row", alignItems: "center", gap: 5,
              backgroundColor: "rgba(255,255,255,0.95)",
              paddingHorizontal: 10, paddingVertical: 5,
              borderRadius: mobileTheme.radius.pill
            }}>
              <CategoryIcon size={12} color={theme.colors.primary} />
              <Text style={{
                fontSize: mobileTheme.typography.micro.fontSize,
                fontWeight: "700", color: theme.colors.primary,
                fontFamily: "Inter_700Bold"
              }}>
                {categoryLabel}
              </Text>
            </View>
          ) : null}

          {/* Bottom-right: pet type chip */}
          <View style={{
            position: "absolute", bottom: 12, right: 12,
            flexDirection: "row", alignItems: "center", gap: 5,
            backgroundColor: "rgba(255,255,255,0.95)",
            paddingHorizontal: 10, paddingVertical: 5,
            borderRadius: mobileTheme.radius.pill
          }}>
            <PetIcon size={12} color={theme.colors.secondary} />
            <Text style={{
              fontSize: mobileTheme.typography.micro.fontSize,
              fontWeight: "700", color: theme.colors.secondary,
              fontFamily: "Inter_700Bold", textTransform: "capitalize"
            }}>
              {group.petType}
            </Text>
          </View>
        </View>

        {/* ── Content ───────────────────────────────── */}
        <View style={{ padding: mobileTheme.spacing.xl }}>
          {/* Name */}
          <Text style={{
            fontSize: mobileTheme.typography.subheading.fontSize,
            fontWeight: "700",
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold",
            lineHeight: 24
          }}>
            {group.name}
          </Text>

          {/* City + privacy */}
          <View style={{
            flexDirection: "row", alignItems: "center",
            flexWrap: "wrap", gap: 6, marginTop: 4
          }}>
            {group.cityLabel ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <MapPin size={11} color={theme.colors.muted} />
                <Text style={{
                  fontSize: mobileTheme.typography.micro.fontSize,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium"
                }}>
                  {group.cityLabel}
                </Text>
              </View>
            ) : null}
            {group.cityLabel ? (
              <Text style={{ color: theme.colors.muted, fontSize: 11 }}>•</Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              {isPrivate ? (
                <Lock size={11} color={theme.colors.primary} />
              ) : (
                <Globe size={11} color={theme.colors.secondary} />
              )}
              <Text style={{
                fontSize: mobileTheme.typography.micro.fontSize,
                fontWeight: "600",
                color: isPrivate ? theme.colors.primary : theme.colors.secondary,
                fontFamily: "Inter_600SemiBold"
              }}>
                {isPrivate ? t("groups.private") : t("groups.public")}
              </Text>
            </View>
          </View>

          {/* Description */}
          {group.description ? (
            <Text numberOfLines={2} style={{
              fontSize: mobileTheme.typography.body.fontSize,
              color: theme.colors.muted,
              lineHeight: mobileTheme.typography.body.lineHeight,
              fontFamily: "Inter_400Regular",
              marginTop: mobileTheme.spacing.sm
            }}>
              {group.description}
            </Text>
          ) : null}

          {/* Hashtags */}
          {group.hashtags && group.hashtags.length > 0 ? (
            <View style={{
              flexDirection: "row", flexWrap: "wrap",
              gap: 6, marginTop: mobileTheme.spacing.sm
            }}>
              {group.hashtags.slice(0, 4).map((tag) => (
                <View key={tag} style={{
                  flexDirection: "row", alignItems: "center", gap: 2,
                  backgroundColor: theme.colors.secondarySoft,
                  borderRadius: mobileTheme.radius.pill,
                  paddingHorizontal: 9, paddingVertical: 3
                }}>
                  <Hash size={10} color={theme.colors.secondary} />
                  <Text style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: theme.colors.secondary,
                    fontFamily: "Inter_600SemiBold"
                  }}>
                    {tag.replace(/^#/, "")}
                  </Text>
                </View>
              ))}
              {group.hashtags.length > 4 ? (
                <Text style={{
                  fontSize: 11,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium",
                  paddingVertical: 3
                }}>
                  +{group.hashtags.length - 4}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Footer */}
          <View style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: mobileTheme.spacing.lg,
            paddingTop: mobileTheme.spacing.md,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {group.members && group.members.length > 0 ? (
                <View style={{ flexDirection: "row" }}>
                  {group.members.slice(0, 4).map((member, idx) => (
                    <View key={member.userId} style={{
                      width: 28, height: 28, borderRadius: 14,
                      borderWidth: 2, borderColor: theme.colors.white,
                      overflow: "hidden", backgroundColor: theme.colors.primaryBg,
                      marginLeft: idx > 0 ? -10 : 0
                    }}>
                      {member.avatarUrl ? (
                        <Image source={{ uri: member.avatarUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                      ) : (
                        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.primary }}>
                            {member.firstName?.[0] ?? "?"}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: theme.colors.primaryBg,
                  alignItems: "center", justifyContent: "center"
                }}>
                  <Users2 size={13} color={theme.colors.primary} />
                </View>
              )}
              <Text style={{
                fontSize: mobileTheme.typography.caption.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}>
                {t("groups.members", { count: group.memberCount })}
              </Text>
            </View>

            {group.isMember ? (
              <Pressable
                onPress={() => group.conversationId && router.push(`/(app)/conversation/${group.conversationId}` as any)}
                style={({ pressed }) => ({
                  backgroundColor: theme.colors.primary,
                  paddingHorizontal: 16, paddingVertical: 10,
                  borderRadius: mobileTheme.radius.pill,
                  flexDirection: "row", alignItems: "center", gap: 6,
                  minHeight: 40,
                  opacity: pressed ? 0.85 : 1
                })}
              >
                <MessageCircle size={14} color={theme.colors.white} />
                <Text style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  fontWeight: "700",
                  color: theme.colors.white,
                  fontFamily: "Inter_700Bold"
                }}>
                  {t("groups.chat")}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => joinMutation.mutate(group.id)}
                disabled={joinMutation.isPending}
                style={({ pressed }) => ({
                  backgroundColor: theme.colors.primary,
                  paddingHorizontal: 16, paddingVertical: 10,
                  borderRadius: mobileTheme.radius.pill,
                  minHeight: 40,
                  opacity: pressed || joinMutation.isPending ? 0.7 : 1
                })}
              >
                <Text style={{
                  fontSize: mobileTheme.typography.caption.fontSize,
                  fontWeight: "700",
                  color: theme.colors.white,
                  fontFamily: "Inter_700Bold"
                }}>
                  {joinMutation.isPending ? t("common.loading") : t("common.join")}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  // ── Section Header ────────────────────────────────────────────
  const renderSectionHeader = (title: string, icon?: React.ReactNode) => (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 8,
      marginBottom: mobileTheme.spacing.md, marginTop: mobileTheme.spacing.lg
    }}>
      {icon}
      <Text style={{
        fontSize: mobileTheme.typography.label.fontSize,
        fontWeight: "700", color: theme.colors.ink,
        fontFamily: "Inter_700Bold", letterSpacing: 0.8,
        textTransform: "uppercase"
      }}>
        {title}
      </Text>
    </View>
  );

  // ── Empty State ───────────────────────────────────────────────
  const renderEmptyState = (title: string, subtitle: string, showCodeCta?: boolean, showDiscoverCta?: boolean) => (
    <View style={{
      paddingVertical: mobileTheme.spacing["4xl"],
      alignItems: "center", gap: mobileTheme.spacing.lg
    }}>
      <View style={{
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: theme.colors.primaryBg,
        alignItems: "center", justifyContent: "center"
      }}>
        <Users2 size={32} color={theme.colors.primary} />
      </View>
      <Text style={{
        fontSize: mobileTheme.typography.subheading.fontSize,
        fontWeight: "600", color: theme.colors.ink,
        fontFamily: "Inter_600SemiBold", textAlign: "center"
      }}>
        {title}
      </Text>
      <Text style={{
        fontSize: mobileTheme.typography.body.fontSize,
        color: theme.colors.muted, textAlign: "center",
        paddingHorizontal: mobileTheme.spacing["3xl"],
        fontFamily: "Inter_400Regular",
        lineHeight: mobileTheme.typography.body.lineHeight
      }}>
        {subtitle}
      </Text>
      <View style={{ gap: mobileTheme.spacing.sm, alignItems: "center" }}>
        <Pressable
          onPress={() => setCreateOpen(true)}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", gap: 6,
            backgroundColor: theme.colors.primary,
            paddingHorizontal: 24, paddingVertical: 12,
            borderRadius: mobileTheme.radius.pill, minHeight: 44,
            opacity: pressed ? 0.85 : 1
          })}
        >
          <Plus size={16} color={theme.colors.white} />
          <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontWeight: "600", color: theme.colors.white, fontFamily: "Inter_600SemiBold" }}>
            {t("groups.createGroup")}
          </Text>
        </Pressable>
        {showDiscoverCta && (
          <Pressable
            onPress={() => setTab("discover")}
            style={({ pressed }) => ({
              backgroundColor: theme.colors.surface,
              borderWidth: 1, borderColor: theme.colors.border,
              paddingHorizontal: 24, paddingVertical: 12,
              borderRadius: mobileTheme.radius.pill, minHeight: 44,
              opacity: pressed ? 0.85 : 1
            })}
          >
            <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontWeight: "600", color: theme.colors.ink, fontFamily: "Inter_600SemiBold" }}>
              {t("groups.discover")}
            </Text>
          </Pressable>
        )}
        {showCodeCta && (
          <Pressable
            onPress={() => setCodeModalVisible(true)}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", gap: 6,
              paddingVertical: 12, paddingHorizontal: 20,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: theme.colors.surface,
              borderWidth: 1, borderColor: theme.colors.border,
              minHeight: 44, opacity: pressed ? 0.7 : 1
            })}
          >
            <Key size={15} color={theme.colors.primary} />
            <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontWeight: "600", color: theme.colors.primary, fontFamily: "Inter_600SemiBold" }}>
              {t("groups.enterGroupCode")}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* ── Header ──────────────────────────────────── */}
      <View style={{
        paddingTop: insets.top + mobileTheme.spacing.md,
        paddingBottom: mobileTheme.spacing.lg,
        paddingHorizontal: mobileTheme.spacing.xl,
        backgroundColor: theme.colors.white,
        flexDirection: "row", alignItems: "center", gap: mobileTheme.spacing.md,
        borderBottomWidth: 1, borderBottomColor: theme.colors.border
      }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: theme.colors.background,
          alignItems: "center", justifyContent: "center"
        }}>
          <ArrowLeft size={20} color={theme.colors.ink} />
        </Pressable>
        <Text style={{
          flex: 1, fontSize: mobileTheme.typography.subheading.fontSize,
          fontWeight: "700", color: theme.colors.ink, fontFamily: "Inter_700Bold"
        }}>
          {t("groups.title")}
        </Text>
        <Pressable onPress={() => setCodeModalVisible(true)} hitSlop={12} style={{
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: theme.colors.background,
          alignItems: "center", justifyContent: "center"
        }}>
          <Key size={18} color={theme.colors.ink} />
        </Pressable>
        <Pressable onPress={() => setCreateOpen(true)} hitSlop={12} style={{
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: theme.colors.primary,
          alignItems: "center", justifyContent: "center",
          marginLeft: 8
        }}>
          <Plus size={20} color={theme.colors.white} />
        </Pressable>
      </View>

      {/* ── Tabs ────────────────────────────────────── */}
      <View style={{
        flexDirection: "row",
        marginHorizontal: mobileTheme.spacing.xl,
        marginTop: mobileTheme.spacing.lg,
        backgroundColor: theme.colors.surface,
        borderRadius: mobileTheme.radius.pill,
        padding: 4, borderWidth: 1, borderColor: theme.colors.border
      }}>
        {(["discover", "myGroups"] as const).map((t2) => (
          <Pressable key={t2} onPress={() => setTab(t2)} style={{
            flex: 1, paddingVertical: 12,
            borderRadius: mobileTheme.radius.pill,
            backgroundColor: tab === t2 ? theme.colors.white : "transparent",
            alignItems: "center",
            ...(tab === t2 ? mobileTheme.shadow.sm : {})
          }}>
            <Text style={{
              fontSize: mobileTheme.typography.caption.fontSize,
              fontWeight: tab === t2 ? "700" : "500",
              color: tab === t2 ? theme.colors.ink : theme.colors.muted,
              fontFamily: tab === t2 ? "Inter_700Bold" : "Inter_500Medium"
            }}>
              {t2 === "discover" ? t("groups.discover") : t("groups.myGroups")}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Search + Filters (Discover only) ─────── */}
      {tab === "discover" && (
        <View style={{ paddingHorizontal: mobileTheme.spacing.xl, gap: mobileTheme.spacing.md, marginTop: mobileTheme.spacing.lg }}>
          {/* Search */}
          <View style={{
            flexDirection: "row", alignItems: "center",
            backgroundColor: theme.colors.white,
            borderRadius: mobileTheme.radius.lg,
            paddingHorizontal: mobileTheme.spacing.lg,
            gap: mobileTheme.spacing.sm,
            borderWidth: 1, borderColor: theme.colors.border,
            ...mobileTheme.shadow.sm
          }}>
            <Search size={18} color={theme.colors.muted} />
            <TextInput
              placeholder={t("groups.searchPlaceholder")}
              placeholderTextColor={theme.colors.muted}
              value={searchText}
              onChangeText={setSearchText}
              style={{
                flex: 1, paddingVertical: 14,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink, fontFamily: "Inter_400Regular"
              }}
            />
            {searchText.length > 0 && (
              <Pressable onPress={() => setSearchText("")} hitSlop={8}>
                <X size={16} color={theme.colors.muted} />
              </Pressable>
            )}
          </View>

          {/* Pet Type Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {petTypeChips.map(({ key, label: chipLabel, icon: Icon }) => {
              const active = selectedPetType === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setSelectedPetType(key)}
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center", gap: 6,
                    paddingHorizontal: 14, paddingVertical: 10,
                    borderRadius: mobileTheme.radius.pill,
                    backgroundColor: active ? theme.colors.primary : theme.colors.white,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                    minHeight: 44,
                    opacity: pressed ? 0.8 : 1,
                    ...(active ? {} : mobileTheme.shadow.sm)
                  })}
                >
                  <Icon size={16} color={active ? theme.colors.white : theme.colors.muted} />
                  <Text style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    fontWeight: "600",
                    color: active ? theme.colors.white : theme.colors.ink,
                    fontFamily: "Inter_600SemiBold",
                    textTransform: "capitalize"
                  }}>
                    {chipLabel}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Content ─────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingTop: mobileTheme.spacing.md,
          paddingBottom: insets.bottom + 32
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />
        }
      >
        {groupsQuery.isLoading && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <LottieLoading size={70} />
          </View>
        )}

        {!groupsQuery.isLoading && tab === "discover" && (
          <>
            {allGroups.length === 0 ? (
              renderEmptyState(
                debouncedSearch ? t("groups.noSearchResults") : t("groups.noGroups"),
                debouncedSearch ? t("groups.tryDifferentKeywords") : t("groups.noGroupsDescription"),
                true
              )
            ) : (
              <>
                {nearbyGroups.length > 0 && (
                  <>
                    {renderSectionHeader(t("groups.nearby"), <MapPin size={14} color={theme.colors.primary} />)}
                    {nearbyGroups.map(renderGroupCard)}
                  </>
                )}
                {nearbyGroups.length === 0 && userLocation && allGroups.length > 0 && (
                  <View style={{
                    backgroundColor: theme.colors.primaryBg,
                    borderRadius: mobileTheme.radius.lg,
                    padding: mobileTheme.spacing.lg,
                    marginTop: mobileTheme.spacing.md,
                    marginBottom: mobileTheme.spacing.sm,
                    flexDirection: "row", alignItems: "center", gap: mobileTheme.spacing.sm
                  }}>
                    <MapPin size={16} color={theme.colors.primary} />
                    <Text style={{
                      fontSize: mobileTheme.typography.caption.fontSize,
                      color: theme.colors.primary, fontFamily: "Inter_500Medium", flex: 1
                    }}>
                      {t("groups.noNearbyGroups")}
                    </Text>
                  </View>
                )}
                {globalGroups.length > 0 && (
                  <>
                    {renderSectionHeader(t("groups.global"), <Users2 size={14} color={theme.colors.secondary} />)}
                    {globalGroups.map(renderGroupCard)}
                  </>
                )}
              </>
            )}
          </>
        )}

        {!groupsQuery.isLoading && tab === "myGroups" && (
          myGroups.length === 0
            ? renderEmptyState(t("groups.noMyGroups"), t("groups.noMyGroupsDescription"), true, true)
            : myGroups.map(renderGroupCard)
        )}
      </ScrollView>

      {/* ── Code Entry Modal ────────────────────────── */}
      <Modal visible={codeModalVisible} animationType="fade" transparent>
        <Pressable
          onPress={() => { setCodeModalVisible(false); setCodeInput(""); }}
          style={{ flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "center", paddingHorizontal: mobileTheme.spacing.xl }}
        >
          <Pressable style={{
            backgroundColor: theme.colors.white,
            borderRadius: mobileTheme.radius.xl,
            padding: mobileTheme.spacing["2xl"],
            gap: mobileTheme.spacing.xl,
            ...mobileTheme.shadow.lg
          }}>
            {/* Modal header */}
            <View style={{ alignItems: "center", gap: mobileTheme.spacing.md }}>
              <View style={{
                width: 56, height: 56, borderRadius: 28,
                backgroundColor: theme.colors.primaryBg,
                alignItems: "center", justifyContent: "center"
              }}>
                <Key size={24} color={theme.colors.primary} />
              </View>
              <Text style={{
                fontSize: mobileTheme.typography.subheading.fontSize,
                fontWeight: "700", color: theme.colors.ink,
                fontFamily: "Inter_700Bold", textAlign: "center"
              }}>
                {t("groups.enterGroupCode")}
              </Text>
            </View>

            {/* Code input */}
            <TextInput
              placeholder={t("groups.codePlaceholder")}
              placeholderTextColor={theme.colors.muted}
              value={codeInput}
              onChangeText={setCodeInput}
              autoCapitalize="characters"
              autoFocus
              style={{
                borderWidth: 1.5,
                borderColor: codeInput.trim() ? theme.colors.primary : theme.colors.border,
                borderRadius: mobileTheme.radius.lg,
                paddingHorizontal: mobileTheme.spacing.xl,
                paddingVertical: mobileTheme.spacing.lg,
                fontSize: 20,
                color: theme.colors.ink,
                fontFamily: "Inter_600SemiBold",
                textAlign: "center",
                letterSpacing: 4
              }}
            />

            {/* Buttons */}
            <View style={{ flexDirection: "row", gap: mobileTheme.spacing.md }}>
              <Pressable
                onPress={() => { setCodeModalVisible(false); setCodeInput(""); }}
                style={({ pressed }) => ({
                  flex: 1, paddingVertical: 14,
                  borderRadius: mobileTheme.radius.lg,
                  backgroundColor: theme.colors.surface,
                  alignItems: "center", minHeight: 48,
                  justifyContent: "center",
                  borderWidth: 1, borderColor: theme.colors.border,
                  opacity: pressed ? 0.7 : 1
                })}
              >
                <Text style={{ fontSize: mobileTheme.typography.bodySemiBold.fontSize, fontWeight: "600", color: theme.colors.ink, fontFamily: "Inter_600SemiBold" }}>
                  {t("common.cancel")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => codeInput.trim() && codeMutation.mutate(codeInput.trim())}
                disabled={!codeInput.trim() || codeMutation.isPending}
                style={({ pressed }) => ({
                  flex: 1, paddingVertical: 14,
                  borderRadius: mobileTheme.radius.lg,
                  backgroundColor: codeInput.trim() ? theme.colors.primary : theme.colors.border,
                  alignItems: "center", minHeight: 48,
                  justifyContent: "center",
                  opacity: pressed || codeMutation.isPending ? 0.7 : 1
                })}
              >
                <Text style={{
                  fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                  fontWeight: "600",
                  color: codeInput.trim() ? theme.colors.white : theme.colors.muted,
                  fontFamily: "Inter_600SemiBold"
                }}>
                  {codeMutation.isPending ? t("common.loading") : t("groups.joinByCode")}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Create Group Modal ────────────────────── */}
      <CreateGroupModal visible={createOpen} onClose={() => setCreateOpen(false)} />
    </View>
  );
}
