import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import MapView, { Marker } from "react-native-maps";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Crown,
  Edit3,
  Globe,
  ListChecks,
  Lock,
  LogOut,
  MapPin,
  Megaphone,
  MessageCircle,
  Navigation,
  PawPrint,
  Share2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X
} from "lucide-react-native";

import {
  acceptPlaydateInvite,
  announcePlaydate,
  buildPlaydateShareUrl,
  cancelPlaydate,
  declinePlaydateInvite,
  getPlaydate,
  kickPlaydateAttendee,
  leavePlaydate
} from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import { formatDistance } from "@/lib/distance";
import { formatCountdown } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { WeatherWidget } from "@/components/weather-widget";
import { CreatePlaydateModal } from "@/components/playdates/create-playdate-modal";
import { HostToolsSheet } from "@/components/playdates/host-tools-sheet";
import { JoinPlaydateModal } from "@/components/playdates/join-playdate-modal";
import { InvitePeopleModal } from "@/components/playdates/invite-people-modal";

export default function PlaydateDetailPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, initialTitle, initialImage } = useLocalSearchParams<{
    id: string;
    initialTitle?: string;
    initialImage?: string;
  }>();
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const token = session?.tokens.accessToken ?? "";

  const { data: playdate, refetch } = useQuery({
    queryKey: ["playdate-detail", id],
    queryFn: () => getPlaydate(token, id),
    enabled: Boolean(token && id)
  });

  // Recompute countdown whenever the screen regains focus.
  const [, setFocusTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusTick((n) => n + 1);
    }, [])
  );

  const [imgError, setImgError] = useState(false);
  const [attendeeSheetOpen, setAttendeeSheetOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [announceText, setAnnounceText] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const [editPetsOpen, setEditPetsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [hostToolsOpen, setHostToolsOpen] = useState(false);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["playdates"] });
    queryClient.invalidateQueries({ queryKey: ["my-playdates"] });
    refetch();
  }, [queryClient, refetch]);

  const leaveMutation = useMutation({
    mutationFn: () => leavePlaydate(token, id),
    onSuccess: invalidate
  });

  const declineMutation = useMutation({
    mutationFn: (inviteId: string) => declinePlaydateInvite(token, inviteId),
    onSuccess: () => {
      invalidate();
      router.back();
    }
  });

  const acceptMutation = useMutation({
    mutationFn: (inviteId: string) => acceptPlaydateInvite(token, inviteId),
    onSuccess: () => {
      invalidate();
      // Open the pet-picker join modal so the user commits with their pets.
      setJoinOpen(true);
    }
  });

  const kickMutation = useMutation({
    mutationFn: (targetUserID: string) =>
      kickPlaydateAttendee(token, id, targetUserID),
    onSuccess: invalidate,
    onError: (err: any) =>
      Alert.alert(
        t("playdates.hostTools.errorTitle") as string,
        err?.message ?? ""
      )
  });

  const confirmKick = (attendeeUserID: string, firstName: string) => {
    Alert.alert(
      t("playdates.hostTools.kickConfirmTitle") as string,
      t("playdates.hostTools.kickConfirmBody", { name: firstName }) as string,
      [
        { text: t("common.cancel") as string, style: "cancel" },
        {
          text: t("playdates.hostTools.kickConfirmAction") as string,
          style: "destructive",
          onPress: () => kickMutation.mutate(attendeeUserID)
        }
      ]
    );
  };

  const cancelMutation = useMutation({
    mutationFn: () => cancelPlaydate(token, id),
    onSuccess: () => {
      invalidate();
      router.back();
    }
  });

  const announceMutation = useMutation({
    mutationFn: () => announcePlaydate(token, id, announceText.trim()),
    onSuccess: () => {
      setAnnounceText("");
      setAnnounceOpen(false);
      Alert.alert(
        t("playdates.detail.announceSentTitle") as string,
        t("playdates.detail.announceSentBody") as string
      );
    }
  });

  const title = playdate?.title ?? initialTitle ?? "";
  const cover = playdate?.coverImageUrl ?? initialImage ?? "";
  const dateStr = playdate?.date ?? "";
  const when = dateStr ? new Date(dateStr) : null;
  const formattedDate =
    when && !isNaN(when.getTime())
      ? when.toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        })
      : "";
  const formattedTime =
    when && !isNaN(when.getTime())
      ? when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : "";

  const countdown = useMemo(() => formatCountdown(when), [when]);

  const attendees = playdate?.attendees ?? [];
  const attendeesInfo = playdate?.attendeesInfo ?? [];
  const rules = playdate?.rules ?? [];
  const maxPets = playdate?.maxPets ?? 0;
  const distance = playdate?.distance ?? 0;
  const isAttending = Boolean(playdate?.isAttending);
  const isOrganizer = Boolean(playdate?.isOrganizer);
  const isWaitlisted = Boolean(playdate?.isWaitlisted);
  const isCancelled = playdate?.status === "cancelled";
  const isEnded = countdown.tone === "ended";
  const isFull = maxPets > 0 && attendees.length >= maxPets;
  const isPrivate = playdate?.visibility === "private";
  const myInviteStatus = playdate?.myInviteStatus ?? "";
  const myInviteId = playdate?.myInviteId ?? "";
  const hasPendingInvite = myInviteStatus === "pending";
  const hasCoords =
    playdate?.latitude != null &&
    playdate?.longitude != null &&
    (playdate?.latitude !== 0 || playdate?.longitude !== 0);
  const hostInfo = playdate?.hostInfo;
  const conversationId = playdate?.conversationId ?? "";

  // v0.11.0 — share via https://api/p/{id} so WhatsApp, iMessage, etc.
  // recognise the link. The server-side landing page attempts to open the
  // app via petto:// and falls back to store badges.
  const handleShare = async () => {
    if (!playdate) return;
    try {
      const url = buildPlaydateShareUrl(playdate.id);
      await Share.share({
        message: `${t("playdates.detail.inviteMessage", { title: playdate.title })}\n\n${url}`
      });
    } catch {
      // user cancelled
    }
  };

  const handleInvite = async () => {
    if (!playdate) return;
    try {
      const url = buildPlaydateShareUrl(playdate.id);
      await Share.share({
        message:
          `${t("playdates.detail.inviteMessage", { title: playdate.title })}\n\n${url}`
      });
    } catch {
      // user cancelled
    }
  };

  const handleDirections = () => {
    if (!hasCoords || !playdate) return;
    const { latitude, longitude } = playdate;
    const label = encodeURIComponent(playdate.title || "Playdate");
    const url = Platform.select({
      ios: `maps://?daddr=${latitude},${longitude}&q=${label}`,
      android: `google.navigation:q=${latitude},${longitude}`,
      default: `https://maps.google.com/?q=${latitude},${longitude}`
    })!;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com/?q=${latitude},${longitude}`).catch(() => undefined);
    });
  };

  const confirmLeave = () => {
    Alert.alert(
      t("playdates.detail.confirmLeaveTitle") as string,
      t("playdates.detail.confirmLeaveBody") as string,
      [
        { text: t("common.cancel") as string, style: "cancel" },
        {
          text: t("playdates.detail.leave") as string,
          style: "destructive",
          onPress: () => leaveMutation.mutate()
        }
      ]
    );
  };

  const confirmCancel = () => {
    Alert.alert(
      t("playdates.detail.confirmCancelTitle") as string,
      t("playdates.detail.confirmCancelBody") as string,
      [
        { text: t("common.back") as string, style: "cancel" },
        {
          text: t("playdates.detail.cancel") as string,
          style: "destructive",
          onPress: () => cancelMutation.mutate()
        }
      ]
    );
  };

  const openChat = () => {
    if (!conversationId) return;
    // v0.11.0 — pass the playdate title/cover as nav params so the
    // conversation header shows the real name immediately instead of
    // flashing the localized "Conversation" fallback for one render.
    router.push({
      pathname: "/conversation/[id]",
      params: {
        id: conversationId,
        initialTitle: playdate?.title ?? "",
        initialImage: playdate?.coverImageUrl ?? ""
      }
    } as any);
  };

  const openHostProfile = () => {
    if (!hostInfo?.userId) return;
    router.push(`/user/${hostInfo.userId}` as any);
  };

  const glassBtnStyle = {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.94)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: "rgba(22,21,20,0.06)",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 160 }}
      >
        {/* Hero cover */}
        <View
          style={{
            width: "100%",
            height: 280,
            backgroundColor: theme.colors.primaryBg
          }}
        >
          {cover && !imgError ? (
            <Image
              source={{ uri: cover }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={250}
              onError={() => setImgError(true)}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <CalendarDays size={64} color={theme.colors.primary} />
            </View>
          )}
          <LinearGradient
            colors={["transparent", theme.colors.background]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 90
            }}
            pointerEvents="none"
          />

          {/* Countdown pill */}
          {countdown.label ? (
            <View
              style={{
                position: "absolute",
                left: 20,
                bottom: 22,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor:
                  countdown.tone === "ended"
                    ? "rgba(22,21,20,0.75)"
                    : theme.colors.primary,
                ...mobileTheme.shadow.sm
              }}
            >
              <Clock size={13} color={theme.colors.white} strokeWidth={2.6} />
              <Text
                style={{
                  color: theme.colors.white,
                  fontSize: 12,
                  fontFamily: "Inter_700Bold",
                  letterSpacing: 0.2
                }}
              >
                {countdown.label}
              </Text>
            </View>
          ) : null}

          {/* Top action bar */}
          <View
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
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed }) => [glassBtnStyle, { opacity: pressed ? 0.8 : 1 }]}
            >
              <ChevronLeft size={22} color={theme.colors.ink} strokeWidth={2.4} />
            </Pressable>
            <Pressable
              onPress={handleShare}
              hitSlop={10}
              style={({ pressed }) => [glassBtnStyle, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Share2 size={18} color={theme.colors.primary} strokeWidth={2.4} />
            </Pressable>
          </View>
        </View>

        {/* Body */}
        <View
          style={{
            marginTop: -24,
            paddingHorizontal: 20,
            paddingTop: 22,
            backgroundColor: theme.colors.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            gap: 20
          }}
        >
          <Text
            style={{
              fontSize: 26,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold",
              lineHeight: 32
            }}
          >
            {title}
          </Text>

          {/* State banner */}
          {isCancelled ? (
            <StateBanner
              tone="danger"
              text={t("playdates.detail.cancelledBanner") as string}
            />
          ) : isEnded ? (
            <StateBanner
              tone="neutral"
              text={t("playdates.detail.endedBanner") as string}
            />
          ) : isFull && !isAttending && !isWaitlisted ? (
            <StateBanner
              tone="warning"
              text={t("playdates.detail.fullBanner") as string}
            />
          ) : null}

          {/* Private playdate — invite-only tag */}
          {isPrivate && !isCancelled && !isEnded ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: mobileTheme.radius.md,
                backgroundColor: theme.colors.secondarySoft
              }}
            >
              <Lock size={13} color={theme.colors.secondary} />
              <Text
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: theme.colors.secondary,
                  fontFamily: "Inter_700Bold",
                  letterSpacing: 0.2
                }}
              >
                {isOrganizer
                  ? t("playdates.detail.privateHostBanner")
                  : hasPendingInvite
                  ? t("playdates.detail.privateInviteeBanner")
                  : t("playdates.detail.privateBanner")}
              </Text>
            </View>
          ) : null}

          {/* Meta chips */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {formattedDate ? (
              <InfoPill
                icon={<CalendarDays size={12} color={theme.colors.primary} />}
                label={formattedDate}
                bg={theme.colors.primaryBg}
                fg={theme.colors.primary}
              />
            ) : null}
            {formattedTime ? (
              <InfoPill
                icon={<Clock size={12} color={theme.colors.primary} />}
                label={formattedTime}
                bg={theme.colors.primaryBg}
                fg={theme.colors.primary}
              />
            ) : null}
            {playdate?.cityLabel || playdate?.location ? (
              <InfoPill
                icon={<MapPin size={12} color={theme.colors.secondary} />}
                label={playdate.cityLabel || playdate.location}
                bg={theme.colors.secondarySoft}
                fg={theme.colors.secondary}
              />
            ) : null}
            {distance > 0 ? (
              <InfoPill
                icon={<MapPin size={12} color={theme.colors.accent} />}
                label={formatDistance(distance)}
                bg={theme.colors.accent + "22"}
                fg={theme.colors.accent}
              />
            ) : null}
          </View>

          {/* Host */}
          {hostInfo ? (
            <View>
              <SectionLabel theme={theme} text={t("playdates.detail.host") as string} />
              <Pressable
                onPress={openHostProfile}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 14,
                  borderRadius: mobileTheme.radius.lg,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.9 : 1
                })}
              >
                <Avatar
                  uri={hostInfo.avatarUrl}
                  name={hostInfo.firstName || "?"}
                  size="lg"
                />
                <View style={{ flex: 1 }}>
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        color: theme.colors.ink,
                        fontFamily: "Inter_700Bold"
                      }}
                    >
                      {hostInfo.firstName || t("playdates.detail.host")}
                    </Text>
                    {hostInfo.isVerified ? (
                      <ShieldCheck size={14} color={theme.colors.secondary} />
                    ) : null}
                  </View>
                  <Text
                    style={{
                      marginTop: 2,
                      fontSize: 12,
                      color: theme.colors.muted,
                      fontFamily: "Inter_500Medium"
                    }}
                  >
                    {t("playdates.detail.viewProfile")}
                  </Text>
                </View>
                <ChevronRight size={18} color={theme.colors.muted} />
              </Pressable>
            </View>
          ) : null}

          {/* Attendees preview */}
          <View>
            <SectionLabel
              theme={theme}
              text={`${t("playdates.attendees")} · ${attendees.length}${
                maxPets ? ` / ${maxPets}` : ""
              }`}
            />
            <Pressable
              onPress={() => setAttendeeSheetOpen(true)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 14,
                borderRadius: mobileTheme.radius.lg,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.9 : 1
              })}
            >
              <AttendeeStack attendees={attendeesInfo} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.ink,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {attendees.length}{" "}
                  {attendees.length === 1
                    ? t("playdates.detail.attendeeSingular")
                    : t("playdates.detail.attendeePlural")}
                </Text>
                {maxPets > 0 ? (
                  <Text
                    style={{
                      marginTop: 2,
                      fontSize: 12,
                      color: theme.colors.muted,
                      fontFamily: "Inter_500Medium"
                    }}
                  >
                    {maxPets - attendees.length > 0
                      ? (t("playdates.detail.spotsLeft", {
                          count: maxPets - attendees.length
                        }) as string)
                      : (t("playdates.detail.full") as string)}
                  </Text>
                ) : null}
              </View>
              <ChevronRight size={18} color={theme.colors.muted} />
            </Pressable>
          </View>

          {/* About */}
          {playdate?.description ? (
            <View>
              <SectionLabel
                theme={theme}
                text={t("playdates.aboutSection") as string}
              />
              <View
                style={{
                  padding: 16,
                  borderRadius: mobileTheme.radius.lg,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border
                }}
              >
                <Text
                  style={{
                    color: theme.colors.ink,
                    fontSize: 15,
                    lineHeight: 22,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  {playdate.description}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Rules */}
          {rules.length > 0 ? (
            <View>
              <SectionLabel
                theme={theme}
                text={t("playdates.detail.rules") as string}
              />
              <View
                style={{
                  padding: 16,
                  borderRadius: mobileTheme.radius.lg,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  gap: 10
                }}
              >
                {rules.map((rule, idx) => (
                  <View
                    key={`rule-${idx}`}
                    style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: theme.colors.primaryBg,
                        alignItems: "center",
                        justifyContent: "center",
                        marginTop: 1
                      }}
                    >
                      <ListChecks size={12} color={theme.colors.primary} />
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        color: theme.colors.ink,
                        fontSize: 14,
                        lineHeight: 21,
                        fontFamily: "Inter_500Medium"
                      }}
                    >
                      {rule}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Weather */}
          {hasCoords ? (
            <View>
              <SectionLabel
                theme={theme}
                text={t("playdates.detail.weather") as string}
              />
              <WeatherWidget
                latitude={playdate!.latitude}
                longitude={playdate!.longitude}
                atISO={playdate!.date}
              />
            </View>
          ) : null}

          {/* Map + Directions */}
          {hasCoords ? (
            <View>
              <SectionLabel
                theme={theme}
                text={t("playdates.locationSection") as string}
              />
              <View
                style={{
                  height: 160,
                  borderRadius: mobileTheme.radius.lg,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: theme.colors.border
                }}
              >
                <MapView
                  style={{ flex: 1 }}
                  initialRegion={{
                    latitude: playdate!.latitude as number,
                    longitude: playdate!.longitude as number,
                    latitudeDelta: 0.015,
                    longitudeDelta: 0.015
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  toolbarEnabled={false}
                >
                  <Marker
                    coordinate={{
                      latitude: playdate!.latitude as number,
                      longitude: playdate!.longitude as number
                    }}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: theme.colors.primary,
                        borderWidth: 3,
                        borderColor: theme.colors.white
                      }}
                    >
                      <CalendarDays size={16} color={theme.colors.white} />
                    </View>
                  </Marker>
                </MapView>
              </View>
              <Pressable
                onPress={handleDirections}
                style={({ pressed }) => ({
                  marginTop: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 13,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: theme.colors.primaryBg,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.9 : 1
                })}
              >
                <Navigation size={15} color={theme.colors.primary} />
                <Text
                  style={{
                    color: theme.colors.primary,
                    fontSize: 14,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {t("playdates.detail.directions")}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Private-playdate host action: invite friends via user picker.
              Public playdates fall back to the share-sheet deep link. */}
          {!isCancelled && !isEnded ? (
            isOrganizer && isPrivate ? (
              <Pressable
                onPress={() => setInviteOpen(true)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 14,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: theme.colors.primaryBg,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.9 : 1
                })}
              >
                <UserPlus size={16} color={theme.colors.primary} />
                <Text
                  style={{
                    color: theme.colors.primary,
                    fontSize: 14,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {t("playdates.detail.inviteFriends")}
                </Text>
              </Pressable>
            ) : !isPrivate ? (
              <Pressable
                onPress={handleInvite}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 14,
                  borderRadius: mobileTheme.radius.pill,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.9 : 1
                })}
              >
                <UserPlus size={16} color={theme.colors.ink} />
                <Text
                  style={{
                    color: theme.colors.ink,
                    fontSize: 14,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {t("playdates.detail.invite")}
                </Text>
              </Pressable>
            ) : null
          ) : null}

          {/* Duplicate shortcut — pre-fills the wizard with this playdate. */}
          {playdate ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/(app)/playdates/create",
                  params: { templateJson: JSON.stringify(playdate) }
                } as any)
              }
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 12,
                opacity: pressed ? 0.8 : 1
              })}
            >
              <Copy size={14} color={theme.colors.muted} />
              <Text
                style={{
                  color: theme.colors.muted,
                  fontSize: 13,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {t("playdates.detail.duplicate")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky CTA bar */}
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
        <StickyCta
          theme={theme}
          t={t}
          isCancelled={isCancelled}
          isEnded={isEnded}
          isOrganizer={isOrganizer}
          isAttending={isAttending}
          isWaitlisted={isWaitlisted}
          isFull={isFull}
          hasPendingInvite={hasPendingInvite}
          joinPending={false}
          leavePending={leaveMutation.isPending}
          cancelPending={cancelMutation.isPending}
          acceptPending={acceptMutation.isPending}
          declinePending={declineMutation.isPending}
          onJoin={() => setJoinOpen(true)}
          onEditPets={() => setEditPetsOpen(true)}
          onLeave={confirmLeave}
          onViewChat={openChat}
          onHostTools={() => setHostToolsOpen(true)}
          onAcceptInvite={() => myInviteId && acceptMutation.mutate(myInviteId)}
          onDeclineInvite={() => myInviteId && declineMutation.mutate(myInviteId)}
        />
      </View>

      {/* Attendee sheet */}
      <Modal
        visible={attendeeSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAttendeeSheetOpen(false)}
      >
        <Pressable
          onPress={() => setAttendeeSheetOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(22,21,20,0.45)",
            justifyContent: "flex-end"
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingTop: 14,
              paddingBottom: insets.bottom + 20,
              maxHeight: "82%"
            }}
          >
            <View
              style={{
                width: 44,
                height: 5,
                borderRadius: 3,
                backgroundColor: theme.colors.border,
                alignSelf: "center",
                marginBottom: 12
              }}
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 22,
                marginBottom: 12
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontSize: 18,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {t("playdates.attendees")}
              </Text>
              <Pressable
                onPress={() => setAttendeeSheetOpen(false)}
                hitSlop={10}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.colors.background,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <X size={16} color={theme.colors.muted} />
              </Pressable>
            </View>

            {isAttending || isOrganizer ? (
              <FlatList
                data={attendeesInfo}
                keyExtractor={(item) => item.userId}
                contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 8, gap: 10 }}
                ListEmptyComponent={() => (
                  <Text
                    style={{
                      color: theme.colors.muted,
                      fontSize: 14,
                      textAlign: "center",
                      paddingVertical: 30,
                      fontFamily: "Inter_500Medium"
                    }}
                  >
                    {t("playdates.detail.emptyAttendees")}
                  </Text>
                )}
                renderItem={({ item }) => {
                  const canRemove =
                    isOrganizer && item.userId !== playdate?.organizerId;
                  return (
                    <Pressable
                      onPress={() => router.push(`/user/${item.userId}` as any)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        padding: 12,
                        borderRadius: mobileTheme.radius.lg,
                        backgroundColor: theme.colors.background
                      }}
                    >
                      <Avatar uri={item.avatarUrl} name={item.firstName || "?"} size="md" />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 14,
                            color: theme.colors.ink,
                            fontFamily: "Inter_700Bold"
                          }}
                        >
                          {item.firstName}
                        </Text>
                        {item.pets && item.pets.length > 0 ? (
                          <Text
                            numberOfLines={1}
                            style={{
                              marginTop: 2,
                              fontSize: 12,
                              color: theme.colors.muted,
                              fontFamily: "Inter_500Medium"
                            }}
                          >
                            {item.pets.map((p) => p.name).join(" · ")}
                          </Text>
                        ) : null}
                      </View>
                      {canRemove ? (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation?.();
                            confirmKick(item.userId, item.firstName || "");
                          }}
                          hitSlop={10}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            backgroundColor: theme.colors.dangerBg,
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          <Trash2 size={15} color={theme.colors.danger} />
                        </Pressable>
                      ) : null}
                    </Pressable>
                  );
                }}
              />
            ) : (
              <View style={{ paddingHorizontal: 22, paddingVertical: 30, alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: theme.colors.primaryBg,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Lock size={26} color={theme.colors.primary} />
                </View>
                <Text
                  style={{
                    fontSize: 16,
                    color: theme.colors.ink,
                    fontFamily: "Inter_700Bold",
                    textAlign: "center"
                  }}
                >
                  {t("playdates.detail.lockedAttendeesTitle")}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.colors.muted,
                    fontFamily: "Inter_500Medium",
                    textAlign: "center",
                    lineHeight: 19
                  }}
                >
                  {t("playdates.detail.lockedAttendeesBody")}
                </Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Join flow (non-attendees) */}
      {playdate ? (
        <JoinPlaydateModal
          visible={joinOpen}
          onClose={() => setJoinOpen(false)}
          playdate={playdate}
          mode="join"
          onJoined={(res) => {
            if (res.waitlisted) {
              Alert.alert(
                t("playdates.detail.waitlistAddedTitle") as string,
                t("playdates.detail.waitlistAddedBody") as string
              );
            }
            invalidate();
          }}
        />
      ) : null}

      {/* Edit pet list (attendees) */}
      {playdate && isAttending ? (
        <JoinPlaydateModal
          visible={editPetsOpen}
          onClose={() => setEditPetsOpen(false)}
          playdate={playdate}
          mode="edit"
          onEdited={invalidate}
        />
      ) : null}

      {/* Edit modal (host only) */}
      {isOrganizer && playdate ? (
        <CreatePlaydateModal
          visible={editOpen}
          onClose={() => setEditOpen(false)}
          mode="edit"
          initialValue={playdate}
        />
      ) : null}

      {/* Host Tools sheet (host only) — consolidated control panel */}
      {isOrganizer && playdate ? (
        <HostToolsSheet
          visible={hostToolsOpen}
          onClose={() => setHostToolsOpen(false)}
          playdate={playdate}
          onAction={(action) => {
            switch (action) {
              case "edit":
                setEditOpen(true);
                break;
              case "announce":
                setAnnounceOpen(true);
                break;
              case "invite":
                setInviteOpen(true);
                break;
              case "cancel":
                confirmCancel();
                break;
              // "lock" and "transfer" are handled inside the sheet itself.
              default:
                break;
            }
          }}
        />
      ) : null}

      {/* Invite people — available to host for both public and private
          playdates now. For public ones the list is still matches-only. */}
      {isOrganizer && playdate ? (
        <InvitePeopleModal
          visible={inviteOpen}
          onClose={() => setInviteOpen(false)}
          playdateId={playdate.id}
          playdateTitle={playdate.title}
          onInvited={(count) => {
            if (count > 0) {
              Alert.alert(
                t("playdates.invites.successTitle") as string,
                t("playdates.invites.successBody", { count }) as string
              );
            }
          }}
        />
      ) : null}

      {/* Announce modal (host only) */}
      <Modal
        visible={announceOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAnnounceOpen(false)}
      >
        <Pressable
          onPress={() => setAnnounceOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(22,21,20,0.45)",
            justifyContent: "flex-end"
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingTop: 14,
              paddingBottom: insets.bottom + 20,
              paddingHorizontal: 22,
              gap: 14
            }}
          >
            <View
              style={{
                width: 44,
                height: 5,
                borderRadius: 3,
                backgroundColor: theme.colors.border,
                alignSelf: "center"
              }}
            />
            <Text
              style={{
                fontSize: 18,
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold"
              }}
            >
              {t("playdates.detail.announce")}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium",
                lineHeight: 19
              }}
            >
              {t("playdates.detail.announceHint")}
            </Text>
            <TextInput
              value={announceText}
              onChangeText={setAnnounceText}
              placeholder={t("playdates.detail.announcePlaceholder") as string}
              placeholderTextColor={theme.colors.muted}
              multiline
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                paddingHorizontal: 14,
                paddingVertical: 14,
                minHeight: 110,
                fontSize: 15,
                color: theme.colors.ink,
                fontFamily: "Inter_500Medium",
                textAlignVertical: "top"
              }}
            />
            <Pressable
              onPress={() => announceMutation.mutate()}
              disabled={!announceText.trim() || announceMutation.isPending}
              style={({ pressed }) => ({
                paddingVertical: 14,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: announceText.trim()
                  ? theme.colors.primary
                  : theme.colors.border,
                alignItems: "center",
                opacity: pressed ? 0.88 : 1,
                ...mobileTheme.shadow.sm
              })}
            >
              {announceMutation.isPending ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Text
                  style={{
                    color: theme.colors.white,
                    fontSize: 15,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {t("playdates.detail.send")}
                </Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Sticky CTA state machine ─────────────────────────────────────────
function StickyCta(props: {
  theme: ReturnType<typeof useTheme>;
  t: (key: string, opts?: any) => string;
  isCancelled: boolean;
  isEnded: boolean;
  isOrganizer: boolean;
  isAttending: boolean;
  isWaitlisted: boolean;
  isFull: boolean;
  hasPendingInvite: boolean;
  joinPending: boolean;
  leavePending: boolean;
  cancelPending: boolean;
  acceptPending: boolean;
  declinePending: boolean;
  onJoin: () => void;
  onEditPets: () => void;
  onLeave: () => void;
  onViewChat: () => void;
  onHostTools: () => void;
  onAcceptInvite: () => void;
  onDeclineInvite: () => void;
}) {
  const {
    theme,
    t,
    isCancelled,
    isEnded,
    isOrganizer,
    isAttending,
    isWaitlisted,
    isFull,
    hasPendingInvite,
    joinPending,
    leavePending,
    acceptPending,
    declinePending,
    onJoin,
    onEditPets,
    onLeave,
    onViewChat,
    onHostTools,
    onAcceptInvite,
    onDeclineInvite
  } = props;

  if (isCancelled) {
    return (
      <DisabledPill
        theme={theme}
        label={t("playdates.detail.cancelled") as string}
      />
    );
  }
  if (isEnded) {
    return (
      <DisabledPill
        theme={theme}
        label={t("playdates.detail.ended") as string}
      />
    );
  }
  if (isOrganizer) {
    return (
      <View style={{ flexDirection: "row", gap: 10 }}>
        <PrimaryPill
          theme={theme}
          label={t("playdates.detail.viewChat") as string}
          icon={<MessageCircle size={16} color={theme.colors.white} />}
          onPress={onViewChat}
          flex={1.5}
        />
        <GhostButton
          theme={theme}
          label={t("playdates.hostTools.ctaLabel") as string}
          icon={<Crown size={15} color={theme.colors.primary} />}
          onPress={onHostTools}
          flex={1}
        />
      </View>
    );
  }
  if (isAttending) {
    return (
      <View style={{ flexDirection: "row", gap: 8 }}>
        <PrimaryPill
          theme={theme}
          label={t("playdates.detail.viewChat") as string}
          icon={<MessageCircle size={16} color={theme.colors.white} />}
          onPress={onViewChat}
          flex={1.5}
        />
        <GhostButton
          theme={theme}
          label={t("playdates.detail.editPets") as string}
          icon={<PawPrint size={14} color={theme.colors.primary} />}
          onPress={onEditPets}
          flex={1}
        />
        <GhostButton
          theme={theme}
          label={t("playdates.detail.leave") as string}
          icon={<LogOut size={14} color={theme.colors.muted} />}
          onPress={onLeave}
          loading={leavePending}
          flex={1}
        />
      </View>
    );
  }
  if (hasPendingInvite && !isAttending) {
    return (
      <View style={{ flexDirection: "row", gap: 10 }}>
        <PrimaryPill
          theme={theme}
          label={t("playdates.detail.acceptInvite") as string}
          icon={<Check size={16} color={theme.colors.white} strokeWidth={2.8} />}
          onPress={onAcceptInvite}
          loading={acceptPending}
          flex={1.4}
        />
        <GhostButton
          theme={theme}
          label={t("playdates.detail.declineInvite") as string}
          icon={<X size={14} color={theme.colors.muted} />}
          onPress={onDeclineInvite}
          loading={declinePending}
          flex={1}
        />
      </View>
    );
  }
  if (isWaitlisted) {
    return (
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View
          style={{
            flex: 1.4,
            paddingVertical: 16,
            borderRadius: mobileTheme.radius.pill,
            backgroundColor: theme.colors.secondarySoft,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8
          }}
        >
          <Check size={16} color={theme.colors.secondary} strokeWidth={2.6} />
          <Text
            style={{
              color: theme.colors.secondary,
              fontFamily: "Inter_700Bold",
              fontSize: 14
            }}
          >
            {t("playdates.detail.onWaitlist")}
          </Text>
        </View>
        <GhostButton
          theme={theme}
          label={t("playdates.detail.leave") as string}
          icon={<LogOut size={15} color={theme.colors.muted} />}
          onPress={onLeave}
          loading={leavePending}
          flex={1}
        />
      </View>
    );
  }
  if (isFull) {
    return (
      <PrimaryPill
        theme={theme}
        label={t("playdates.detail.joinWaitlist") as string}
        icon={<Clock size={16} color={theme.colors.white} />}
        onPress={onJoin}
        loading={joinPending}
      />
    );
  }
  return (
    <PrimaryPill
      theme={theme}
      label={t("playdates.detail.joinNow") as string}
      onPress={onJoin}
      loading={joinPending}
    />
  );
}

function PrimaryPill({
  theme,
  label,
  icon,
  onPress,
  loading,
  flex
}: {
  theme: ReturnType<typeof useTheme>;
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  loading?: boolean;
  flex?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => ({
        flex: flex ?? undefined,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 16,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: theme.colors.primary,
        opacity: pressed ? 0.9 : 1,
        ...mobileTheme.shadow.sm
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.colors.white} />
      ) : (
        <>
          {icon}
          <Text
            style={{
              color: theme.colors.white,
              fontFamily: "Inter_700Bold",
              fontSize: 15
            }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function GhostButton({
  theme,
  label,
  icon,
  onPress,
  destructive,
  loading,
  flex
}: {
  theme: ReturnType<typeof useTheme>;
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  destructive?: boolean;
  loading?: boolean;
  flex?: number;
}) {
  const fg = destructive ? theme.colors.danger : theme.colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => ({
        flex: flex ?? undefined,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 15,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.85 : 1
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon}
          <Text
            style={{
              color: fg,
              fontFamily: "Inter_700Bold",
              fontSize: 13
            }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function DisabledPill({
  theme,
  label
}: {
  theme: ReturnType<typeof useTheme>;
  label: string;
}) {
  return (
    <View
      style={{
        paddingVertical: 16,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: theme.colors.border,
        alignItems: "center"
      }}
    >
      <Text
        style={{
          color: theme.colors.muted,
          fontFamily: "Inter_700Bold",
          fontSize: 14
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function AttendeeStack({
  attendees
}: {
  attendees: { userId: string; firstName: string; avatarUrl?: string }[];
}) {
  const theme = useTheme();
  const shown = attendees.slice(0, 5);
  const extra = Math.max(0, attendees.length - shown.length);
  if (shown.length === 0) {
    return (
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: theme.colors.secondarySoft,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Users size={20} color={theme.colors.secondary} />
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row" }}>
      {shown.map((a, idx) => (
        <View
          key={a.userId}
          style={{
            marginLeft: idx === 0 ? 0 : -12,
            borderRadius: 22,
            borderWidth: 2,
            borderColor: theme.colors.surface
          }}
        >
          <Avatar uri={a.avatarUrl} name={a.firstName || "?"} size="md" />
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={{
            marginLeft: -12,
            width: 44,
            height: 44,
            borderRadius: 22,
            borderWidth: 2,
            borderColor: theme.colors.surface,
            backgroundColor: theme.colors.primaryBg,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Text
            style={{
              color: theme.colors.primary,
              fontSize: 12,
              fontFamily: "Inter_700Bold"
            }}
          >
            +{extra}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function StateBanner({
  tone,
  text
}: {
  tone: "danger" | "warning" | "neutral";
  text: string;
}) {
  const theme = useTheme();
  const palette = {
    danger: {
      bg: theme.colors.danger + "18",
      fg: theme.colors.danger
    },
    warning: {
      bg: theme.colors.accent + "22",
      fg: theme.colors.accent
    },
    neutral: {
      bg: theme.colors.border,
      fg: theme.colors.muted
    }
  }[tone];
  return (
    <View
      style={{
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: mobileTheme.radius.md,
        backgroundColor: palette.bg
      }}
    >
      <Text
        style={{
          color: palette.fg,
          fontSize: 13,
          fontFamily: "Inter_700Bold",
          letterSpacing: 0.2
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function InfoPill({
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
          fontSize: 11,
          fontFamily: "Inter_700Bold"
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function SectionLabel({
  theme,
  text
}: {
  theme: ReturnType<typeof useTheme>;
  text: string;
}) {
  return (
    <Text
      style={{
        fontSize: 11,
        letterSpacing: 1,
        color: theme.colors.muted,
        fontFamily: "Inter_700Bold",
        textTransform: "uppercase",
        marginBottom: 10
      }}
    >
      {text}
    </Text>
  );
}
