import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { Playdate } from "@petto/contracts";
import {
  Calendar,
  CalendarDays,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Crown,
  LogOut,
  MapPin,
  MessageCircle,
  Navigation,
  UserCheck,
  Users,
  X
} from "lucide-react-native";

import {
  cancelPlaydate,
  leavePlaydate,
  listMyPlaydates
} from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import { Avatar } from "@/components/avatar";
import { CreatePlaydateWizard } from "@/components/playdates/create-playdate-wizard";
import { computePlaydateState } from "@/lib/playdate-state";

type Tab = "upcoming" | "past";

export default function MyPlaydatesPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const token = session?.tokens.accessToken ?? "";

  const [tab, setTab] = useState<Tab>("upcoming");
  const [hostedOnly, setHostedOnly] = useState(false);
  const [repeatTemplate, setRepeatTemplate] = useState<Playdate | null>(null);

  const queryKey = useMemo(
    () => ["my-playdates", tab, hostedOnly ? "hosted" : "all"] as const,
    [tab, hostedOnly]
  );

  const playdatesQuery = useQuery({
    queryKey,
    queryFn: () =>
      listMyPlaydates(token, {
        when: tab,
        role: hostedOnly ? "hosted" : "all"
      }),
    enabled: Boolean(token)
  });

  // Refetch every time the screen regains focus so leave/cancel mutations
  // made inside the detail page show up when the user swipes back here.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["my-playdates"] });
    }, [queryClient])
  );

  const leaveMutation = useMutation({
    mutationFn: (id: string) => leavePlaydate(token, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-playdates"] });
    }
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelPlaydate(token, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-playdates"] });
    }
  });

  const rows = playdatesQuery.data ?? [];

  const openDetail = (playdate: Playdate) => {
    router.push({
      pathname: "/(app)/playdates/[id]",
      params: {
        id: playdate.id,
        initialTitle: playdate.title,
        initialImage: playdate.coverImageUrl ?? ""
      }
    } as any);
  };

  const openChat = (playdate: Playdate) => {
    const convId = playdate.conversationId;
    if (!convId) return;
    router.push(`/conversation/${convId}` as any);
  };

  const openDirections = (playdate: Playdate) => {
    if (!playdate.latitude || !playdate.longitude) return;
    const label = encodeURIComponent(playdate.title || "Playdate");
    const url = Platform.select({
      ios: `maps://?daddr=${playdate.latitude},${playdate.longitude}&q=${label}`,
      android: `google.navigation:q=${playdate.latitude},${playdate.longitude}`,
      default: `https://maps.google.com/?q=${playdate.latitude},${playdate.longitude}`
    })!;
    Linking.openURL(url).catch(() => {
      Linking.openURL(
        `https://maps.google.com/?q=${playdate.latitude},${playdate.longitude}`
      ).catch(() => undefined);
    });
  };

  const confirmLeave = (playdate: Playdate) => {
    Alert.alert(
      t("playdates.detail.confirmLeaveTitle") as string,
      t("playdates.detail.confirmLeaveBody") as string,
      [
        { text: t("common.cancel") as string, style: "cancel" },
        {
          text: t("playdates.detail.leave") as string,
          style: "destructive",
          onPress: () => leaveMutation.mutate(playdate.id)
        }
      ]
    );
  };

  const confirmCancel = (playdate: Playdate) => {
    Alert.alert(
      t("playdates.detail.confirmCancelTitle") as string,
      t("playdates.detail.confirmCancelBody") as string,
      [
        { text: t("common.back") as string, style: "cancel" },
        {
          text: t("playdates.detail.cancel") as string,
          style: "destructive",
          onPress: () => cancelMutation.mutate(playdate.id)
        }
      ]
    );
  };

  const renderCard = ({ item }: { item: Playdate }) => {
    const when = item.date ? new Date(item.date) : null;
    const isToday = when
      ? new Date().toDateString() === when.toDateString()
      : false;
    const dateLabel =
      when && !isNaN(when.getTime())
        ? when.toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short"
          })
        : "";
    const timeLabel =
      when && !isNaN(when.getTime())
        ? when.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit"
          })
        : "";
    const stateInfo = computePlaydateState(item);
    const isHost = stateInfo.isHost;
    const isAttendee = Boolean(item.isAttending);
    const isCancelled = stateInfo.isCancelled;
    const slotsUsed = stateInfo.slotsUsed;
    const previewAttendees = (item.attendeesInfo ?? []).slice(0, 4);

    return (
      <Pressable
        onPress={() => openDetail(item)}
        style={({ pressed }) => ({
          marginBottom: 14,
          padding: 16,
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.94 : 1,
          ...mobileTheme.shadow.sm
        })}
      >
        {/* Top row: cover image + title + role badge */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: theme.colors.primaryBg,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {item.coverImageUrl ? (
              <Image
                source={{ uri: item.coverImageUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                transition={250}
              />
            ) : (
              <CalendarDays size={24} color={theme.colors.primary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap"
              }}
            >
              <RoleBadge
                theme={theme}
                t={t}
                variant={isHost ? "host" : "joined"}
              />
              {isToday && !isCancelled ? (
                <TodayBadge theme={theme} t={t} />
              ) : null}
              {isCancelled ? <CancelledBadge theme={theme} t={t} /> : null}
            </View>
            <Text
              numberOfLines={2}
              style={{
                marginTop: 6,
                fontSize: 16,
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold",
                lineHeight: 21
              }}
            >
              {item.title}
            </Text>
          </View>
          <ChevronRight size={18} color={theme.colors.muted} />
        </View>

        {/* Meta row */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
            marginTop: 12,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border
          }}
        >
          {dateLabel ? (
            <MetaPill
              theme={theme}
              icon={<CalendarDays size={12} color={theme.colors.primary} />}
              label={`${dateLabel} · ${timeLabel}`}
            />
          ) : null}
          {item.cityLabel || item.location ? (
            <MetaPill
              theme={theme}
              icon={<MapPin size={12} color={theme.colors.secondary} />}
              label={(item.cityLabel || item.location) as string}
              tone="secondary"
            />
          ) : null}
        </View>

        {/* Attendees preview */}
        {slotsUsed > 0 ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginTop: 12
            }}
          >
            <AttendeeStack attendees={previewAttendees} />
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}
            >
              {tab === "past"
                ? (t("playdates.myPlaydates.attendedCount", {
                    count: slotsUsed
                  }) as string)
                : item.maxPets
                ? `${slotsUsed} / ${item.maxPets}`
                : `${slotsUsed}`}
            </Text>
          </View>
        ) : null}

        {/* Quick actions */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 14
          }}
        >
          {tab === "upcoming" ? (
            <>
              {stateInfo.canChat ? (
                <QuickAction
                  theme={theme}
                  icon={<MessageCircle size={13} color={theme.colors.primary} />}
                  label={t("playdates.detail.viewChat") as string}
                  onPress={() => openChat(item)}
                />
              ) : null}
              {item.latitude && item.longitude && !isCancelled ? (
                <QuickAction
                  theme={theme}
                  icon={<Navigation size={13} color={theme.colors.primary} />}
                  label={t("playdates.detail.directions") as string}
                  onPress={() => openDirections(item)}
                />
              ) : null}
              {stateInfo.canCancel ? (
                <QuickAction
                  theme={theme}
                  icon={<X size={13} color={theme.colors.danger} />}
                  label={t("playdates.detail.cancel") as string}
                  onPress={() => confirmCancel(item)}
                  destructive
                />
              ) : null}
              {stateInfo.canLeave && !isHost && isAttendee ? (
                <QuickAction
                  theme={theme}
                  icon={<LogOut size={13} color={theme.colors.muted} />}
                  label={t("playdates.detail.leave") as string}
                  onPress={() => confirmLeave(item)}
                />
              ) : null}
            </>
          ) : (
            <QuickAction
              theme={theme}
              icon={<Copy size={13} color={theme.colors.primary} />}
              label={t("playdates.myPlaydates.repeat") as string}
              onPress={() => setRepeatTemplate(item)}
            />
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View
        style={{
          backgroundColor: theme.colors.white,
          paddingBottom: 14,
          ...mobileTheme.shadow.sm
        }}
      >
        <View
          style={{
            paddingTop: insets.top + 12,
            paddingBottom: 10,
            paddingHorizontal: 20,
            flexDirection: "row",
            alignItems: "center",
            gap: 12
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: theme.colors.background,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <ChevronLeft size={20} color={theme.colors.ink} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              fontSize: 22,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            {t("playdates.myPlaydates.title")}
          </Text>
        </View>

        {/* Tab switcher */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 20,
            gap: 8
          }}
        >
          <TabPill
            theme={theme}
            label={t("playdates.myPlaydates.upcomingTab") as string}
            icon={<Calendar size={14} color={tab === "upcoming" ? theme.colors.white : theme.colors.ink} />}
            active={tab === "upcoming"}
            onPress={() => setTab("upcoming")}
          />
          <TabPill
            theme={theme}
            label={t("playdates.myPlaydates.pastTab") as string}
            icon={<Clock size={14} color={tab === "past" ? theme.colors.white : theme.colors.ink} />}
            active={tab === "past"}
            onPress={() => setTab("past")}
          />
        </View>

        {/* Role filter chip */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 20,
            marginTop: 10
          }}
        >
          <Pressable
            onPress={() => setHostedOnly((v) => !v)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: hostedOnly
                ? theme.colors.primaryBg
                : theme.colors.background,
              borderWidth: 1,
              borderColor: hostedOnly ? theme.colors.primary : theme.colors.border,
              opacity: pressed ? 0.85 : 1
            })}
          >
            <Crown
              size={12}
              color={hostedOnly ? theme.colors.primary : theme.colors.muted}
            />
            <Text
              style={{
                fontSize: 11,
                color: hostedOnly ? theme.colors.primary : theme.colors.muted,
                fontFamily: "Inter_700Bold",
                letterSpacing: 0.2
              }}
            >
              {t("playdates.myPlaydates.hostedByMe")}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Body */}
      {playdatesQuery.isLoading ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      ) : playdatesQuery.isError ? (
        <ErrorState
          theme={theme}
          message={t("playdates.errorLoading") as string}
          onRetry={() => playdatesQuery.refetch()}
          retryLabel={t("common.retry") as string}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          theme={theme}
          tab={tab}
          hostedOnly={hostedOnly}
          onDiscover={() => router.push("/(app)/playdates" as any)}
          t={t}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: insets.bottom + 32
          }}
          refreshControl={
            <RefreshControl
              refreshing={playdatesQuery.isFetching}
              onRefresh={() => playdatesQuery.refetch()}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}

      {/* Repeat wizard — pre-fills with the selected past playdate */}
      {repeatTemplate ? (
        <CreatePlaydateWizard
          visible={Boolean(repeatTemplate)}
          onClose={() => setRepeatTemplate(null)}
          template={repeatTemplate}
        />
      ) : null}
    </View>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────

function TabPill({
  theme,
  label,
  icon,
  active,
  onPress
}: {
  theme: ReturnType<typeof useTheme>;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: active ? theme.colors.primary : theme.colors.background,
        opacity: pressed ? 0.88 : 1,
        ...(active ? mobileTheme.shadow.sm : {})
      })}
    >
      {icon}
      <Text
        style={{
          fontSize: 13,
          color: active ? theme.colors.white : theme.colors.ink,
          fontFamily: "Inter_700Bold"
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function RoleBadge({
  theme,
  t,
  variant
}: {
  theme: ReturnType<typeof useTheme>;
  t: (k: string) => string;
  variant: "host" | "joined";
}) {
  const isHost = variant === "host";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: isHost ? theme.colors.primary : theme.colors.secondarySoft
      }}
    >
      {isHost ? (
        <Crown size={10} color={theme.colors.white} strokeWidth={2.6} />
      ) : (
        <UserCheck size={10} color={theme.colors.secondary} strokeWidth={2.6} />
      )}
      <Text
        style={{
          fontSize: 10,
          letterSpacing: 0.3,
          color: isHost ? theme.colors.white : theme.colors.secondary,
          fontFamily: "Inter_700Bold",
          textTransform: "uppercase"
        }}
      >
        {isHost
          ? t("playdates.myPlaydates.roleHost")
          : t("playdates.myPlaydates.roleJoined")}
      </Text>
    </View>
  );
}

function TodayBadge({
  theme,
  t
}: {
  theme: ReturnType<typeof useTheme>;
  t: (k: string) => string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: theme.colors.accent + "22"
      }}
    >
      <Text
        style={{
          fontSize: 10,
          letterSpacing: 0.3,
          color: theme.colors.accent,
          fontFamily: "Inter_700Bold",
          textTransform: "uppercase"
        }}
      >
        {t("playdates.myPlaydates.today")}
      </Text>
    </View>
  );
}

function CancelledBadge({
  theme,
  t
}: {
  theme: ReturnType<typeof useTheme>;
  t: (k: string) => string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: theme.colors.dangerBg
      }}
    >
      <Text
        style={{
          fontSize: 10,
          letterSpacing: 0.3,
          color: theme.colors.danger,
          fontFamily: "Inter_700Bold",
          textTransform: "uppercase"
        }}
      >
        {t("playdates.detail.cancelled")}
      </Text>
    </View>
  );
}

function MetaPill({
  theme,
  icon,
  label,
  tone = "primary"
}: {
  theme: ReturnType<typeof useTheme>;
  icon: React.ReactNode;
  label: string;
  tone?: "primary" | "secondary";
}) {
  const bg = tone === "primary" ? theme.colors.primaryBg : theme.colors.secondarySoft;
  const fg = tone === "primary" ? theme.colors.primary : theme.colors.secondary;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: bg
      }}
    >
      {icon}
      <Text
        style={{
          fontSize: 11,
          color: fg,
          fontFamily: "Inter_700Bold"
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
  if (attendees.length === 0) {
    return (
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: theme.colors.secondarySoft,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Users size={14} color={theme.colors.secondary} />
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row" }}>
      {attendees.map((a, idx) => (
        <View
          key={a.userId}
          style={{
            marginLeft: idx === 0 ? 0 : -8,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: theme.colors.surface
          }}
        >
          <Avatar uri={a.avatarUrl} name={a.firstName || "?"} size="sm" />
        </View>
      ))}
    </View>
  );
}

function QuickAction({
  theme,
  icon,
  label,
  onPress,
  destructive
}: {
  theme: ReturnType<typeof useTheme>;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: destructive ? theme.colors.danger + "44" : theme.colors.border,
        opacity: pressed ? 0.86 : 1
      })}
    >
      {icon}
      <Text
        style={{
          fontSize: 11,
          color: destructive ? theme.colors.danger : theme.colors.ink,
          fontFamily: "Inter_700Bold"
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyState({
  theme,
  tab,
  hostedOnly,
  onDiscover,
  t
}: {
  theme: ReturnType<typeof useTheme>;
  tab: Tab;
  hostedOnly: boolean;
  onDiscover: () => void;
  t: (k: string, opts?: any) => string;
}) {
  const Icon = tab === "past" ? CalendarOff : CalendarDays;
  const title =
    tab === "past"
      ? (t("playdates.myPlaydates.emptyPastTitle") as string)
      : (t("playdates.myPlaydates.emptyUpcomingTitle") as string);
  const body =
    tab === "past"
      ? (t("playdates.myPlaydates.emptyPastBody") as string)
      : hostedOnly
      ? (t("playdates.myPlaydates.emptyHostedBody") as string)
      : (t("playdates.myPlaydates.emptyUpcomingBody") as string);
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 30,
        gap: 14
      }}
    >
      <View
        style={{
          width: 84,
          height: 84,
          borderRadius: 42,
          backgroundColor: theme.colors.primaryBg,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Icon size={34} color={theme.colors.primary} />
      </View>
      <Text
        style={{
          fontSize: 17,
          color: theme.colors.ink,
          fontFamily: "Inter_700Bold",
          textAlign: "center"
        }}
      >
        {title}
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
        {body}
      </Text>
      {tab === "upcoming" ? (
        <Pressable
          onPress={onDiscover}
          style={({ pressed }) => ({
            marginTop: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: mobileTheme.radius.pill,
            backgroundColor: theme.colors.primary,
            opacity: pressed ? 0.88 : 1,
            ...mobileTheme.shadow.sm
          })}
        >
          <Text
            style={{
              color: theme.colors.white,
              fontSize: 14,
              fontFamily: "Inter_700Bold"
            }}
          >
            {t("playdates.myPlaydates.discoverCta")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ErrorState({
  theme,
  message,
  onRetry,
  retryLabel
}: {
  theme: ReturnType<typeof useTheme>;
  message: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 30,
        gap: 14
      }}
    >
      <Text
        style={{
          fontSize: 14,
          color: theme.colors.muted,
          fontFamily: "Inter_500Medium",
          textAlign: "center"
        }}
      >
        {message}
      </Text>
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => ({
          paddingHorizontal: 20,
          paddingVertical: 11,
          borderRadius: mobileTheme.radius.pill,
          backgroundColor: theme.colors.primaryBg,
          opacity: pressed ? 0.85 : 1
        })}
      >
        <Text
          style={{
            color: theme.colors.primary,
            fontSize: 13,
            fontFamily: "Inter_700Bold"
          }}
        >
          {retryLabel}
        </Text>
      </Pressable>
    </View>
  );
}
