import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  MapPin,
  Navigation2,
  Phone,
  Share2,
  Star,
  X
} from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { LottieLoading } from "@/components/lottie-loading";
import {
  checkInVenue,
  createVenueReview,
  getReviewEligibility,
  getVenueDetail,
  listVenueCheckIns,
  listVenuePosts,
  listVenueReviews
} from "@/lib/api";
import { getTodayStatus, parseHours, type DayKey } from "@/lib/hours";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useReferenceLocation } from "@/lib/useReferenceLocation";
import { useSessionStore } from "@/store/session";
import type {
  VenueCheckIn,
  VenuePhotoFeedItem,
  VenueReview
} from "@petto/contracts";

const DAY_LABELS: Array<{ key: DayKey; label: string }> = [
  { key: "Mon", label: "Monday" },
  { key: "Tue", label: "Tuesday" },
  { key: "Wed", label: "Wednesday" },
  { key: "Thu", label: "Thursday" },
  { key: "Fri", label: "Friday" },
  { key: "Sat", label: "Saturday" },
  { key: "Sun", label: "Sunday" }
];

function relativeTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffSec = Math.max(1, Math.round((now - t) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function VenueDetailPage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const token = session?.tokens.accessToken ?? "";

  const { id } = useLocalSearchParams<{ id: string }>();
  const venueId = (Array.isArray(id) ? id[0] : id) ?? "";

  const refLoc = useReferenceLocation();

  const [checkInsMode, setCheckInsMode] = useState<"active" | "history">("active");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  /* ── Queries ────────────────────────────────────────────────────── */

  const { data: detail, isLoading } = useQuery({
    queryKey: ["venue-detail", venueId, refLoc.roundedKey],
    queryFn: () => getVenueDetail(token, venueId, refLoc.latitude, refLoc.longitude),
    enabled: Boolean(token && venueId),
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });

  const { data: photos = [] } = useQuery({
    queryKey: ["venue-posts", venueId],
    queryFn: () => listVenuePosts(token, venueId),
    enabled: Boolean(token && venueId),
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });

  const { data: checkIns = [] } = useQuery({
    queryKey: ["venue-check-ins", venueId, checkInsMode],
    queryFn: () => listVenueCheckIns(token, venueId, checkInsMode),
    enabled: Boolean(token && venueId),
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["venue-reviews", venueId],
    queryFn: () => listVenueReviews(token, venueId),
    enabled: Boolean(token && venueId),
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });

  const { data: eligibility } = useQuery({
    queryKey: ["venue-review-eligibility", venueId, session?.user.id],
    queryFn: () => getReviewEligibility(token, venueId),
    enabled: Boolean(token && venueId && session?.user.id),
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });

  const checkInMutation = useMutation({
    mutationFn: () =>
      checkInVenue(token, venueId, [], refLoc.latitude, refLoc.longitude),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["venue-detail", venueId] });
      queryClient.invalidateQueries({ queryKey: ["venue-check-ins", venueId] });
      queryClient.invalidateQueries({ queryKey: ["venue-review-eligibility", venueId] });
      queryClient.invalidateQueries({ queryKey: ["explore-venues"] });
    },
    onError: (err) => {
      Alert.alert("Check-in failed", err instanceof Error ? err.message : "Please try again.");
    }
  });

  const submitReview = async () => {
    if (!rating || rating < 1 || rating > 5) return;
    try {
      setSubmittingReview(true);
      await createVenueReview(token, venueId, rating, comment.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReviewOpen(false);
      setComment("");
      setRating(5);
      queryClient.invalidateQueries({ queryKey: ["venue-reviews", venueId] });
      queryClient.invalidateQueries({ queryKey: ["venue-detail", venueId] });
      queryClient.invalidateQueries({ queryKey: ["venue-review-eligibility", venueId] });
    } catch (err) {
      Alert.alert("Review failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSubmittingReview(false);
    }
  };

  /* ── Derived ────────────────────────────────────────────────────── */

  const hoursParsed = useMemo(() => parseHours(detail?.hours), [detail?.hours]);
  const todayStatus = useMemo(() => getTodayStatus(detail?.hours), [detail?.hours]);

  const distanceLabel = useMemo(() => {
    if (detail?.distanceKm == null) return null;
    if (detail.distanceKm < 1) {
      return `${Math.round(detail.distanceKm * 1000)} m`;
    }
    return `${detail.distanceKm.toFixed(1)} km`;
  }, [detail?.distanceKm]);

  const withinCheckInRange = (detail?.distanceKm ?? Infinity) <= 0.5;
  const alreadyCheckedIn = useMemo(() => {
    const uid = session?.user.id;
    return Boolean(detail?.currentCheckIns?.some((ci) => ci.userId === uid));
  }, [detail?.currentCheckIns, session?.user.id]);

  /* ── Rendering ──────────────────────────────────────────────────── */

  if (isLoading || !detail) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: "center", alignItems: "center" }}>
        <LottieLoading />
      </View>
    );
  }

  const stats = detail.stats;
  const hasReviews = stats.reviewCount > 0;
  const maxDist = Math.max(
    stats.ratingDistribution[1],
    stats.ratingDistribution[2],
    stats.ratingDistribution[3],
    stats.ratingDistribution[4],
    stats.ratingDistribution[5],
    1
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <View style={{ position: "relative" }}>
          {detail.imageUrl ? (
            <Image
              source={{ uri: detail.imageUrl }}
              style={{ width: "100%", height: 320, backgroundColor: theme.colors.border }}
              contentFit="cover"
              transition={250}
              cachePolicy="memory-disk"
            />
          ) : (
            <LinearGradient
              colors={[theme.colors.primary, theme.colors.primaryBg as string]}
              style={{ width: "100%", height: 320 }}
            />
          )}

          {/* Gradient scrim for readability */}
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)", "rgba(0,0,0,0.65)"]}
            locations={[0, 0.45, 1]}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
          />

          {/* Top bar */}
          <View
            style={{
              position: "absolute",
              top: insets.top + 4,
              left: mobileTheme.spacing.md,
              right: mobileTheme.spacing.md,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: pressed ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.85)",
                alignItems: "center",
                justifyContent: "center"
              })}
            >
              <ArrowLeft size={20} color="#16141A" />
            </Pressable>
            <Pressable
              onPress={() => {
                Share.share({
                  message: `${detail.name} · ${detail.address}`,
                  title: detail.name
                });
              }}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: pressed ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.85)",
                alignItems: "center",
                justifyContent: "center"
              })}
            >
              <Share2 size={18} color="#16141A" />
            </Pressable>
          </View>

          {/* Title block */}
          <View
            style={{
              position: "absolute",
              left: mobileTheme.spacing.xl,
              right: mobileTheme.spacing.xl,
              bottom: mobileTheme.spacing.xl,
              gap: 6
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: "rgba(255,255,255,0.2)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.3)"
                }}
              >
                <Text style={{ fontSize: 10.5, color: "#FFFFFF", fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {detail.category}
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: todayStatus.open ? "rgba(92, 184, 112, 0.95)" : "rgba(0,0,0,0.55)"
                }}
              >
                <Text style={{ fontSize: 10.5, color: "#FFFFFF", fontFamily: "Inter_700Bold", letterSpacing: 0.3 }}>
                  {todayStatus.label}
                </Text>
              </View>
            </View>

            <Text style={{ color: "#FFFFFF", fontSize: 30, fontFamily: "Inter_700Bold", lineHeight: 36 }}>
              {detail.name}
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Star size={14} color="#FBBF24" fill="#FBBF24" />
                <Text style={{ color: "#FFFFFF", fontSize: 13, fontFamily: "Inter_700Bold" }}>
                  {hasReviews ? stats.avgRating.toFixed(1) : "—"}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
                  ({stats.reviewCount})
                </Text>
              </View>
              <Text style={{ color: "rgba(255,255,255,0.55)" }}>·</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Check size={13} color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                  {stats.checkInCount} check-ins
                </Text>
              </View>
              {distanceLabel ? (
                <>
                  <Text style={{ color: "rgba(255,255,255,0.55)" }}>·</Text>
                  <Text style={{ color: "#FFFFFF", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                    {distanceLabel}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Quick actions ────────────────────────────────────────── */}
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: mobileTheme.spacing.xl, marginTop: mobileTheme.spacing.xl }}>
          <QuickAction
            icon={<Navigation2 size={16} color={theme.colors.primary} />}
            label="Directions"
            onPress={() => {
              const url = Platform.select({
                ios: `maps://?daddr=${detail.latitude},${detail.longitude}`,
                android: `geo:${detail.latitude},${detail.longitude}?q=${detail.latitude},${detail.longitude}(${encodeURIComponent(detail.name)})`
              });
              if (url) Linking.openURL(url).catch(() => {});
            }}
            theme={theme}
          />
          <QuickAction
            icon={<MapPin size={16} color={theme.colors.primary} />}
            label="Map"
            onPress={() => router.back()}
            theme={theme}
          />
          <QuickAction
            icon={<Share2 size={16} color={theme.colors.primary} />}
            label="Share"
            onPress={() => Share.share({ message: detail.name, title: detail.name })}
            theme={theme}
          />
        </View>

        {/* ── Stats row ────────────────────────────────────────────── */}
        <View
          style={{
            flexDirection: "row",
            marginHorizontal: mobileTheme.spacing.xl,
            marginTop: mobileTheme.spacing.xl,
            backgroundColor: theme.colors.surface,
            borderRadius: mobileTheme.radius.lg,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: mobileTheme.spacing.md
          }}
        >
          <StatCell label="Active now" value={String(stats.activeCheckInCount)} theme={theme} highlight />
          <StatDivider theme={theme} />
          <StatCell label="Visitors" value={String(stats.uniqueVisitorCount)} theme={theme} />
          <StatDivider theme={theme} />
          <StatCell label="Rating" value={hasReviews ? stats.avgRating.toFixed(1) : "—"} theme={theme} />
        </View>

        {/* ── About ────────────────────────────────────────────────── */}
        {detail.description ? (
          <Section title="About" theme={theme}>
            <Text
              style={{
                fontSize: 14,
                lineHeight: 21,
                fontFamily: "Inter_400Regular",
                color: theme.colors.ink
              }}
            >
              {detail.description}
            </Text>
          </Section>
        ) : null}

        {/* ── Address ──────────────────────────────────────────────── */}
        <Section title="Address" theme={theme}>
          <Pressable
            onPress={() => {
              const url = Platform.select({
                ios: `maps://?daddr=${detail.latitude},${detail.longitude}`,
                android: `geo:${detail.latitude},${detail.longitude}?q=${encodeURIComponent(detail.address)}`
              });
              if (url) Linking.openURL(url).catch(() => {});
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              opacity: pressed ? 0.7 : 1
            })}
          >
            <MapPin size={16} color={theme.colors.muted} />
            <Text style={{ flex: 1, fontSize: 14, color: theme.colors.ink, fontFamily: "Inter_500Medium" }}>
              {detail.address || "Address unavailable"}
            </Text>
            <ChevronRight size={16} color={theme.colors.muted} />
          </Pressable>
        </Section>

        {/* ── Hours ────────────────────────────────────────────────── */}
        <Section
          title="Hours"
          theme={theme}
          trailing={
            <View
              style={{
                paddingHorizontal: 9,
                paddingVertical: 3,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: todayStatus.open ? theme.colors.successBg : theme.colors.border
              }}
            >
              <Text
                style={{
                  fontSize: 10.5,
                  fontFamily: "Inter_700Bold",
                  color: todayStatus.open ? theme.colors.success : theme.colors.muted
                }}
              >
                {todayStatus.label}
              </Text>
            </View>
          }
        >
          <View style={{ gap: 6 }}>
            {DAY_LABELS.map(({ key, label }) => {
              const h = hoursParsed[key];
              const today = new Date().getDay();
              const isToday =
                (today === 0 && key === "Sun") ||
                (today === 1 && key === "Mon") ||
                (today === 2 && key === "Tue") ||
                (today === 3 && key === "Wed") ||
                (today === 4 && key === "Thu") ||
                (today === 5 && key === "Fri") ||
                (today === 6 && key === "Sat");
              return (
                <View
                  key={key}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 4
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: isToday ? theme.colors.ink : theme.colors.muted,
                      fontFamily: isToday ? "Inter_700Bold" : "Inter_500Medium"
                    }}
                  >
                    {label}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: isToday ? theme.colors.ink : theme.colors.muted,
                      fontFamily: isToday ? "Inter_700Bold" : "Inter_500Medium"
                    }}
                  >
                    {h === "closed" ? "Closed" : h ? `${h.open} – ${h.close}` : "—"}
                  </Text>
                </View>
              );
            })}
          </View>
        </Section>

        {/* ── Photos ──────────────────────────────────────────────── */}
        {photos.length > 0 ? (
          <Section title={`Photos (${photos.length})`} theme={theme}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -mobileTheme.spacing.xl }}
              contentContainerStyle={{
                gap: 8,
                paddingHorizontal: mobileTheme.spacing.xl
              }}
            >
              {photos.map((photo: VenuePhotoFeedItem) => (
                <View
                  key={photo.postId}
                  style={{
                    width: 180,
                    height: 220,
                    borderRadius: mobileTheme.radius.lg,
                    overflow: "hidden",
                    backgroundColor: theme.colors.border
                  }}
                >
                  <Image
                    source={{ uri: photo.imageUrl }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                  />
                  <LinearGradient
                    colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.7)"]}
                    style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: "60%" }}
                  />
                  <Text
                    numberOfLines={1}
                    style={{
                      position: "absolute",
                      bottom: 10,
                      left: 10,
                      right: 10,
                      color: "#FFFFFF",
                      fontSize: 11,
                      fontFamily: "Inter_600SemiBold"
                    }}
                  >
                    {photo.authorName}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {/* ── Check-ins ────────────────────────────────────────────── */}
        <Section title="Check-ins" theme={theme}>
          <View
            style={{
              flexDirection: "row",
              alignSelf: "flex-start",
              padding: 3,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: theme.colors.border,
              marginBottom: mobileTheme.spacing.md
            }}
          >
            <SegmentBtn
              active={checkInsMode === "active"}
              onPress={() => setCheckInsMode("active")}
              label={`Active (${stats.activeCheckInCount})`}
              theme={theme}
            />
            <SegmentBtn
              active={checkInsMode === "history"}
              onPress={() => setCheckInsMode("history")}
              label={`All-time (${stats.uniqueVisitorCount})`}
              theme={theme}
            />
          </View>

          {checkIns.length === 0 ? (
            <Text style={{ color: theme.colors.muted, fontSize: 13, fontFamily: "Inter_400Regular" }}>
              {checkInsMode === "active" ? "No one is here right now." : "No visits logged yet."}
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {checkIns.map((ci: VenueCheckIn) => (
                <View key={`${ci.userId}-${ci.checkedInAt}`} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Avatar uri={ci.avatarUrl ?? undefined} name={ci.userName} size="sm" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.colors.ink }} numberOfLines={1}>
                      {ci.userName || "Someone"}
                    </Text>
                    {ci.petNames.length > 0 ? (
                      <Text style={{ fontSize: 11, color: theme.colors.muted, fontFamily: "Inter_400Regular" }} numberOfLines={1}>
                        {ci.petNames.join(", ")}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 11, color: theme.colors.muted, fontFamily: "Inter_500Medium" }}>
                    {relativeTime(ci.checkedInAt)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        {/* ── Reviews ──────────────────────────────────────────────── */}
        <Section
          title="Reviews"
          theme={theme}
          trailing={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Star size={13} color="#FBBF24" fill="#FBBF24" />
              <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: theme.colors.ink }}>
                {hasReviews ? stats.avgRating.toFixed(1) : "—"}
              </Text>
              <Text style={{ fontSize: 12, color: theme.colors.muted }}>({stats.reviewCount})</Text>
            </View>
          }
        >
          {hasReviews ? (
            <View style={{ gap: 4, marginBottom: mobileTheme.spacing.md }}>
              {([5, 4, 3, 2, 1] as const).map((r) => {
                const count = stats.ratingDistribution[r];
                const pct = Math.max(3, Math.round((count / maxDist) * 100));
                return (
                  <View key={r} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ width: 12, fontSize: 11, color: theme.colors.muted, fontFamily: "Inter_600SemiBold" }}>{r}</Text>
                    <Star size={11} color="#FBBF24" fill="#FBBF24" />
                    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: "hidden" }}>
                      <View style={{ width: `${pct}%`, height: "100%", backgroundColor: "#FBBF24" }} />
                    </View>
                    <Text style={{ width: 22, textAlign: "right", fontSize: 11, color: theme.colors.muted, fontFamily: "Inter_500Medium" }}>
                      {count}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Write a review CTA */}
          {eligibility ? (
            eligibility.eligible ? (
              <Pressable
                onPress={() => setReviewOpen(true)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 11,
                  borderRadius: mobileTheme.radius.pill,
                  borderWidth: 1.5,
                  borderColor: theme.colors.primary,
                  backgroundColor: pressed ? theme.colors.primaryBg : "transparent",
                  marginBottom: mobileTheme.spacing.md
                })}
              >
                <Star size={14} color={theme.colors.primary} />
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: theme.colors.primary }}>
                  Write a review
                </Text>
              </Pressable>
            ) : eligibility.reason === "no_check_in" ? (
              <View
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: theme.colors.border,
                  alignSelf: "flex-start",
                  marginBottom: mobileTheme.spacing.md
                }}
              >
                <Text style={{ fontSize: 12, color: theme.colors.muted, fontFamily: "Inter_500Medium" }}>
                  Check in here first to leave a review
                </Text>
              </View>
            ) : null
          ) : null}

          {reviews.length === 0 ? (
            <Text style={{ color: theme.colors.muted, fontSize: 13, fontFamily: "Inter_400Regular" }}>
              Be the first to review this place.
            </Text>
          ) : (
            <View style={{ gap: mobileTheme.spacing.md }}>
              {reviews.slice(0, 10).map((r: VenueReview) => (
                <View key={r.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Avatar name={r.userName} size="xs" />
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.colors.ink }} numberOfLines={1}>
                      {r.userName || "Someone"}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 2, marginLeft: "auto" }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          size={11}
                          color={n <= r.rating ? "#FBBF24" : theme.colors.border}
                          fill={n <= r.rating ? "#FBBF24" : "transparent"}
                        />
                      ))}
                    </View>
                  </View>
                  {r.comment ? (
                    <Text style={{ fontSize: 13, color: theme.colors.ink, fontFamily: "Inter_400Regular", lineHeight: 19 }}>
                      {r.comment}
                    </Text>
                  ) : null}
                  <Text style={{ fontSize: 11, color: theme.colors.muted, fontFamily: "Inter_500Medium" }}>
                    {relativeTime(r.createdAt)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Section>
      </ScrollView>

      {/* ── Sticky bottom CTA ──────────────────────────────────────── */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: 10,
          paddingBottom: insets.bottom + 10,
          paddingHorizontal: mobileTheme.spacing.xl,
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border
        }}
      >
        {alreadyCheckedIn ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 14,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: theme.colors.successBg
            }}
          >
            <Check size={16} color={theme.colors.success} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: theme.colors.success }}>
              You&apos;re checked in here
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => checkInMutation.mutate()}
            disabled={!withinCheckInRange || checkInMutation.isPending}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 14,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: withinCheckInRange ? theme.colors.primary : theme.colors.border,
              opacity: pressed ? 0.85 : checkInMutation.isPending ? 0.6 : 1
            })}
          >
            {checkInMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Check size={16} color={withinCheckInRange ? "#FFFFFF" : theme.colors.muted} />
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "Inter_700Bold",
                    color: withinCheckInRange ? "#FFFFFF" : theme.colors.muted
                  }}
                >
                  {withinCheckInRange
                    ? "Check In"
                    : distanceLabel
                    ? `You're ${distanceLabel} away`
                    : "Get closer to check in"}
                </Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      {/* ── Review modal ────────────────────────────────────────────── */}
      <Modal
        visible={reviewOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setReviewOpen(false)}
      >
        <Pressable
          onPress={() => setReviewOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: mobileTheme.spacing.xl,
              paddingTop: mobileTheme.spacing.xl,
              paddingBottom: insets.bottom + mobileTheme.spacing.xl,
              gap: mobileTheme.spacing.md
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.colors.ink }}>
                Write a review
              </Text>
              <Pressable
                onPress={() => setReviewOpen(false)}
                hitSlop={8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.colors.border
                }}
              >
                <X size={16} color={theme.colors.ink} />
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
                  <Star
                    size={36}
                    color="#FBBF24"
                    fill={n <= rating ? "#FBBF24" : "transparent"}
                  />
                </Pressable>
              ))}
            </View>

            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Share your experience (optional)"
              placeholderTextColor={theme.colors.muted}
              multiline
              maxLength={500}
              style={{
                minHeight: 100,
                textAlignVertical: "top",
                padding: 12,
                borderRadius: mobileTheme.radius.lg,
                borderWidth: 1,
                borderColor: theme.colors.border,
                color: theme.colors.ink,
                fontSize: 14,
                fontFamily: "Inter_400Regular",
                backgroundColor: theme.colors.background
              }}
            />

            <Pressable
              onPress={submitReview}
              disabled={submittingReview}
              style={({ pressed }) => ({
                paddingVertical: 14,
                alignItems: "center",
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: theme.colors.primary,
                opacity: pressed ? 0.85 : submittingReview ? 0.6 : 1
              })}
            >
              {submittingReview ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={{ color: "#FFFFFF", fontSize: 14, fontFamily: "Inter_700Bold" }}>
                  Submit review
                </Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ── Sub-components ────────────────────────────────────────────────── */

function QuickAction({
  icon,
  label,
  onPress,
  theme
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 12,
        borderRadius: mobileTheme.radius.lg,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.85 : 1
      })}
    >
      {icon}
      <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: theme.colors.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

function StatCell({
  label,
  value,
  theme,
  highlight = false
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
  highlight?: boolean;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <Text
        style={{
          fontSize: 22,
          fontFamily: "Inter_700Bold",
          color: highlight ? theme.colors.primary : theme.colors.ink
        }}
      >
        {value}
      </Text>
      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: theme.colors.muted }}>
        {label}
      </Text>
    </View>
  );
}

function StatDivider({ theme }: { theme: ReturnType<typeof useTheme> }) {
  return (
    <View
      style={{
        width: 1,
        alignSelf: "stretch",
        backgroundColor: theme.colors.border,
        marginVertical: 4
      }}
    />
  );
}

function Section({
  title,
  children,
  theme,
  trailing
}: {
  title: string;
  children: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: mobileTheme.spacing.xl, marginTop: mobileTheme.spacing.xl, gap: mobileTheme.spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: theme.colors.ink }}>
          {title}
        </Text>
        {trailing}
      </View>
      <View>{children}</View>
    </View>
  );
}

function SegmentBtn({
  active,
  onPress,
  label,
  theme
}: {
  active: boolean;
  onPress: () => void;
  label: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: active ? theme.colors.surface : "transparent",
        opacity: pressed ? 0.85 : 1
      })}
    >
      <Text
        style={{
          fontSize: 12,
          fontFamily: active ? "Inter_700Bold" : "Inter_500Medium",
          color: active ? theme.colors.ink : theme.colors.muted
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
