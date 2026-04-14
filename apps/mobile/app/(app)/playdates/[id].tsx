import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Text,
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
  Clock,
  MapPin,
  Share2,
  Users,
  X
} from "lucide-react-native";

import { getPlaydate, joinPlaydate } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import { formatDistance } from "@/lib/distance";

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

  const joinMutation = useMutation({
    mutationFn: () => joinPlaydate(token, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playdates"] });
      refetch();
    }
  });

  const [imgError, setImgError] = useState(false);

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
      ? when.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit"
        })
      : "";

  const attendees = playdate?.attendees ?? [];
  const maxPets = playdate?.maxPets ?? 0;
  const distance = playdate?.distance ?? 0;
  const isAttending = Boolean(playdate?.isAttending);
  const isFull = maxPets > 0 && attendees.length >= maxPets;

  const handleShare = async () => {
    if (!playdate) return;
    try {
      await Share.share({
        message: `Join "${playdate.title}" on Petto 🐾`
      });
    } catch {
      // user cancelled
    }
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

  const hasCoords =
    playdate?.latitude != null &&
    playdate?.longitude != null &&
    (playdate?.latitude !== 0 || playdate?.longitude !== 0);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* Hero cover */}
        <View
          style={{
            width: "100%",
            height: 260,
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
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
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
              height: 70
            }}
            pointerEvents="none"
          />

          {/* Floating top action bar */}
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
              style={({ pressed }) => [
                glassBtnStyle,
                { opacity: pressed ? 0.8 : 1 }
              ]}
            >
              <ChevronLeft size={22} color={theme.colors.ink} strokeWidth={2.4} />
            </Pressable>
            <Pressable
              onPress={handleShare}
              hitSlop={10}
              style={({ pressed }) => [
                glassBtnStyle,
                { opacity: pressed ? 0.8 : 1 }
              ]}
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
            paddingTop: 20,
            backgroundColor: theme.colors.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            gap: 18
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

          {/* Description */}
          {playdate?.description ? (
            <View>
              <SectionLabel theme={theme} text={t("playdates.aboutSection") as string} />
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

          {/* Map snippet */}
          {hasCoords ? (
            <View>
              <SectionLabel theme={theme} text={t("playdates.locationSection") as string} />
              <View
                style={{
                  height: 140,
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
            </View>
          ) : null}

          {/* Attendees */}
          <View>
            <SectionLabel
              theme={theme}
              text={`${t("playdates.attendees")} · ${attendees.length}${maxPets ? ` / ${maxPets}` : ""}`}
            />
            <View
              style={{
                padding: 16,
                borderRadius: mobileTheme.radius.lg,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
                flexDirection: "row",
                alignItems: "center",
                gap: 12
              }}
            >
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
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.ink,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {attendees.length}{" "}
                  {attendees.length === 1 ? "attendee" : "attendees"}
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
                      ? `${maxPets - attendees.length} spots left`
                      : "Event is full"}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Join button */}
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
        {isAttending ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 16,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: theme.colors.secondarySoft
            }}
          >
            <Check size={18} color={theme.colors.secondary} strokeWidth={2.5} />
            <Text
              style={{
                color: theme.colors.secondary,
                fontFamily: "Inter_700Bold",
                fontSize: 15
              }}
            >
              {t("playdates.joined")}
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => joinMutation.mutate()}
            disabled={joinMutation.isPending || isFull}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 16,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: isFull
                ? theme.colors.border
                : theme.colors.primary,
              opacity: pressed ? 0.88 : 1,
              ...mobileTheme.shadow.sm
            })}
          >
            {joinMutation.isPending ? (
              <ActivityIndicator size="small" color={theme.colors.white} />
            ) : (
              <Text
                style={{
                  color: isFull ? theme.colors.muted : theme.colors.white,
                  fontFamily: "Inter_700Bold",
                  fontSize: 15
                }}
              >
                {isFull
                  ? (t("playdates.full") as string)
                  : (t("playdates.joinNow") as string)}
              </Text>
            )}
          </Pressable>
        )}
      </View>
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
