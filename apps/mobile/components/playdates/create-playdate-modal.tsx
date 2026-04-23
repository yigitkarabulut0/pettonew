import DateTimePicker from "@react-native-community/datetimepicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import type { Playdate } from "@petto/contracts";
import { DraggableSheet } from "@/components/draggable-sheet";
import {
  CalendarDays,
  ListChecks,
  MapPin,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  X
} from "lucide-react-native";

import { createPlaydate, listExploreVenues, updatePlaydate } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

type CreatePlaydateModalProps = {
  visible: boolean;
  onClose: () => void;
  userLocation?: { latitude: number; longitude: number } | null;
  /** When "edit" is set, initialValue must be supplied. Defaults to "create". */
  mode?: "create" | "edit";
  initialValue?: Playdate | null;
};

export function CreatePlaydateModal({
  visible,
  onClose,
  userLocation,
  mode = "create",
  initialValue = null
}: CreatePlaydateModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const token = session?.tokens.accessToken ?? "";
  const isEdit = mode === "edit" && initialValue != null;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date(Date.now() + 3600_000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [maxPetsValue, setMaxPetsValue] = useState(10);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [rules, setRules] = useState<string[]>([]);
  // When editing, we keep the original venue info even if it's not in the
  // venue list (e.g. custom location).
  const [editLocation, setEditLocation] = useState({
    name: "",
    lat: 0,
    lng: 0,
    city: "",
    cover: ""
  });

  // Hydrate form whenever the modal opens in edit mode.
  useEffect(() => {
    if (!visible) return;
    if (isEdit && initialValue) {
      setTitle(initialValue.title ?? "");
      setDescription(initialValue.description ?? "");
      const d = new Date(initialValue.date);
      setSelectedDate(isNaN(d.getTime()) ? new Date(Date.now() + 3600_000) : d);
      setMaxPetsValue(initialValue.maxPets || 10);
      setSelectedVenueId(null);
      setRules(initialValue.rules ?? []);
      setEditLocation({
        name: initialValue.location ?? "",
        lat: initialValue.latitude ?? 0,
        lng: initialValue.longitude ?? 0,
        city: initialValue.cityLabel ?? "",
        cover: initialValue.coverImageUrl ?? ""
      });
    } else if (!isEdit) {
      setTitle("");
      setDescription("");
      setSelectedDate(new Date(Date.now() + 3600_000));
      setMaxPetsValue(10);
      setSelectedVenueId(null);
      setRules([]);
      setEditLocation({ name: "", lat: 0, lng: 0, city: "", cover: "" });
    }
  }, [visible, isEdit, initialValue]);

  const venuesQuery = useQuery({
    queryKey: ["venues-for-playdate"],
    queryFn: () => listExploreVenues(token),
    enabled: Boolean(token && visible)
  });
  const venues = venuesQuery.data ?? [];
  const selectedVenue =
    venues.find((v) => v.id === selectedVenueId) ?? null;

  const resolvedLocationName =
    selectedVenue?.name ?? (isEdit ? editLocation.name : "");
  const resolvedLat =
    selectedVenue?.latitude ??
    (isEdit ? editLocation.lat : userLocation?.latitude ?? 0);
  const resolvedLng =
    selectedVenue?.longitude ??
    (isEdit ? editLocation.lng : userLocation?.longitude ?? 0);
  const resolvedCity = selectedVenue?.cityLabel ?? (isEdit ? editLocation.city : "");
  const resolvedCover = selectedVenue?.imageUrl ?? (isEdit ? editLocation.cover : "");

  const reset = () => {
    setTitle("");
    setDescription("");
    setSelectedDate(new Date(Date.now() + 3600_000));
    setMaxPetsValue(10);
    setSelectedVenueId(null);
    setRules([]);
    setEditLocation({ name: "", lat: 0, lng: 0, city: "", cover: "" });
  };

  const trimmedRules = () => rules.map((r) => r.trim()).filter((r) => r.length > 0);

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
        coverImageUrl: resolvedCover,
        rules: trimmedRules()
      } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playdates"] });
      queryClient.invalidateQueries({ queryKey: ["my-playdates"] });
      reset();
      onClose();
    }
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!initialValue) throw new Error("no initial value");
      return updatePlaydate(token, initialValue.id, {
        title: title.trim(),
        description: description.trim(),
        date: selectedDate.toISOString(),
        location: resolvedLocationName,
        maxPets: maxPetsValue,
        latitude: resolvedLat,
        longitude: resolvedLng,
        cityLabel: resolvedCity,
        coverImageUrl: resolvedCover,
        rules: trimmedRules()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playdates"] });
      queryClient.invalidateQueries({ queryKey: ["my-playdates"] });
      if (initialValue) {
        queryClient.invalidateQueries({ queryKey: ["playdate-detail", initialValue.id] });
      }
      onClose();
    }
  });

  const activeMutation = isEdit ? updateMutation : createMutation;
  const submitLabel = isEdit
    ? (t("playdates.detail.edit") as string)
    : (t("playdates.createPlaydate") as string);
  const headerLabel = isEdit
    ? (t("playdates.detail.edit") as string)
    : (t("playdates.newPlaydate") as string);

  return (
    <DraggableSheet
      visible={visible}
      onClose={onClose}
      initialSnap="large"
      snapPoints={{ medium: 0.7, large: 0.95 }}
    >
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: 4 }}>
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
              {headerLabel}
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

              {/* Rules editor */}
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <ListChecks size={13} color={theme.colors.muted} />
                  <Text
                    style={{
                      fontSize: 11,
                      letterSpacing: 1,
                      color: theme.colors.muted,
                      fontFamily: "Inter_700Bold",
                      textTransform: "uppercase"
                    }}
                  >
                    {t("playdates.detail.rules")}
                  </Text>
                </View>
                {rules.map((rule, idx) => (
                  <View
                    key={`rule-${idx}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8
                    }}
                  >
                    <TextInput
                      value={rule}
                      onChangeText={(txt) =>
                        setRules((prev) => {
                          const next = [...prev];
                          next[idx] = txt;
                          return next;
                        })
                      }
                      placeholder={t("playdates.detail.rulePlaceholder") as string}
                      placeholderTextColor={theme.colors.muted}
                      style={{
                        flex: 1,
                        backgroundColor: theme.colors.background,
                        borderRadius: mobileTheme.radius.md,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        fontSize: 14,
                        color: theme.colors.ink,
                        fontFamily: "Inter_500Medium"
                      }}
                    />
                    <Pressable
                      onPress={() =>
                        setRules((prev) => prev.filter((_, i) => i !== idx))
                      }
                      hitSlop={8}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: theme.colors.background,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Trash2 size={15} color={theme.colors.muted} />
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  onPress={() => setRules((prev) => [...prev, ""])}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 11,
                    borderRadius: mobileTheme.radius.md,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderStyle: "dashed"
                  }}
                >
                  <Plus size={14} color={theme.colors.primary} />
                  <Text
                    style={{
                      fontSize: 13,
                      color: theme.colors.primary,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    {t("playdates.detail.addRule")}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => activeMutation.mutate()}
                disabled={!title.trim() || activeMutation.isPending}
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
                {activeMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: 15,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    {submitLabel}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </View>
    </DraggableSheet>
  );
}
