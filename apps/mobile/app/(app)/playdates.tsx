import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { useState, useCallback } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CalendarDays, MapPin, Minus, Plus, Users } from "lucide-react-native";

import { listPlaydates, createPlaydate, joinPlaydate, listExploreVenues } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function PlaydatesPage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();

  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [location, setLocation] = useState("");
  const [maxPetsValue, setMaxPetsValue] = useState(10);

  const token = session?.tokens.accessToken ?? "";

  const venuesQuery = useQuery({
    queryKey: ["venues-for-playdate"],
    queryFn: () => listExploreVenues(token),
    enabled: Boolean(token)
  });
  const venues = venuesQuery.data ?? [];

  const playdatesQuery = useQuery({
    queryKey: ["playdates"],
    queryFn: () => listPlaydates(token),
    enabled: Boolean(token)
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createPlaydate(token, {
        title: title.trim(),
        description: description.trim(),
        date: selectedDate.toISOString(),
        location: location.trim(),
        maxPets: maxPetsValue
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playdates"] });
      setTitle("");
      setDescription("");
      setSelectedDate(new Date());
      setLocation("");
      setMaxPetsValue(10);
      setComposerOpen(false);
    }
  });

  const joinMutation = useMutation({
    mutationFn: (playdateId: string) => joinPlaydate(token, playdateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playdates"] });
    }
  });

  const onRefresh = useCallback(() => {
    playdatesQuery.refetch();
  }, [playdatesQuery]);

  const playdates = playdatesQuery.data ?? [];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.lg,
          paddingHorizontal: mobileTheme.spacing.xl,
          backgroundColor: theme.colors.white,
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border
        }}
      >
        <Pressable
          onPress={() => router.back()}
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
          <ArrowLeft size={18} color={theme.colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: mobileTheme.typography.subheading.fontSize,
              fontWeight: mobileTheme.typography.subheading.fontWeight,
              color: theme.colors.ink
            }}
          >
            Playdates
          </Text>
        </View>
        <Pressable
          onPress={() => setComposerOpen(!composerOpen)}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.colors.primaryBg,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Plus size={18} color={theme.colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingTop: mobileTheme.spacing.xl,
          paddingBottom: insets.bottom + 24
        }}
        refreshControl={
          <RefreshControl
            refreshing={playdatesQuery.isRefetching}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Composer */}
        {composerOpen && (
          <View
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              padding: mobileTheme.spacing.xl,
              marginBottom: mobileTheme.spacing.xl,
              gap: mobileTheme.spacing.lg,
              ...mobileTheme.shadow.sm
            }}
          >
            <Text
              style={{
                fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
                color: theme.colors.ink
              }}
            >
              New Playdate
            </Text>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor={theme.colors.muted}
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink
              }}
            />

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description"
              placeholderTextColor={theme.colors.muted}
              multiline
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                minHeight: 80,
                fontSize: mobileTheme.typography.body.fontSize,
                color: theme.colors.ink,
                textAlignVertical: "top"
              }}
            />

            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: mobileTheme.radius.md,
                padding: mobileTheme.spacing.lg,
                flexDirection: "row",
                alignItems: "center",
                gap: mobileTheme.spacing.sm
              }}
            >
              <CalendarDays size={16} color={theme.colors.muted} />
              <Text
                style={{
                  fontSize: mobileTheme.typography.body.fontSize,
                  color: theme.colors.ink
                }}
              >
                {selectedDate.toLocaleDateString()} {selectedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="datetime"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={new Date()}
                onChange={(_event, date) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (date) setSelectedDate(date);
                }}
              />
            )}

            <View style={{ gap: mobileTheme.spacing.sm }}>
              <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.muted }}>
                Venue
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: mobileTheme.spacing.sm }}
              >
                {venues.map((venue) => (
                  <Pressable
                    key={venue.id}
                    onPress={() => setLocation(venue.name)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: mobileTheme.radius.pill,
                      backgroundColor: location === venue.name ? theme.colors.primaryBg : theme.colors.background,
                      borderWidth: 1,
                      borderColor: location === venue.name ? theme.colors.primary : theme.colors.border
                    }}
                  >
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.caption.fontSize,
                        fontWeight: location === venue.name ? "600" : "400",
                        color: location === venue.name ? theme.colors.primary : theme.colors.ink
                      }}
                      numberOfLines={1}
                    >
                      {venue.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              {location ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MapPin size={14} color={theme.colors.primary} />
                  <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.primary, fontWeight: "600" }}>
                    {location}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={{ gap: mobileTheme.spacing.sm }}>
              <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.muted }}>
                Max Pets
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: mobileTheme.spacing.md,
                  backgroundColor: theme.colors.background,
                  borderRadius: mobileTheme.radius.md,
                  padding: mobileTheme.spacing.sm,
                  alignSelf: "flex-start"
                }}
              >
                <Pressable
                  onPress={() => setMaxPetsValue((prev) => Math.max(1, prev - 1))}
                  disabled={maxPetsValue <= 1}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: maxPetsValue <= 1 ? theme.colors.border : theme.colors.primaryBg,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Minus size={16} color={maxPetsValue <= 1 ? theme.colors.muted : theme.colors.primary} />
                </Pressable>
                <Text
                  style={{
                    fontSize: mobileTheme.typography.subheading.fontSize,
                    fontWeight: "700",
                    color: theme.colors.ink,
                    minWidth: 30,
                    textAlign: "center"
                  }}
                >
                  {maxPetsValue}
                </Text>
                <Pressable
                  onPress={() => setMaxPetsValue((prev) => Math.min(20, prev + 1))}
                  disabled={maxPetsValue >= 20}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: maxPetsValue >= 20 ? theme.colors.border : theme.colors.primaryBg,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Plus size={16} color={maxPetsValue >= 20 ? theme.colors.muted : theme.colors.primary} />
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={() => createMutation.mutate()}
              disabled={!title.trim() || createMutation.isPending}
              style={{
                backgroundColor: title.trim() ? theme.colors.primary : theme.colors.border,
                borderRadius: mobileTheme.radius.md,
                paddingVertical: mobileTheme.spacing.md,
                alignItems: "center"
              }}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: mobileTheme.typography.body.fontSize }}>
                  Create Playdate
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Loading */}
        {playdatesQuery.isLoading && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        )}

        {/* Empty */}
        {!playdatesQuery.isLoading && playdates.length === 0 && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center", gap: mobileTheme.spacing.lg }}>
            <CalendarDays size={48} color={theme.colors.muted} />
            <Text style={{ fontSize: mobileTheme.typography.subheading.fontSize, fontWeight: mobileTheme.typography.subheading.fontWeight, color: theme.colors.ink }}>
              No playdates yet
            </Text>
            <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.muted, textAlign: "center", paddingHorizontal: mobileTheme.spacing["3xl"] }}>
              Tap the + button to organize a playdate for your pets.
            </Text>
          </View>
        )}

        {/* Playdates */}
        {playdates.map((playdate) => (
          <View
            key={playdate.id}
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              padding: mobileTheme.spacing.xl,
              marginBottom: mobileTheme.spacing.md,
              gap: mobileTheme.spacing.sm,
              ...mobileTheme.shadow.sm
            }}
          >
            <Text style={{ fontSize: mobileTheme.typography.bodySemiBold.fontSize, fontWeight: "600", color: theme.colors.ink }}>
              {playdate.title}
            </Text>
            {playdate.description ? (
              <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.muted, lineHeight: mobileTheme.typography.body.lineHeight }}>
                {playdate.description}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <CalendarDays size={14} color={theme.colors.muted} />
              <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.muted }}>
                {new Date(playdate.date).toLocaleDateString()}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <MapPin size={14} color={theme.colors.muted} />
              <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.muted }}>
                {playdate.location}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Users size={14} color={theme.colors.secondary} />
                <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.secondary }}>
                  {playdate.attendees.length} / {playdate.maxPets} attending
                </Text>
              </View>
              <Pressable
                onPress={() => joinMutation.mutate(playdate.id)}
                disabled={joinMutation.isPending}
                style={{
                  backgroundColor: theme.colors.primaryBg,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: mobileTheme.radius.md
                }}
              >
                <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontWeight: "600", color: theme.colors.primary }}>
                  Join
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
