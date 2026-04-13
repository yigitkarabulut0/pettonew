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
import { LottieLoading } from "@/components/lottie-loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Key, MapPin, MessageCircle, Search, Users2 } from "lucide-react-native";
import * as Location from "expo-location";

import { useTranslation } from "react-i18next";
import { listGroups, joinGroup, joinGroupByCode } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import type { CommunityGroup } from "@petto/contracts";

const PET_TYPES = ["all", "dog", "cat", "bird", "rabbit", "other"];

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
  const [codeInput, setCodeInput] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Get user location
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      }
    })();
  }, []);

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

  const onRefresh = useCallback(() => { groupsQuery.refetch(); }, [groupsQuery]);

  const allGroups = groupsQuery.data ?? [];
  const myGroups = useMemo(() => allGroups.filter((g) => g.isMember), [allGroups]);
  const nearbyGroups = useMemo(() => allGroups.filter((g) => g.distance != null && g.distance > 0 && g.distance <= 50), [allGroups]);
  const globalGroups = useMemo(() => allGroups.filter((g) => !g.distance || g.distance > 50 || g.distance === 0), [allGroups]);

  const formatDistance = (d: number) => d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;

  const renderGroupCard = (group: CommunityGroup) => (
    <View
      key={group.id}
      style={{
        backgroundColor: theme.colors.white,
        borderRadius: mobileTheme.radius.lg,
        padding: mobileTheme.spacing.lg,
        marginBottom: mobileTheme.spacing.sm,
        gap: mobileTheme.spacing.sm,
        ...mobileTheme.shadow.sm
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: mobileTheme.typography.bodySemiBold.fontSize, fontWeight: "600", color: theme.colors.ink, flex: 1, fontFamily: "Inter_600SemiBold" }}>
          {group.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {group.distance != null && group.distance > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: theme.colors.primaryBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: mobileTheme.radius.pill }}>
              <MapPin size={10} color={theme.colors.primary} />
              <Text style={{ fontSize: 10, fontWeight: "600", color: theme.colors.primary, fontFamily: "Inter_600SemiBold" }}>
                {formatDistance(group.distance)}
              </Text>
            </View>
          )}
          <View style={{ backgroundColor: theme.colors.secondarySoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: mobileTheme.radius.pill }}>
            <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontWeight: "600", color: theme.colors.secondary, textTransform: "capitalize", fontFamily: "Inter_600SemiBold" }}>
              {group.petType}
            </Text>
          </View>
        </View>
      </View>

      <Text numberOfLines={2} style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.muted, lineHeight: 18, fontFamily: "Inter_400Regular" }}>
        {group.description}
      </Text>

      {/* Member avatars */}
      {group.isMember && group.members?.length > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {group.members.slice(0, 5).map((member, idx) => (
            <View key={member.userId} style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: theme.colors.white, overflow: "hidden", backgroundColor: theme.colors.primaryBg, marginLeft: idx > 0 ? -8 : 0 }}>
              {member.avatarUrl ? (
                <Image source={{ uri: member.avatarUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              ) : (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.primary }}>{member.firstName?.[0] ?? "?"}</Text>
                </View>
              )}
            </View>
          ))}
          {group.members.length > 5 && (
            <Text style={{ fontSize: 10, color: theme.colors.muted, marginLeft: 4 }}>+{group.members.length - 5}</Text>
          )}
        </View>
      )}

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Users2 size={13} color={theme.colors.muted} />
          <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, color: theme.colors.muted, fontFamily: "Inter_500Medium" }}>
            {t("groups.members", { count: group.memberCount })}
          </Text>
        </View>
        {group.isMember ? (
          <Pressable
            onPress={() => group.conversationId && router.push(`/(app)/conversation/${group.conversationId}` as any)}
            style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: mobileTheme.radius.md, flexDirection: "row", alignItems: "center", gap: 5 }}
          >
            <MessageCircle size={13} color={theme.colors.white} />
            <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontWeight: "600", color: theme.colors.white, fontFamily: "Inter_600SemiBold" }}>{t("groups.chat")}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => joinMutation.mutate(group.id)}
            disabled={joinMutation.isPending}
            style={{ backgroundColor: theme.colors.primaryBg, paddingHorizontal: 12, paddingVertical: 7, borderRadius: mobileTheme.radius.md, opacity: joinMutation.isPending ? 0.5 : 1 }}
          >
            <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontWeight: "600", color: theme.colors.primary, fontFamily: "Inter_600SemiBold" }}>
              {joinMutation.isPending ? t("common.loading") : t("common.join")}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  const renderSectionHeader = (title: string) => (
    <Text style={{ fontSize: mobileTheme.typography.label.fontSize, fontWeight: "700", color: theme.colors.ink, fontFamily: "Inter_700Bold", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: mobileTheme.spacing.sm, marginTop: mobileTheme.spacing.md }}>
      {title}
    </Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + mobileTheme.spacing.md, paddingBottom: mobileTheme.spacing.md, paddingHorizontal: mobileTheme.spacing.xl, backgroundColor: theme.colors.white, flexDirection: "row", alignItems: "center", gap: mobileTheme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center" }}>
          <ArrowLeft size={18} color={theme.colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: mobileTheme.typography.subheading.fontSize, fontWeight: "700", color: theme.colors.ink, fontFamily: "Inter_700Bold" }}>
          {t("groups.title")}
        </Text>
        <Pressable onPress={() => setCodeModalVisible(true)} hitSlop={12} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primaryBg, alignItems: "center", justifyContent: "center" }}>
          <Key size={16} color={theme.colors.primary} />
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: "row", marginHorizontal: mobileTheme.spacing.xl, marginTop: mobileTheme.spacing.md, backgroundColor: theme.colors.surface, borderRadius: mobileTheme.radius.pill, padding: 3 }}>
        {(["discover", "myGroups"] as const).map((t2) => (
          <Pressable key={t2} onPress={() => setTab(t2)} style={{ flex: 1, paddingVertical: 10, borderRadius: mobileTheme.radius.pill, backgroundColor: tab === t2 ? theme.colors.white : "transparent", alignItems: "center", ...(tab === t2 ? mobileTheme.shadow.sm : {}) }}>
            <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontWeight: "600", color: tab === t2 ? theme.colors.ink : theme.colors.muted, fontFamily: "Inter_600SemiBold" }}>
              {t2 === "discover" ? t("groups.discover") : t("groups.myGroups")}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Search + Filters (only in Discover tab) */}
      {tab === "discover" && (
        <>
          <View style={{ marginHorizontal: mobileTheme.spacing.xl, marginTop: mobileTheme.spacing.md, flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: mobileTheme.radius.pill, paddingHorizontal: mobileTheme.spacing.md, gap: 8 }}>
            <Search size={16} color={theme.colors.muted} />
            <TextInput
              placeholder={t("groups.searchPlaceholder")}
              placeholderTextColor={theme.colors.muted}
              value={searchText}
              onChangeText={setSearchText}
              style={{ flex: 1, paddingVertical: 10, fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.ink, fontFamily: "Inter_400Regular" }}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: mobileTheme.spacing.xl, gap: 8, marginTop: mobileTheme.spacing.sm }}>
            {PET_TYPES.map((pt) => (
              <Pressable
                key={pt}
                onPress={() => setSelectedPetType(pt)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: mobileTheme.radius.pill, backgroundColor: selectedPetType === pt ? theme.colors.primaryBg : theme.colors.surface, borderWidth: 1, borderColor: selectedPetType === pt ? theme.colors.primary : theme.colors.border }}
              >
                <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontWeight: "600", color: selectedPetType === pt ? theme.colors.primary : theme.colors.ink, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>
                  {pt === "all" ? t("groups.all") : pt}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {/* Content */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: mobileTheme.spacing.xl, paddingTop: mobileTheme.spacing.md, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={groupsQuery.isRefetching} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {groupsQuery.isLoading && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <LottieLoading size={70} />
          </View>
        )}

        {!groupsQuery.isLoading && tab === "discover" && (
          <>
            {allGroups.length === 0 ? (
              <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center", gap: mobileTheme.spacing.lg }}>
                <Users2 size={48} color={theme.colors.muted} />
                <Text style={{ fontSize: mobileTheme.typography.subheading.fontSize, fontWeight: "600", color: theme.colors.ink, fontFamily: "Inter_600SemiBold" }}>
                  {debouncedSearch ? t("groups.noSearchResults") : t("groups.noGroups")}
                </Text>
                <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.muted, textAlign: "center", paddingHorizontal: mobileTheme.spacing["3xl"], fontFamily: "Inter_400Regular" }}>
                  {debouncedSearch ? t("groups.tryDifferentKeywords") : t("groups.noGroupsDescription")}
                </Text>
                <Pressable onPress={() => setCodeModalVisible(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.colors.primaryBg, paddingHorizontal: 16, paddingVertical: 10, borderRadius: mobileTheme.radius.pill }}>
                  <Key size={14} color={theme.colors.primary} />
                  <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontWeight: "600", color: theme.colors.primary, fontFamily: "Inter_600SemiBold" }}>{t("groups.enterGroupCode")}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {nearbyGroups.length > 0 && (
                  <>
                    {renderSectionHeader(t("groups.nearby"))}
                    {nearbyGroups.map(renderGroupCard)}
                  </>
                )}
                {nearbyGroups.length === 0 && userLocation && allGroups.length > 0 && (
                  <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.muted, textAlign: "center", paddingVertical: mobileTheme.spacing.md, fontFamily: "Inter_400Regular" }}>
                    {t("groups.noNearbyGroups")}
                  </Text>
                )}
                {globalGroups.length > 0 && (
                  <>
                    {renderSectionHeader(t("groups.global"))}
                    {globalGroups.map(renderGroupCard)}
                  </>
                )}
              </>
            )}
          </>
        )}

        {!groupsQuery.isLoading && tab === "myGroups" && (
          <>
            {myGroups.length === 0 ? (
              <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center", gap: mobileTheme.spacing.lg }}>
                <Users2 size={48} color={theme.colors.muted} />
                <Text style={{ fontSize: mobileTheme.typography.subheading.fontSize, fontWeight: "600", color: theme.colors.ink, fontFamily: "Inter_600SemiBold" }}>
                  {t("groups.noMyGroups")}
                </Text>
                <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.muted, textAlign: "center", paddingHorizontal: mobileTheme.spacing["3xl"], fontFamily: "Inter_400Regular" }}>
                  {t("groups.noMyGroupsDescription")}
                </Text>
                <Pressable onPress={() => setTab("discover")} style={{ backgroundColor: theme.colors.primaryBg, paddingHorizontal: 16, paddingVertical: 10, borderRadius: mobileTheme.radius.pill }}>
                  <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontWeight: "600", color: theme.colors.primary, fontFamily: "Inter_600SemiBold" }}>{t("groups.discover")}</Text>
                </Pressable>
                <Pressable onPress={() => setCodeModalVisible(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6 }}>
                  <Key size={14} color={theme.colors.primary} />
                  <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontWeight: "600", color: theme.colors.primary, fontFamily: "Inter_600SemiBold" }}>{t("groups.enterGroupCode")}</Text>
                </Pressable>
              </View>
            ) : (
              myGroups.map(renderGroupCard)
            )}
          </>
        )}
      </ScrollView>

      {/* Code Entry Modal */}
      <Modal visible={codeModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", paddingHorizontal: mobileTheme.spacing.xl }}>
          <View style={{ backgroundColor: theme.colors.white, borderRadius: mobileTheme.radius.lg, padding: mobileTheme.spacing.xl, gap: mobileTheme.spacing.lg }}>
            <Text style={{ fontSize: mobileTheme.typography.subheading.fontSize, fontWeight: "700", color: theme.colors.ink, fontFamily: "Inter_700Bold", textAlign: "center" }}>
              {t("groups.enterGroupCode")}
            </Text>
            <TextInput
              placeholder={t("groups.codePlaceholder")}
              placeholderTextColor={theme.colors.muted}
              value={codeInput}
              onChangeText={setCodeInput}
              autoCapitalize="characters"
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: mobileTheme.radius.md,
                paddingHorizontal: mobileTheme.spacing.lg,
                paddingVertical: mobileTheme.spacing.md,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink,
                fontFamily: "Inter_500Medium",
                textAlign: "center",
                letterSpacing: 2
              }}
            />
            <View style={{ flexDirection: "row", gap: mobileTheme.spacing.md }}>
              <Pressable
                onPress={() => { setCodeModalVisible(false); setCodeInput(""); }}
                style={{ flex: 1, paddingVertical: 12, borderRadius: mobileTheme.radius.md, backgroundColor: theme.colors.surface, alignItems: "center" }}
              >
                <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontWeight: "600", color: theme.colors.ink, fontFamily: "Inter_600SemiBold" }}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                onPress={() => codeInput.trim() && codeMutation.mutate(codeInput.trim())}
                disabled={!codeInput.trim() || codeMutation.isPending}
                style={{ flex: 1, paddingVertical: 12, borderRadius: mobileTheme.radius.md, backgroundColor: codeInput.trim() ? theme.colors.primary : theme.colors.border, alignItems: "center", opacity: codeMutation.isPending ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontWeight: "600", color: codeInput.trim() ? theme.colors.white : theme.colors.muted, fontFamily: "Inter_600SemiBold" }}>
                  {codeMutation.isPending ? t("common.loading") : t("groups.joinByCode")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
