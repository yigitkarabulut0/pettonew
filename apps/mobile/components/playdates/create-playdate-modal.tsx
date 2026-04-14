import DateTimePicker from "@react-native-community/datetimepicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  MapPin,
  Minus,
  Plus,
  Sparkles,
  X
} from "lucide-react-native";

import { createPlaydate, listExploreVenues } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

type CreatePlaydateModalProps = {
  visible: boolean;
  onClose: () => void;
  userLocation?: { latitude: number; longitude: number } | null;
};

export function CreatePlaydateModal({
  visible,
  onClose,
  userLocation
}: CreatePlaydateModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const token = session?.tokens.accessToken ?? "";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date(Date.now() + 3600_000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [maxPetsValue, setMaxPetsValue] = useState(10);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const venuesQuery = useQuery({
    queryKey: ["venues-for-playdate"],
    queryFn: () => listExploreVenues(token),
    enabled: Boolean(token && visible)
  });
  const venues = venuesQuery.data ?? [];
  const selectedVenue =
    venues.find((v) => v.id === selectedVenueId) ?? null;

  const resolvedLocationName =
    selectedVenue?.name ?? "";
  const resolvedLat =
    selectedVenue?.latitude ?? userLocation?.latitude ?? 0;
  const resolvedLng =
    selectedVenue?.longitude ?? userLocation?.longitude ?? 0;
  const resolvedCity = selectedVenue?.cityLabel ?? "";
  const resolvedCover = selectedVenue?.imageUrl ?? "";

  const reset = () => {
    setTitle("");
    setDescription("");
    setSelectedDate(new Date(Date.now() + 3600_000));
    setMaxPetsValue(10);
    setSelectedVenueId(null);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createPlaydate(token, {
        title: title.trim(),
        description: description.trim(),
        date: selectedDate.toISOString(),
        location: resolvedLocationName,
        maxPets: maxPetsValue,
        latitude: resolvedLat,
        longitude: resolvedLng,
        cityLabel: resolvedCity,
        coverImageUrl: resolvedCover
      } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playdates"] });
      reset();
      onClose();
    }
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
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
            paddingBottom: insets.bottom + 24,
            maxHeight: "92%"
          }}
        >
          <View
            style={{
              width: 44,
              height: 5,
              borderRadius: 3,
              backgroundColor: theme.colors.border,
              alignSelf: "center",
              marginBottom: 14
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 22,
              marginBottom: 14
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 20,
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold"
              }}
            >
              {t("playdates.newPlaydate")}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: theme.colors.background,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <X size={18} color={theme.colors.muted} />
            </Pressable>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: 22,
                paddingBottom: 16,
                gap: 14
              }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t("playdates.titlePlaceholder") as string}
                placeholderTextColor={theme.colors.muted}
                style={{
                  backgroundColor: theme.colors.background,
                  borderRadius: mobileTheme.radius.md,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  fontSize: 15,
                  color: theme.colors.ink,
                  fontFamily: "Inter_500Medium"
                }}
              />

              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={t("playdates.descriptionPlaceholder") as string}
                placeholderTextColor={theme.colors.muted}
                multiline
                style={{
                  backgroundColor: theme.colors.background,
                  borderRadius: mobileTheme.radius.md,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  minHeight: 90,
                  fontSize: 15,
                  color: theme.colors.ink,
                  fontFamily: "Inter_500Medium",
                  textAlignVertical: "top"
                }}
              />

              {/* Date/time */}
              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: theme.colors.background,
                  borderRadius: mobileTheme.radius.md,
                  paddingHorizontal: 14,
                  paddingVertical: 14
                }}
              >
                <CalendarDays size={18} color={theme.colors.primary} />
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.ink,
                    fontFamily: "Inter_600SemiBold"
                  }}
                >
                  {selectedDate.toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short"
                  })}
                  {" · "}
                  {selectedDate.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </Text>
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="datetime"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  minimumDate={new Date()}
                  onChange={(_e, d) => {
                    setShowDatePicker(Platform.OS === "ios");
                    if (d) setSelectedDate(d);
                  }}
                />
              )}

              {/* Venue picker */}
              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    fontSize: 11,
                    letterSpacing: 1,
                    color: theme.colors.muted,
                    fontFamily: "Inter_700Bold",
                    textTransform: "uppercase"
                  }}
                >
                  {t("playdates.venue")}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10, paddingRight: 8 }}
                >
                  {venues.slice(0, 30).map((venue) => {
                    const active = selectedVenueId === venue.id;
                    return (
                      <Pressable
                        key={venue.id}
                        onPress={() =>
                          setSelectedVenueId((cur) =>
                            cur === venue.id ? null : venue.id
                          )
                        }
                        style={{
                          width: 128,
                          borderRadius: mobileTheme.radius.md,
                          borderWidth: 2,
                          borderColor: active
                            ? theme.colors.primary
                            : theme.colors.border,
                          overflow: "hidden",
                          backgroundColor: theme.colors.background
                        }}
                      >
                        {venue.imageUrl ? (
                          <Image
                            source={{ uri: venue.imageUrl }}
                            style={{
                              width: "100%",
                              height: 68,
                              backgroundColor: theme.colors.primaryBg
                            }}
                            contentFit="cover"
                            transition={250}
                          />
                        ) : (
                          <View
                            style={{
                              width: "100%",
                              height: 68,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: theme.colors.primaryBg
                            }}
                          >
                            <Sparkles size={20} color={theme.colors.primary} />
                          </View>
                        )}
                        <View style={{ padding: 8 }}>
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: 12,
                              color: theme.colors.ink,
                              fontFamily: "Inter_700Bold"
                            }}
                          >
                            {venue.name}
                          </Text>
                          {venue.cityLabel ? (
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 3,
                                marginTop: 2
                              }}
                            >
                              <MapPin size={9} color={theme.colors.muted} />
                              <Text
                                numberOfLines={1}
                                style={{
                                  fontSize: 10,
                                  color: theme.colors.muted,
                                  fontFamily: "Inter_500Medium"
                                }}
                              >
                                {venue.cityLabel}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Max pets */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: theme.colors.background,
                  borderRadius: mobileTheme.radius.md,
                  paddingHorizontal: 14,
                  paddingVertical: 12
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.ink,
                    fontFamily: "Inter_600SemiBold"
                  }}
                >
                  {t("playdates.maxPets")}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12
                  }}
                >
                  <Pressable
                    onPress={() =>
                      setMaxPetsValue((prev) => Math.max(1, prev - 1))
                    }
                    disabled={maxPetsValue <= 1}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor:
                        maxPetsValue <= 1
                          ? theme.colors.border
                          : theme.colors.primaryBg,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Minus
                      size={14}
                      color={
                        maxPetsValue <= 1
                          ? theme.colors.muted
                          : theme.colors.primary
                      }
                    />
                  </Pressable>
                  <Text
                    style={{
                      fontSize: 16,
                      minWidth: 26,
                      textAlign: "center",
                      color: theme.colors.ink,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    {maxPetsValue}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setMaxPetsValue((prev) => Math.min(20, prev + 1))
                    }
                    disabled={maxPetsValue >= 20}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor:
                        maxPetsValue >= 20
                          ? theme.colors.border
                          : theme.colors.primaryBg,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Plus
                      size={14}
                      color={
                        maxPetsValue >= 20
                          ? theme.colors.muted
                          : theme.colors.primary
                      }
                    />
                  </Pressable>
                </View>
              </View>

              <Pressable
                onPress={() => createMutation.mutate()}
                disabled={!title.trim() || createMutation.isPending}
                style={({ pressed }) => ({
                  marginTop: 6,
                  paddingVertical: 15,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: title.trim()
                    ? theme.colors.primary
                    : theme.colors.border,
                  alignItems: "center",
                  opacity: pressed ? 0.88 : 1,
                  ...mobileTheme.shadow.sm
                })}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: 15,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    {t("playdates.createPlaydate")}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
