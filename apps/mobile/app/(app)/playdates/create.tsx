import DateTimePicker from "@react-native-community/datetimepicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { ExploreVenue, Pet, Playdate } from "@petto/contracts";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Clock,
  Globe,
  ListChecks,
  Lock,
  MapPin,
  Minus,
  PawPrint,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X
} from "lucide-react-native";

import * as ImagePicker from "expo-image-picker";

import {
  createPlaydate,
  listExploreVenues,
  listMyPets,
  uploadMedia
} from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

type Step = 1 | 2 | 3;

export default function CreatePlaydatePage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const token = session?.tokens.accessToken ?? "";

  const { lat, lng, templateJson } = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    templateJson?: string;
  }>();

  const userLocation = useMemo(() => {
    const latitude = lat ? parseFloat(lat) : NaN;
    const longitude = lng ? parseFloat(lng) : NaN;
    if (!isNaN(latitude) && !isNaN(longitude) && (latitude !== 0 || longitude !== 0)) {
      return { latitude, longitude };
    }
    return null;
  }, [lat, lng]);

  const template: Playdate | null = useMemo(() => {
    if (!templateJson) return null;
    try {
      return JSON.parse(templateJson) as Playdate;
    } catch {
      return null;
    }
  }, [templateJson]);

  const [step, setStep] = useState<Step>(1);
  // Step 1
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  // Step 2
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(
    () => new Date(Date.now() + 2 * 60 * 60 * 1000)
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [maxPets, setMaxPets] = useState(5);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [venueSearch, setVenueSearch] = useState("");
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  // v0.11.0 — optional user-uploaded cover photo. Falls back to the venue
  // imageUrl if the user doesn't pick one, so existing behavior is preserved.
  const [customCoverUrl, setCustomCoverUrl] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  // Progress is tracked but not rendered — the existing spinner-over-preview
  // UI at CoverPicker (see below) already covers this case. We still pass
  // onProgress so uploadMedia reports back, which keeps retry heuristics in
  // sync if we ever surface it in the UI later.
  const [, setCoverProgress] = useState<number | undefined>(undefined);

  // Fetch user's pets for step 1.
  const petsQuery = useQuery({
    queryKey: ["my-pets"],
    queryFn: () => listMyPets(token),
    enabled: Boolean(token)
  });
  const pets = useMemo(
    () => (petsQuery.data ?? []).filter((p) => !p.isHidden),
    [petsQuery.data]
  );

  // Fetch venues for step 2 venue picker.
  const venuesQuery = useQuery({
    queryKey: ["venues-for-playdate"],
    queryFn: () =>
      listExploreVenues(token, userLocation?.latitude, userLocation?.longitude),
    enabled: Boolean(token && step === 2)
  });
  const venues = venuesQuery.data ?? [];
  const filteredVenues = useMemo(() => {
    const q = venueSearch.trim().toLowerCase();
    if (!q) return venues.slice(0, 40);
    return venues
      .filter((v) => {
        const name = (v.name ?? "").toLowerCase();
        const city = (v.cityLabel ?? "").toLowerCase();
        return name.includes(q) || city.includes(q);
      })
      .slice(0, 40);
  }, [venues, venueSearch]);
  const selectedVenue =
    venues.find((v) => v.id === selectedVenueId) ?? null;

  const titleTemplates = useMemo(
    () => [
      t("playdates.wizard.templatePark"),
      t("playdates.wizard.templateMorning"),
      t("playdates.wizard.templateBeach"),
      t("playdates.wizard.templateTraining"),
      t("playdates.wizard.templateMeetup")
    ],
    [t]
  );

  // Hydrate from template on mount (for duplicate flow).
  useEffect(() => {
    setStep(1);
    setDateError(null);
    setCustomCoverUrl(null);
    setCoverUploading(false);
    if (template) {
      setTitle(template.title ?? "");
      setDescription(template.description ?? "");
      setRules(template.rules ?? []);
      setMaxPets(template.maxPets || 5);
      setVisibility(template.visibility ?? "public");
      // Date is the one field we intentionally reset — duplicating means a
      // fresh future date, not the original moment in the past.
      setSelectedDate(new Date(Date.now() + 2 * 60 * 60 * 1000));
      setVenueSearch("");
      setSelectedVenueId(null);
      setSelectedPetIds(template.myPetIds ?? []);
      setCustomCoverUrl(template.coverImageUrl ?? null);
    } else {
      setTitle("");
      setDescription("");
      setRules([]);
      setMaxPets(5);
      setVisibility("public");
      setSelectedDate(new Date(Date.now() + 2 * 60 * 60 * 1000));
      setVenueSearch("");
      setSelectedVenueId(null);
      setSelectedPetIds([]);
    }
  }, [template]);

  // v0.11.0 — pick + upload a custom cover photo. The uploaded R2 URL is
  // stored in `customCoverUrl` and takes precedence over the venue image
  // when the playdate is submitted.
  const pickCoverImage = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.9
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setCoverUploading(true);
      setCoverProgress(0);
      const asset = result.assets[0];
      const fileName = `playdate-cover-${Date.now()}.jpg`;
      const uploaded = await uploadMedia(
        token,
        asset.uri,
        fileName,
        asset.mimeType ?? undefined,
        { onProgress: (ratio) => setCoverProgress(ratio) }
      );
      setCustomCoverUrl(uploaded.url);
    } catch (err) {
      // Swallow — the user sees the loading spinner disappear and can retry.
    } finally {
      setCoverUploading(false);
      setCoverProgress(undefined);
    }
  }, [token]);

  // Validation
  const minLeadTime = 60 * 60 * 1000; // +1 hour
  const dateIsValid = selectedDate.getTime() - Date.now() >= minLeadTime;
  const step1Valid = selectedPetIds.length > 0;
  const step2Valid =
    title.trim().length > 0 &&
    dateIsValid &&
    (selectedVenue != null || venueSearch.trim().length > 0);

  const togglePet = (petId: string) => {
    setSelectedPetIds((prev) =>
      prev.includes(petId) ? prev.filter((id) => id !== petId) : [...prev, petId]
    );
  };

  // Resolve final location fields from the selected venue (or a custom text).
  const resolvedVenueName = selectedVenue?.name ?? venueSearch.trim();
  const resolvedLat = selectedVenue?.latitude ?? userLocation?.latitude ?? 0;
  const resolvedLng = selectedVenue?.longitude ?? userLocation?.longitude ?? 0;
  const resolvedCity = selectedVenue?.cityLabel ?? "";
  // v0.11.4 — venue photo fallback removed; only user-uploaded covers.
  const resolvedCover = customCoverUrl ?? "";

  const createMutation = useMutation({
    mutationFn: () =>
      createPlaydate(token, {
        title: title.trim(),
        description: description.trim(),
        date: selectedDate.toISOString(),
        location: resolvedVenueName,
        maxPets,
        latitude: resolvedLat,
        longitude: resolvedLng,
        cityLabel: resolvedCity,
        // v0.11.1 — pass the selected venue id so Discover can highlight
        // the corresponding pin on the map.
        venueId: selectedVenue?.id,
        coverImageUrl: resolvedCover,
        rules: rules.map((r) => r.trim()).filter((r) => r.length > 0),
        visibility,
        creatorPetIds: selectedPetIds
      } as any),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["playdates"] });
      queryClient.invalidateQueries({ queryKey: ["my-playdates"] });
      router.back();
      if (created?.id) {
        router.push({
          pathname: "/(app)/playdates/[id]",
          params: {
            id: created.id,
            initialTitle: created.title,
            initialImage: created.coverImageUrl ?? ""
          }
        } as any);
      }
    }
  });

  const goNext = () => {
    if (step === 1 && step1Valid) setStep(2);
    else if (step === 2 && step2Valid) {
      if (!dateIsValid) {
        setDateError(t("playdates.wizard.dateTooSoon") as string);
        return;
      }
      setStep(3);
    }
  };
  const goBack = () => {
    if (step === 1) {
      router.back();
    } else if (step === 2) {
      setStep(1);
    } else if (step === 3) {
      setStep(2);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header row: back + title + close */}
        <View
          style={{
            paddingTop: insets.top + 10,
            paddingHorizontal: 22,
            paddingBottom: 10,
            backgroundColor: theme.colors.surface
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginBottom: 10
            }}
          >
            {step > 1 ? (
              <Pressable
                onPress={goBack}
                hitSlop={10}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: theme.colors.background,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <ChevronLeft size={18} color={theme.colors.ink} strokeWidth={2.4} />
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 11,
                  letterSpacing: 1,
                  color: theme.colors.muted,
                  fontFamily: "Inter_700Bold",
                  textTransform: "uppercase"
                }}
              >
                {t("playdates.wizard.stepOf", { step, total: 3 })}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 20,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {step === 1
                  ? t("playdates.wizard.step1Title")
                  : step === 2
                  ? t("playdates.wizard.step2Title")
                  : t("playdates.wizard.step3Title")}
              </Text>
            </View>
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
              <X size={18} color={theme.colors.muted} />
            </Pressable>
          </View>

          {/* Progress indicator */}
          <View
            style={{
              flexDirection: "row",
              gap: 6
            }}
          >
            {[1, 2, 3].map((s) => (
              <View
                key={s}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor:
                    s <= step ? theme.colors.primary : theme.colors.border
                }}
              />
            ))}
          </View>
        </View>

        {/* Step content */}
        <View style={{ flex: 1 }}>
          {step === 1 ? (
            <Step1Pets
              pets={pets}
              loading={petsQuery.isLoading}
              selectedIds={selectedPetIds}
              onToggle={togglePet}
              onAddPet={() => {
                router.back();
                router.push("/onboarding/pets" as any);
              }}
            />
          ) : step === 2 ? (
            <Step2Details
              theme={theme}
              t={t}
              title={title}
              onTitleChange={setTitle}
              titleTemplates={titleTemplates}
              description={description}
              onDescriptionChange={setDescription}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              showDatePicker={showDatePicker}
              setShowDatePicker={setShowDatePicker}
              dateError={dateError}
              setDateError={setDateError}
              dateIsValid={dateIsValid}
              maxPets={maxPets}
              setMaxPets={setMaxPets}
              visibility={visibility}
              setVisibility={setVisibility}
              venueSearch={venueSearch}
              setVenueSearch={setVenueSearch}
              filteredVenues={filteredVenues}
              venuesLoading={venuesQuery.isLoading}
              selectedVenueId={selectedVenueId}
              setSelectedVenueId={setSelectedVenueId}
              rules={rules}
              setRules={setRules}
              customCoverUrl={customCoverUrl}
              coverUploading={coverUploading}
              onPickCover={pickCoverImage}
            />
          ) : (
            <Step3Review
              theme={theme}
              t={t}
              pets={pets.filter((p) => selectedPetIds.includes(p.id))}
              title={title}
              description={description}
              selectedDate={selectedDate}
              venueName={resolvedVenueName}
              cityLabel={resolvedCity}
              maxPets={maxPets}
              visibility={visibility}
              rules={rules}
              onEditStep={(s) => setStep(s)}
            />
          )}
        </View>

        {/* Sticky CTA */}
        <View
          style={{
            paddingHorizontal: 22,
            paddingTop: 12,
            paddingBottom: insets.bottom + 20
          }}
        >
          {step < 3 ? (
            <Pressable
              onPress={goNext}
              disabled={
                (step === 1 && !step1Valid) || (step === 2 && !step2Valid)
              }
              style={({ pressed }) => ({
                paddingVertical: 15,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor:
                  (step === 1 && step1Valid) || (step === 2 && step2Valid)
                    ? theme.colors.primary
                    : theme.colors.border,
                alignItems: "center",
                opacity: pressed ? 0.88 : 1,
                ...mobileTheme.shadow.sm
              })}
            >
              <Text
                style={{
                  color:
                    (step === 1 && step1Valid) || (step === 2 && step2Valid)
                      ? theme.colors.white
                      : theme.colors.muted,
                  fontSize: 15,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {t("playdates.wizard.next")}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              style={({ pressed }) => ({
                paddingVertical: 15,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: theme.colors.primary,
                alignItems: "center",
                opacity: pressed ? 0.88 : 1,
                ...mobileTheme.shadow.sm
              })}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Text
                  style={{
                    color: theme.colors.white,
                    fontSize: 15,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {t("playdates.wizard.createCta")}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Step 1 — Select pets ────────────────────────────────────────────
function Step1Pets({
  pets,
  loading,
  selectedIds,
  onToggle,
  onAddPet
}: {
  pets: Pet[];
  loading: boolean;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onAddPet: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (loading) {
    return (
      <View style={{ paddingVertical: 40, alignItems: "center" }}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
  }

  if (pets.length === 0) {
    return (
      <View
        style={{
          paddingHorizontal: 22,
          paddingVertical: 30,
          alignItems: "center",
          gap: 14
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: theme.colors.primaryBg,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <PawPrint size={30} color={theme.colors.primary} />
        </View>
        <Text
          style={{
            fontSize: 16,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold",
            textAlign: "center"
          }}
        >
          {t("playdates.detail.noPetsTitle")}
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: theme.colors.muted,
            fontFamily: "Inter_500Medium",
            textAlign: "center",
            lineHeight: 19,
            paddingHorizontal: 20
          }}
        >
          {t("playdates.detail.noPetsBody")}
        </Text>
        <Pressable
          onPress={onAddPet}
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
          <Plus size={15} color={theme.colors.white} strokeWidth={2.6} />
          <Text
            style={{
              color: theme.colors.white,
              fontSize: 14,
              fontFamily: "Inter_700Bold"
            }}
          >
            {t("playdates.detail.addPet")}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 22,
        paddingBottom: 8,
        gap: 10
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {pets.map((pet) => {
        const selected = selectedIds.includes(pet.id);
        const photo = pet.photos?.[0]?.url;
        return (
          <Pressable
            key={pet.id}
            onPress={() => onToggle(pet.id)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: selected
                ? theme.colors.primaryBg
                : theme.colors.background,
              borderWidth: 2,
              borderColor: selected ? theme.colors.primary : "transparent",
              opacity: pressed ? 0.92 : 1
            })}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                overflow: "hidden",
                backgroundColor: theme.colors.primaryBg,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {photo ? (
                <Image
                  source={{ uri: photo }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                  transition={250}
                />
              ) : (
                <PawPrint size={22} color={theme.colors.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {pet.name}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium"
                }}
                numberOfLines={1}
              >
                {pet.breedLabel || pet.speciesLabel || " "}
              </Text>
            </View>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                borderWidth: 2,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                backgroundColor: selected ? theme.colors.primary : "transparent",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {selected ? (
                <Check size={14} color={theme.colors.white} strokeWidth={3} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Step 2 — Details form ───────────────────────────────────────────
function Step2Details(props: {
  theme: ReturnType<typeof useTheme>;
  t: (key: string, opts?: any) => string;
  title: string;
  onTitleChange: (v: string) => void;
  titleTemplates: string[];
  description: string;
  onDescriptionChange: (v: string) => void;
  selectedDate: Date;
  setSelectedDate: (d: Date) => void;
  showDatePicker: boolean;
  setShowDatePicker: (v: boolean) => void;
  dateError: string | null;
  setDateError: (e: string | null) => void;
  dateIsValid: boolean;
  maxPets: number;
  setMaxPets: (n: number) => void;
  visibility: "public" | "private";
  setVisibility: (v: "public" | "private") => void;
  venueSearch: string;
  setVenueSearch: (v: string) => void;
  filteredVenues: ExploreVenue[];
  venuesLoading: boolean;
  selectedVenueId: string | null;
  setSelectedVenueId: (id: string | null) => void;
  rules: string[];
  setRules: (r: string[]) => void;
  // v0.11.0 — cover photo picker
  customCoverUrl: string | null;
  coverUploading: boolean;
  onPickCover: () => void;
}) {
  const {
    theme,
    t,
    title,
    onTitleChange,
    titleTemplates,
    description,
    onDescriptionChange,
    selectedDate,
    setSelectedDate,
    showDatePicker,
    setShowDatePicker,
    dateError,
    setDateError,
    dateIsValid,
    maxPets,
    setMaxPets,
    visibility,
    setVisibility,
    venueSearch,
    setVenueSearch,
    filteredVenues,
    venuesLoading,
    selectedVenueId,
    setSelectedVenueId,
    rules,
    setRules,
    customCoverUrl,
    coverUploading,
    onPickCover,
  } = props;
  // v0.11.4 — venue photo fallback removed; only user-uploaded covers.
  const effectiveCover = customCoverUrl ?? null;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 22,
        paddingBottom: 10,
        gap: 16
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {/* v0.11.0 — Cover photo picker. User-uploaded image wins; venue image
          remains the fallback if the user skips this step. */}
      <View style={{ gap: 8 }}>
        <SectionLabel theme={theme} text={t("playdates.wizard.coverPhoto") as string} />
        <Pressable
          onPress={coverUploading ? undefined : onPickCover}
          style={({ pressed }) => ({
            height: 160,
            borderRadius: mobileTheme.radius.lg,
            backgroundColor: theme.colors.background,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: effectiveCover ? 0 : 1,
            borderColor: theme.colors.border,
            borderStyle: "dashed",
            opacity: pressed ? 0.9 : 1
          })}
        >
          {effectiveCover ? (
            <Image
              source={{ uri: effectiveCover }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={200}
            />
          ) : coverUploading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <View style={{ alignItems: "center", gap: 6 }}>
              <Sparkles size={24} color={theme.colors.primary} />
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {t("playdates.wizard.coverPhotoCta")}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium",
                  textAlign: "center",
                  paddingHorizontal: 24
                }}
              >
                {t("playdates.wizard.coverPhotoHint")}
              </Text>
            </View>
          )}
          {coverUploading && effectiveCover ? (
            // NOTE: RN Fabric does NOT support the CSS `inset` shorthand on
            // <View> — it's an unknown raw prop that `RawPropsParser::preparse`
            // rejects with std::terminate when this node is later re-cloned
            // during a safe-area change (iOS 26+). Expand to top/left/right/
            // bottom so the overlay renders on every architecture.
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.35)",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </Pressable>
        {effectiveCover ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={onPickCover}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 10,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: theme.colors.primaryBg,
                alignItems: "center",
                opacity: pressed ? 0.88 : 1
              })}
            >
              <Text
                style={{
                  color: theme.colors.primary,
                  fontSize: 12,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {t("playdates.wizard.coverPhotoChange")}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Title with templates */}
      <View style={{ gap: 8 }}>
        <SectionLabel theme={theme} text={t("playdates.titlePlaceholder") as string} />
        <TextInput
          value={title}
          onChangeText={onTitleChange}
          placeholder={t("playdates.titlePlaceholder") as string}
          placeholderTextColor={theme.colors.muted}
          maxLength={60}
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}
        >
          {titleTemplates.map((tpl) => (
            <Pressable
              key={tpl}
              onPress={() => onTitleChange(tpl)}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: theme.colors.primaryBg,
                opacity: pressed ? 0.85 : 1
              })}
            >
              <Text
                style={{
                  color: theme.colors.primary,
                  fontSize: 11,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {tpl}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Date/time */}
      <View style={{ gap: 8 }}>
        <SectionLabel theme={theme} text={t("playdates.wizard.dateTime") as string} />
        <Pressable
          onPress={() => setShowDatePicker(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: theme.colors.background,
            borderRadius: mobileTheme.radius.md,
            paddingHorizontal: 14,
            paddingVertical: 14,
            borderWidth: 1,
            borderColor: dateError ? theme.colors.danger : "transparent"
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
            minimumDate={new Date(Date.now() + 60 * 60 * 1000)}
            onChange={(_e, d) => {
              setShowDatePicker(Platform.OS === "ios");
              if (d) {
                setSelectedDate(d);
                setDateError(null);
              }
            }}
          />
        )}
        {!dateIsValid ? (
          <Text
            style={{
              fontSize: 11,
              color: theme.colors.danger,
              fontFamily: "Inter_500Medium"
            }}
          >
            {t("playdates.wizard.dateTooSoon")}
          </Text>
        ) : null}
      </View>

      {/* Venue search */}
      <View style={{ gap: 8 }}>
        <SectionLabel theme={theme} text={t("playdates.venue") as string} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: theme.colors.background,
            borderRadius: mobileTheme.radius.md,
            paddingHorizontal: 14
          }}
        >
          <Search size={15} color={theme.colors.muted} />
          <TextInput
            value={venueSearch}
            onChangeText={(txt) => {
              setVenueSearch(txt);
              setSelectedVenueId(null);
            }}
            placeholder={t("playdates.wizard.venuePlaceholder") as string}
            placeholderTextColor={theme.colors.muted}
            style={{
              flex: 1,
              paddingVertical: 14,
              fontSize: 14,
              color: theme.colors.ink,
              fontFamily: "Inter_500Medium"
            }}
          />
          {venueSearch ? (
            <Pressable
              onPress={() => {
                setVenueSearch("");
                setSelectedVenueId(null);
              }}
              hitSlop={8}
            >
              <X size={14} color={theme.colors.muted} />
            </Pressable>
          ) : null}
        </View>
        {venuesLoading ? (
          <View style={{ paddingVertical: 12, alignItems: "center" }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingRight: 8 }}
          >
            {filteredVenues.map((venue) => {
              const active = selectedVenueId === venue.id;
              return (
                <Pressable
                  key={venue.id}
                  onPress={() => {
                    setSelectedVenueId(active ? null : venue.id);
                    if (!active) setVenueSearch(venue.name);
                  }}
                  style={{
                    width: 148,
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
                        height: 72,
                        backgroundColor: theme.colors.primaryBg
                      }}
                      contentFit="cover"
                      transition={250}
                    />
                  ) : (
                    <View
                      style={{
                        width: "100%",
                        height: 72,
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
            {filteredVenues.length === 0 && venueSearch ? (
              <View
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: mobileTheme.radius.md,
                  backgroundColor: theme.colors.background
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.muted,
                    fontFamily: "Inter_500Medium"
                  }}
                >
                  {t("playdates.wizard.noVenues")}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        )}
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            onPress={() => setMaxPets(Math.max(1, maxPets - 1))}
            disabled={maxPets <= 1}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor:
                maxPets <= 1 ? theme.colors.border : theme.colors.primaryBg,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Minus
              size={14}
              color={maxPets <= 1 ? theme.colors.muted : theme.colors.primary}
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
            {maxPets}
          </Text>
          <Pressable
            onPress={() => setMaxPets(Math.min(20, maxPets + 1))}
            disabled={maxPets >= 20}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor:
                maxPets >= 20 ? theme.colors.border : theme.colors.primaryBg,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Plus
              size={14}
              color={maxPets >= 20 ? theme.colors.muted : theme.colors.primary}
            />
          </Pressable>
        </View>
      </View>

      {/* Visibility toggle */}
      <View style={{ gap: 8 }}>
        <SectionLabel theme={theme} text={t("playdates.wizard.visibility") as string} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <VisibilityCard
            icon={<Globe size={16} color={theme.colors.primary} />}
            label={t("playdates.wizard.visibilityPublic") as string}
            hint={t("playdates.wizard.visibilityPublicHint") as string}
            active={visibility === "public"}
            onPress={() => setVisibility("public")}
          />
          <VisibilityCard
            icon={<Lock size={16} color={theme.colors.secondary} />}
            label={t("playdates.wizard.visibilityPrivate") as string}
            hint={t("playdates.wizard.visibilityPrivateHint") as string}
            active={visibility === "private"}
            onPress={() => setVisibility("private")}
          />
        </View>
      </View>

      {/* Description (optional) */}
      <View style={{ gap: 8 }}>
        <SectionLabel
          theme={theme}
          text={t("playdates.wizard.descriptionOptional") as string}
        />
        <TextInput
          value={description}
          onChangeText={onDescriptionChange}
          placeholder={t("playdates.descriptionPlaceholder") as string}
          placeholderTextColor={theme.colors.muted}
          multiline
          maxLength={400}
          style={{
            backgroundColor: theme.colors.background,
            borderRadius: mobileTheme.radius.md,
            paddingHorizontal: 14,
            paddingVertical: 14,
            minHeight: 80,
            fontSize: 14,
            color: theme.colors.ink,
            fontFamily: "Inter_500Medium",
            textAlignVertical: "top"
          }}
        />
      </View>

      {/* Rules (optional) */}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ListChecks size={13} color={theme.colors.muted} />
          <SectionLabel theme={theme} text={t("playdates.wizard.rulesOptional") as string} />
        </View>
        {rules.map((rule, idx) => (
          <View
            key={`rule-${idx}`}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <TextInput
              value={rule}
              onChangeText={(txt) =>
                setRules(rules.map((r, i) => (i === idx ? txt : r)))
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
              onPress={() => setRules(rules.filter((_, i) => i !== idx))}
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
          onPress={() => setRules([...rules, ""])}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 10,
            borderRadius: mobileTheme.radius.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderStyle: "dashed"
          }}
        >
          <Plus size={13} color={theme.colors.primary} />
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.primary,
              fontFamily: "Inter_700Bold"
            }}
          >
            {t("playdates.detail.addRule")}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function VisibilityCard({
  icon,
  label,
  hint,
  active,
  onPress
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        padding: 12,
        borderRadius: mobileTheme.radius.md,
        backgroundColor: active
          ? theme.colors.primaryBg
          : theme.colors.background,
        borderWidth: 2,
        borderColor: active ? theme.colors.primary : "transparent",
        gap: 6
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon}
        <Text
          style={{
            fontSize: 13,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 11,
          color: theme.colors.muted,
          fontFamily: "Inter_500Medium",
          lineHeight: 15
        }}
      >
        {hint}
      </Text>
    </Pressable>
  );
}

// ── Step 3 — Review ─────────────────────────────────────────────────
function Step3Review(props: {
  theme: ReturnType<typeof useTheme>;
  t: (key: string, opts?: any) => string;
  pets: Pet[];
  title: string;
  description: string;
  selectedDate: Date;
  venueName: string;
  cityLabel: string;
  maxPets: number;
  visibility: "public" | "private";
  rules: string[];
  onEditStep: (step: Step) => void;
}) {
  const {
    theme,
    t,
    pets,
    title,
    description,
    selectedDate,
    venueName,
    cityLabel,
    maxPets,
    visibility,
    rules,
    onEditStep
  } = props;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 22,
        paddingBottom: 10,
        gap: 14
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {/* Pets */}
      <ReviewRow
        theme={theme}
        label={t("playdates.detail.yourPets") as string}
        onEdit={() => onEditStep(1)}
      >
        <View style={{ gap: 10 }}>
          {pets.map((pet) => {
            const photo = pet.photos?.[0]?.url;
            return (
              <View
                key={pet.id}
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    overflow: "hidden",
                    backgroundColor: theme.colors.primaryBg,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {photo ? (
                    <Image
                      source={{ uri: photo }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                    />
                  ) : (
                    <PawPrint size={14} color={theme.colors.primary} />
                  )}
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.colors.ink,
                    fontFamily: "Inter_700Bold"
                  }}
                >
                  {pet.name}
                </Text>
              </View>
            );
          })}
        </View>
      </ReviewRow>

      {/* Title */}
      <ReviewRow
        theme={theme}
        label={t("playdates.wizard.step2Title") as string}
        onEdit={() => onEditStep(2)}
      >
        <Text
          style={{
            fontSize: 15,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          {title || "\u2014"}
        </Text>
        {description ? (
          <Text
            style={{
              marginTop: 4,
              fontSize: 12,
              color: theme.colors.muted,
              fontFamily: "Inter_500Medium",
              lineHeight: 18
            }}
            numberOfLines={3}
          >
            {description}
          </Text>
        ) : null}
      </ReviewRow>

      {/* Date/time */}
      <ReviewRow
        theme={theme}
        label={t("playdates.wizard.dateTime") as string}
        onEdit={() => onEditStep(2)}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <CalendarDays size={14} color={theme.colors.primary} />
          <Text
            style={{
              fontSize: 13,
              color: theme.colors.ink,
              fontFamily: "Inter_500Medium"
            }}
          >
            {selectedDate.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric"
            })}
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 4
          }}
        >
          <Clock size={14} color={theme.colors.primary} />
          <Text
            style={{
              fontSize: 13,
              color: theme.colors.ink,
              fontFamily: "Inter_500Medium"
            }}
          >
            {selectedDate.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit"
            })}
          </Text>
        </View>
      </ReviewRow>

      {/* Venue */}
      <ReviewRow
        theme={theme}
        label={t("playdates.venue") as string}
        onEdit={() => onEditStep(2)}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MapPin size={14} color={theme.colors.secondary} />
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
            numberOfLines={1}
          >
            {venueName || "\u2014"}
          </Text>
        </View>
        {cityLabel ? (
          <Text
            style={{
              marginTop: 2,
              fontSize: 11,
              color: theme.colors.muted,
              fontFamily: "Inter_500Medium"
            }}
          >
            {cityLabel}
          </Text>
        ) : null}
      </ReviewRow>

      {/* Max pets */}
      <ReviewRow
        theme={theme}
        label={t("playdates.maxPets") as string}
        onEdit={() => onEditStep(2)}
      >
        <Text
          style={{
            fontSize: 13,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          {maxPets}
        </Text>
      </ReviewRow>

      {/* Visibility */}
      <ReviewRow
        theme={theme}
        label={t("playdates.wizard.visibility") as string}
        onEdit={() => onEditStep(2)}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {visibility === "public" ? (
            <Globe size={14} color={theme.colors.primary} />
          ) : (
            <Lock size={14} color={theme.colors.secondary} />
          )}
          <Text
            style={{
              fontSize: 13,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            {visibility === "public"
              ? t("playdates.wizard.visibilityPublic")
              : t("playdates.wizard.visibilityPrivate")}
          </Text>
        </View>
      </ReviewRow>

      {/* Rules */}
      {rules.filter((r) => r.trim()).length > 0 ? (
        <ReviewRow
          theme={theme}
          label={t("playdates.detail.rules") as string}
          onEdit={() => onEditStep(2)}
        >
          <View style={{ gap: 6 }}>
            {rules
              .filter((r) => r.trim())
              .map((r, i) => (
                <Text
                  key={i}
                  style={{
                    fontSize: 12,
                    color: theme.colors.ink,
                    fontFamily: "Inter_500Medium",
                    lineHeight: 17
                  }}
                >
                  · {r}
                </Text>
              ))}
          </View>
        </ReviewRow>
      ) : null}
    </ScrollView>
  );
}

function ReviewRow({
  theme,
  label,
  children,
  onEdit
}: {
  theme: ReturnType<typeof useTheme>;
  label: string;
  children: React.ReactNode;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        padding: 14,
        borderRadius: mobileTheme.radius.lg,
        backgroundColor: theme.colors.background,
        gap: 8
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Text
          style={{
            fontSize: 11,
            letterSpacing: 1,
            color: theme.colors.muted,
            fontFamily: "Inter_700Bold",
            textTransform: "uppercase"
          }}
        >
          {label}
        </Text>
        <Pressable onPress={onEdit} hitSlop={8}>
          <Text
            style={{
              fontSize: 11,
              color: theme.colors.primary,
              fontFamily: "Inter_700Bold"
            }}
          >
            {t("common.edit")}
          </Text>
        </Pressable>
      </View>
      {children}
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
        textTransform: "uppercase"
      }}
    >
      {text}
    </Text>
  );
}
