import { Picker } from "@react-native-picker/picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PetPhoto } from "@petto/contracts";
import { Controller, useForm } from "react-hook-form";
import type { FieldError } from "react-hook-form";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { LottieLoading } from "@/components/lottie-loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Camera, X } from "lucide-react-native";

import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { getCurrentLanguage } from "@/lib/i18n";
import { PrimaryButton } from "@/components/primary-button";
import { UploadProgressOverlay } from "@/components/media/upload-progress-overlay";
import { listMyPets, listTaxonomies, updatePet, uploadMedia } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

type ThemeColors = ReturnType<typeof useTheme>["colors"];

const petSchema = z.object({
  name: z.string().min(2, "Pet name is required."),
  ageYearsInput: z.string().min(1, "Pet age is required."),
  gender: z.enum(["male", "female"]),
  speciesId: z.string().min(2, "Please choose a species."),
  breedId: z.string().min(2, "Please choose a breed."),
  bio: z.string().min(12, "Pet bio should be at least 12 characters."),
  activityLevel: z.number().min(1).max(5),
  isNeutered: z.boolean()
});

type PetValues = z.infer<typeof petSchema>;

const ACTIVITY_COPY: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: i18n.t("onboarding.pets.activityVeryCalmShort"),
  2: i18n.t("onboarding.pets.activityRelaxed"),
  3: i18n.t("onboarding.pets.activityBalanced"),
  4: i18n.t("onboarding.pets.activityActive"),
  5: i18n.t("onboarding.pets.activityVeryActive")
};

export default function EditPetPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { id: petId } = useLocalSearchParams<{ id: string }>();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: myPets = [], isLoading: petsLoading } = useQuery({
    queryKey: ["my-pets", session?.tokens.accessToken],
    queryFn: () => listMyPets(session!.tokens.accessToken),
    enabled: Boolean(session)
  });

  const pet = useMemo(() => myPets.find((p) => p.id === petId), [myPets, petId]);

  const { data: species = [] } = useQuery({
    queryKey: ["species", session?.tokens.accessToken],
    queryFn: () => listTaxonomies(session!.tokens.accessToken, "species", getCurrentLanguage()),
    enabled: Boolean(session)
  });
  const { data: breeds = [] } = useQuery({
    queryKey: ["breeds", session?.tokens.accessToken],
    queryFn: () => listTaxonomies(session!.tokens.accessToken, "breeds", getCurrentLanguage()),
    enabled: Boolean(session)
  });
  const { data: hobbies = [] } = useQuery({
    queryKey: ["hobbies", session?.tokens.accessToken],
    queryFn: () => listTaxonomies(session!.tokens.accessToken, "hobbies", getCurrentLanguage()),
    enabled: Boolean(session)
  });
  const { data: compatibility = [] } = useQuery({
    queryKey: ["compatibility", session?.tokens.accessToken],
    queryFn: () => listTaxonomies(session!.tokens.accessToken, "compatibility", getCurrentLanguage()),
    enabled: Boolean(session)
  });
  const { data: characters = [] } = useQuery({
    queryKey: ["characters", session?.tokens.accessToken],
    queryFn: () => listTaxonomies(session!.tokens.accessToken, "characters", getCurrentLanguage()),
    enabled: Boolean(session)
  });

  const [selectedHobbyIds, setSelectedHobbyIds] = useState<string[]>([]);
  const [selectedCompatibilityIds, setSelectedCompatibilityIds] = useState<string[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [hobbiesModalOpen, setHobbiesModalOpen] = useState(false);
  const [compatibilityModalOpen, setCompatibilityModalOpen] = useState(false);
  const [charactersModalOpen, setCharactersModalOpen] = useState(false);
  const [taxonomyInitialized, setTaxonomyInitialized] = useState(false);
  // Photo editor state — existing photos (already uploaded to R2) vs newly
  // picked local assets that still need to be uploaded on save.
  const [existingPhotos, setExistingPhotos] = useState<PetPhoto[]>([]);
  const [newPhotoAssets, setNewPhotoAssets] = useState<
    Array<{ uri: string; mimeType?: string | null }>
  >([]);
  const [photosInitialized, setPhotosInitialized] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | undefined>(
    undefined
  );

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm<PetValues>({
    defaultValues: {
      name: pet?.name ?? "",
      ageYearsInput: pet?.ageYears ? String(pet.ageYears) : "",
      gender: (pet?.gender as "male" | "female") ?? "male",
      speciesId: pet?.speciesId ?? "",
      breedId: pet?.breedId ?? "",
      bio: pet?.bio ?? "",
      activityLevel: pet?.activityLevel ?? 3,
      isNeutered: pet?.isNeutered ?? false
    },
    resolver: zodResolver(petSchema)
  });

  const selectedSpeciesId = watch("speciesId");
  const selectedActivityLevel = watch("activityLevel") as 1 | 2 | 3 | 4 | 5;

  const filteredBreeds = useMemo(
    () => breeds.filter((breed) => !breed.speciesId || breed.speciesId === selectedSpeciesId),
    [breeds, selectedSpeciesId]
  );

  // Initialize taxonomy selections from pet data once taxonomies are loaded
  useMemo(() => {
    if (taxonomyInitialized || !pet) return;
    if (hobbies.length === 0 && compatibility.length === 0 && characters.length === 0) return;
    setTaxonomyInitialized(true);

    if (pet.hobbies?.length) {
      const ids = pet.hobbies
        .map((label) => hobbies.find((h) => h.label === label)?.id)
        .filter(Boolean) as string[];
      setSelectedHobbyIds(ids);
    }
    if (pet.goodWith?.length) {
      const ids = pet.goodWith
        .map((label) => compatibility.find((c) => c.label === label)?.id)
        .filter(Boolean) as string[];
      setSelectedCompatibilityIds(ids);
    }
    if (pet.characters?.length) {
      const ids = pet.characters
        .map((label) => characters.find((c) => c.label === label)?.id)
        .filter(Boolean) as string[];
      setSelectedCharacterIds(ids);
    }
  }, [pet, hobbies, compatibility, characters, taxonomyInitialized]);

  const selectedHobbies = hobbies.filter((item) => selectedHobbyIds.includes(item.id));
  const selectedCompatibilityItems = compatibility.filter((item) => selectedCompatibilityIds.includes(item.id));
  const selectedCharactersItems = characters.filter((item) => selectedCharacterIds.includes(item.id));

  // Seed existingPhotos from pet once — only on first load so the user's
  // local removals / additions aren't clobbered by a background refetch.
  useEffect(() => {
    if (photosInitialized || !pet) return;
    setExistingPhotos(pet.photos ?? []);
    setPhotosInitialized(true);
  }, [pet, photosInitialized]);

  const totalPhotoCount = existingPhotos.length + newPhotoAssets.length;

  const pickPhotos = async () => {
    setPhotoError(null);
    if (totalPhotoCount >= 6) {
      setPhotoError(t("onboarding.pets.photosLimit", { defaultValue: "Max 6 photos." }));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: Math.max(1, 6 - totalPhotoCount)
    });
    if (result.canceled) return;
    setNewPhotoAssets((current) => {
      const merged = [
        ...current,
        ...result.assets.map((asset) => ({
          uri: asset.uri,
          mimeType: asset.mimeType
        }))
      ];
      const unique = merged.filter(
        (asset, index, array) =>
          array.findIndex((entry) => entry.uri === asset.uri) === index
      );
      return unique.slice(0, Math.max(0, 6 - existingPhotos.length));
    });
  };

  const mutation = useMutation({
    mutationFn: async (values: PetValues) => {
      if (!session || !petId) throw new Error("Missing session or petId");

      if (existingPhotos.length + newPhotoAssets.length < 1) {
        setPhotoError(t("onboarding.pets.photoRequired"));
        throw new Error(t("onboarding.pets.photoRequired"));
      }
      setPhotoError(null);

      const parsedAge = Number.parseInt(values.ageYearsInput, 10);
      const selectedSpecies = species.find((s) => s.id === values.speciesId)!;
      const selectedBreed = breeds.find((b) => b.id === values.breedId)!;

      // Upload any new assets to R2 first, then merge with existing photos.
      // Re-normalize primary so the first tile is always the primary photo.
      setUploading(newPhotoAssets.length > 0);
      setUploadProgress(newPhotoAssets.length > 0 ? 0 : undefined);
      const perPhoto = new Array<number>(newPhotoAssets.length).fill(0);
      const publish = () => {
        if (!newPhotoAssets.length) return;
        const sum = perPhoto.reduce((a, b) => a + b, 0);
        setUploadProgress(sum / newPhotoAssets.length);
      };
      const uploadedNew = await Promise.all(
        newPhotoAssets.map(async (asset, index) => {
          const uploaded = await uploadMedia(
            session.tokens.accessToken,
            asset.uri,
            `pet-photo-${Date.now()}-${index}.jpg`,
            asset.mimeType ?? undefined,
            {
              onProgress: (ratio) => {
                perPhoto[index] = ratio;
                publish();
              }
            }
          );
          return {
            id: uploaded.id,
            url: uploaded.url,
            isPrimary: false
          };
        })
      ).finally(() => {
        setUploading(false);
        setUploadProgress(undefined);
      });
      const merged = [...existingPhotos, ...uploadedNew].map((p, i) => ({
        ...p,
        isPrimary: i === 0
      }));

      return updatePet(session.tokens.accessToken, petId, {
        name: values.name.trim(),
        ageYears: parsedAge,
        gender: values.gender,
        speciesId: values.speciesId,
        speciesLabel: selectedSpecies.label,
        breedId: values.breedId,
        breedLabel: selectedBreed.label,
        activityLevel: values.activityLevel as 1 | 2 | 3 | 4 | 5,
        hobbies: selectedHobbies.map((item) => item.label),
        goodWith: selectedCompatibilityItems.map((item) => item.label),
        characters: selectedCharactersItems.map((item) => item.label),
        isNeutered: values.isNeutered,
        bio: values.bio.trim(),
        photos: merged,
        cityLabel: session.user.cityLabel
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["my-pets"] });
      router.back();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : i18n.t("editPet.unableToUpdate"));
    }
  });

  if (petsLoading || !pet) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.colors.background }}>
        <LottieLoading size={70} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: mobileTheme.spacing.xl,
        paddingBottom: insets.bottom + 40
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.lg
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1
          })}
        >
          <ArrowLeft size={20} color={theme.colors.ink} />
        </Pressable>
        <Text
          style={{
            flex: 1,
            fontSize: mobileTheme.typography.heading.fontSize,
            fontWeight: mobileTheme.typography.heading.fontWeight,
            color: theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          {t("editPet.title", { name: pet.name })}
        </Text>
      </View>

      <View
        style={{
          gap: mobileTheme.spacing.lg,
          padding: mobileTheme.spacing.xl,
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: theme.colors.white
        }}
      >
        {/* ── Photo editor ───────────────────────────────────── */}
        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text
            selectable
            style={{
              ...mobileTheme.typography.label,
              color: theme.colors.ink,
              fontFamily: "Inter_600SemiBold"
            }}
          >
            {t("onboarding.pets.photos")}
          </Text>

          <View
            style={{
              flexDirection: "row",
              gap: mobileTheme.spacing.md,
              flexWrap: "wrap"
            }}
          >
            {existingPhotos.map((photo, index) => (
              <View key={photo.id || photo.url} style={{ position: "relative" }}>
                <Image
                  source={{ uri: photo.url }}
                  style={{
                    width: 92,
                    height: 92,
                    borderRadius: mobileTheme.radius.lg
                  }}
                  resizeMode="cover"
                />
                <Pressable
                  onPress={() =>
                    setExistingPhotos((current) =>
                      current.filter((entry) => entry.id !== photo.id || entry.url !== photo.url)
                    )
                  }
                  style={{
                    position: "absolute",
                    top: mobileTheme.spacing.sm,
                    right: mobileTheme.spacing.sm,
                    borderRadius: mobileTheme.radius.pill,
                    backgroundColor: "rgba(0,0,0,0.6)",
                    paddingHorizontal: mobileTheme.spacing.sm,
                    paddingVertical: mobileTheme.spacing.xs
                  }}
                  hitSlop={6}
                >
                  <X size={14} color={theme.colors.white} />
                </Pressable>
                {index === 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      left: mobileTheme.spacing.sm,
                      bottom: mobileTheme.spacing.sm,
                      borderRadius: mobileTheme.radius.pill,
                      backgroundColor: "rgba(0,0,0,0.6)",
                      paddingHorizontal: mobileTheme.spacing.sm,
                      paddingVertical: mobileTheme.spacing.xs
                    }}
                  >
                    <Camera size={14} color={theme.colors.white} />
                  </View>
                ) : null}
              </View>
            ))}
            {newPhotoAssets.map((asset, index) => {
              const globalIndex = existingPhotos.length + index;
              return (
                <View key={asset.uri} style={{ position: "relative" }}>
                  <Image
                    source={{ uri: asset.uri }}
                    style={{
                      width: 92,
                      height: 92,
                      borderRadius: mobileTheme.radius.lg
                    }}
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={() =>
                      setNewPhotoAssets((current) =>
                        current.filter((entry) => entry.uri !== asset.uri)
                      )
                    }
                    style={{
                      position: "absolute",
                      top: mobileTheme.spacing.sm,
                      right: mobileTheme.spacing.sm,
                      borderRadius: mobileTheme.radius.pill,
                      backgroundColor: "rgba(0,0,0,0.6)",
                      paddingHorizontal: mobileTheme.spacing.sm,
                      paddingVertical: mobileTheme.spacing.xs
                    }}
                    hitSlop={6}
                  >
                    <X size={14} color={theme.colors.white} />
                  </Pressable>
                  {globalIndex === 0 ? (
                    <View
                      style={{
                        position: "absolute",
                        left: mobileTheme.spacing.sm,
                        bottom: mobileTheme.spacing.sm,
                        borderRadius: mobileTheme.radius.pill,
                        backgroundColor: "rgba(0,0,0,0.6)",
                        paddingHorizontal: mobileTheme.spacing.sm,
                        paddingVertical: mobileTheme.spacing.xs
                      }}
                    >
                      <Camera size={14} color={theme.colors.white} />
                    </View>
                  ) : null}
                </View>
              );
            })}
            {totalPhotoCount < 6 && (
              <Pressable
                onPress={pickPhotos}
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: mobileTheme.radius.lg,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: photoError ? theme.colors.danger : theme.colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.colors.background
                }}
              >
                <Camera size={22} color={theme.colors.secondary} />
                <Text
                  style={{
                    marginTop: 4,
                    fontSize: 11,
                    color: theme.colors.secondary,
                    fontFamily: "Inter_600SemiBold"
                  }}
                >
                  {t("onboarding.pets.addPhotos")}
                </Text>
              </Pressable>
            )}
          </View>
          {photoError ? (
            <Text
              style={{
                color: theme.colors.danger,
                fontSize: 12,
                fontFamily: "Inter_500Medium"
              }}
            >
              {photoError}
            </Text>
          ) : null}
        </View>

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <LabeledInput label={t("onboarding.pets.petName")} placeholder={t("editPet.namePlaceholder")} value={value} onChangeText={onChange} error={errors.name} />
          )}
        />

        <Controller
          control={control}
          name="ageYearsInput"
          render={({ field: { onChange, value } }) => (
            <LabeledInput
              label={t("onboarding.pets.petAge")}
              placeholder={t("editPet.agePlaceholder")}
              value={value}
              onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              error={errors.ageYearsInput}
            />
          )}
        />

        <Controller
          control={control}
          name="gender"
          render={({ field: { onChange, value } }) => (
            <View style={{ gap: mobileTheme.spacing.md }}>
              <Text style={getFieldLabelStyle(theme.colors)}>{t("onboarding.pets.gender")}</Text>
              <View style={{ flexDirection: "row", gap: mobileTheme.spacing.md }}>
                {(["male", "female"] as const).map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => onChange(g)}
                    style={{
                      flex: 1,
                      paddingVertical: mobileTheme.spacing.lg,
                      borderRadius: mobileTheme.radius.md,
                      borderWidth: 1.5,
                      borderColor: value === g ? theme.colors.primary : theme.colors.border,
                      backgroundColor: value === g ? theme.colors.primaryBg : theme.colors.background,
                      alignItems: "center"
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: mobileTheme.typography.body.fontSize,
                        color: value === g ? theme.colors.primary : theme.colors.muted
                      }}
                    >
                      {g === "male" ? t("onboarding.pets.male") : t("onboarding.pets.female")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        />

        <Controller
          control={control}
          name="speciesId"
          render={({ field: { onChange, value } }) => (
            <PickerField
              label={t("onboarding.pets.species")}
              value={value}
              onValueChange={(v) => {
                onChange(v);
                setValue("breedId", "");
              }}
              items={species}
              placeholder={t("onboarding.pets.selectSpecies")}
              error={errors.speciesId}
            />
          )}
        />

        <Controller
          control={control}
          name="breedId"
          render={({ field: { onChange, value } }) => (
            <PickerField
              label={t("onboarding.pets.breed")}
              value={value}
              onValueChange={onChange}
              items={filteredBreeds}
              placeholder={selectedSpeciesId ? t("onboarding.pets.selectBreed") : t("onboarding.pets.chooseSpeciesFirst")}
              disabled={!selectedSpeciesId}
              error={errors.breedId}
            />
          )}
        />

        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text style={getFieldLabelStyle(theme.colors)}>{t("onboarding.pets.activityLevel")}</Text>
          <View
            style={{
              borderRadius: mobileTheme.radius.md,
              backgroundColor: theme.colors.background,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: mobileTheme.spacing.lg,
              paddingVertical: mobileTheme.spacing.lg,
              gap: mobileTheme.spacing.sm
            }}
          >
            <Text style={{ ...mobileTheme.typography.bodySemiBold, color: theme.colors.secondary, fontFamily: "Inter_600SemiBold" }}>
              {ACTIVITY_COPY[selectedActivityLevel]}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: mobileTheme.spacing.sm }}>
              {([1, 2, 3, 4, 5] as const).map((level) => (
                <Pressable
                  key={level}
                  onPress={() => setValue("activityLevel", level)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: selectedActivityLevel === level ? theme.colors.primary : theme.colors.surface,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: selectedActivityLevel === level ? theme.colors.primary : theme.colors.border
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 14,
                      color: selectedActivityLevel === level ? theme.colors.white : theme.colors.muted
                    }}
                  >
                    {level}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text style={getFieldLabelStyle(theme.colors)}>{t("onboarding.pets.hobbies")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing.md }}>
            {selectedHobbies.map((item) => (
              <TagChip
                key={item.id}
                label={item.label}
                onRemove={() => setSelectedHobbyIds((current) => current.filter((e) => e !== item.id))}
              />
            ))}
            <PrimaryButton label={t("onboarding.pets.addHobby")} variant="ghost" onPress={() => setHobbiesModalOpen(true)} />
          </View>
        </View>

        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text style={getFieldLabelStyle(theme.colors)}>{t("onboarding.pets.goodWith")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing.md }}>
            {compatibility.map((item) => {
              const selected = selectedCompatibilityIds.includes(item.id);
              return (
                <PrimaryButton
                  key={item.id}
                  label={item.label}
                  variant={selected ? "secondary" : "ghost"}
                  onPress={() =>
                    setSelectedCompatibilityIds((current) =>
                      current.includes(item.id)
                        ? current.filter((e) => e !== item.id)
                        : [...current, item.id]
                    )
                  }
                />
              );
            })}
          </View>
        </View>

        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text style={getFieldLabelStyle(theme.colors)}>{t("onboarding.pets.characters")}</Text>
          <View
            style={{
              borderRadius: mobileTheme.radius.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.background,
              padding: mobileTheme.spacing.lg,
              gap: mobileTheme.spacing.md
            }}
          >
            {selectedCharactersItems.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing.sm }}>
                {selectedCharactersItems.map((item) => (
                  <TagChip
                    key={item.id}
                    label={item.label}
                    onRemove={() => setSelectedCharacterIds((current) => current.filter((e) => e !== item.id))}
                  />
                ))}
              </View>
            ) : (
              <Text
                style={{
                  ...mobileTheme.typography.body,
                  color: theme.colors.muted,
                  fontFamily: "Inter_400Regular"
                }}
              >
                {t("onboarding.pets.describePersonality")}
              </Text>
            )}
            <PrimaryButton label={t("onboarding.pets.addCharacter")} variant="ghost" onPress={() => setCharactersModalOpen(true)} />
          </View>
        </View>

        <Controller
          control={control}
          name="isNeutered"
          render={({ field: { onChange, value } }) => (
            <PickerBooleanField label={t("onboarding.pets.neutered")} value={value} onValueChange={(v) => onChange(v === "true")} />
          )}
        />

        <Controller
          control={control}
          name="bio"
          render={({ field: { onChange, value } }) => (
            <LabeledInput label={t("onboarding.pets.petBio")} placeholder={t("editPet.tellAboutPet")} value={value} onChangeText={onChange} multiline error={errors.bio} />
          )}
        />

        {errorMessage && (
          <Text style={{ ...mobileTheme.typography.body, color: theme.colors.danger, fontFamily: "Inter_400Regular" }}>
            {errorMessage}
          </Text>
        )}

        <PrimaryButton
          label={mutation.isPending ? t("common.saving") : t("editPet.saveChanges")}
          onPress={handleSubmit((values) => mutation.mutate(values))}
          disabled={mutation.isPending}
        />
      </View>

      <SelectionModal
        visible={hobbiesModalOpen}
        title={t("onboarding.pets.selectHobbies")}
        subtitle={t("onboarding.pets.selectHobbiesSubtitle")}
        items={hobbies}
        selectedIds={selectedHobbyIds}
        onToggle={(id) =>
          setSelectedHobbyIds((current) =>
            current.includes(id) ? current.filter((e) => e !== id) : [...current, id]
          )
        }
        onClose={() => setHobbiesModalOpen(false)}
      />

      <SelectionModal
        visible={compatibilityModalOpen}
        title={t("editPet.selectCompatibility")}
        subtitle={t("editPet.selectCompatibilitySubtitle")}
        items={compatibility}
        selectedIds={selectedCompatibilityIds}
        onToggle={(id) =>
          setSelectedCompatibilityIds((current) =>
            current.includes(id) ? current.filter((e) => e !== id) : [...current, id]
          )
        }
        onClose={() => setCompatibilityModalOpen(false)}
      />

      <SelectionModal
        visible={charactersModalOpen}
        title={t("onboarding.pets.selectCharacters")}
        subtitle={t("onboarding.pets.selectCharactersSubtitle")}
        items={characters}
        selectedIds={selectedCharacterIds}
        onToggle={(id) =>
          setSelectedCharacterIds((current) =>
            current.includes(id) ? current.filter((e) => e !== id) : [...current, id]
          )
        }
        onClose={() => setCharactersModalOpen(false)}
      />
    </ScrollView>
      <UploadProgressOverlay
        visible={uploading}
        progress={uploadProgress}
        label={t("onboarding.pets.uploading", { defaultValue: "Fotoğraflar yükleniyor…" })}
      />
    </View>
  );
}

function TagChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: mobileTheme.spacing.sm,
        borderRadius: mobileTheme.radius.pill,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
        paddingHorizontal: mobileTheme.spacing.md,
        paddingVertical: mobileTheme.spacing.md
      }}
    >
      <Text
        style={{
          ...mobileTheme.typography.bodySemiBold,
          color: theme.colors.secondary,
          fontFamily: "Inter_600SemiBold"
        }}
      >
        {label}
      </Text>
      <Pressable onPress={onRemove}>
        <X size={14} color={theme.colors.danger} />
      </Pressable>
    </View>
  );
}

function SelectionModal({
  visible,
  title,
  subtitle,
  items,
  selectedIds,
  onToggle,
  onClose
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  items: Array<{ id: string; label: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + mobileTheme.spacing.lg }}>
        <View style={{ paddingHorizontal: mobileTheme.spacing.xl, gap: mobileTheme.spacing.sm, marginBottom: mobileTheme.spacing.lg }}>
          <Text
            style={{
              fontSize: mobileTheme.typography.heading.fontSize,
              fontWeight: mobileTheme.typography.heading.fontWeight,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              ...mobileTheme.typography.body,
              color: theme.colors.muted,
              fontFamily: "Inter_400Regular"
            }}
          >
            {subtitle}
          </Text>
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: mobileTheme.spacing.xl,
            paddingBottom: insets.bottom + 40
          }}
        >
          <View
            style={{
              gap: mobileTheme.spacing.lg,
              padding: mobileTheme.spacing.xl,
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: theme.colors.white
            }}
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing.md }}>
              {items.map((item) => {
                const selected = selectedIds.includes(item.id);
                return (
                  <PrimaryButton
                    key={item.id}
                    label={item.label}
                    variant={selected ? "secondary" : "ghost"}
                    onPress={() => onToggle(item.id)}
                  />
                );
              })}
            </View>
            <PrimaryButton label={t("common.done")} onPress={onClose} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline = false,
  error
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "number-pad";
  multiline?: boolean;
  error?: FieldError;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: mobileTheme.spacing.md }}>
      <Text style={getFieldLabelStyle(theme.colors)}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        multiline={multiline}
        value={value}
        onChangeText={onChangeText}
        style={{
          borderRadius: mobileTheme.radius.md,
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderColor: error ? theme.colors.danger : theme.colors.border,
          paddingHorizontal: mobileTheme.spacing.lg,
          paddingVertical: multiline ? mobileTheme.spacing.xl : mobileTheme.spacing.lg,
          minHeight: multiline ? 110 : undefined,
          color: theme.colors.ink,
          textAlignVertical: multiline ? "top" : "auto",
          fontFamily: "Inter_400Regular"
        }}
      />
      {error?.message && <Text style={getErrorTextStyle(theme.colors)}>{error.message}</Text>}
    </View>
  );
}

function PickerField({
  label,
  value,
  onValueChange,
  items,
  placeholder,
  disabled = false,
  error
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{ id: string; label: string }>;
  placeholder: string;
  disabled?: boolean;
  error?: FieldError;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: mobileTheme.spacing.md, opacity: disabled ? 0.65 : 1 }}>
      <Text style={getFieldLabelStyle(theme.colors)}>{label}</Text>
      <View
        style={{
          borderRadius: mobileTheme.radius.md,
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderColor: error ? theme.colors.danger : theme.colors.border,
          overflow: "hidden"
        }}
      >
        <Picker enabled={!disabled} selectedValue={value} onValueChange={onValueChange}>
          <Picker.Item label={placeholder} value="" />
          {items.map((item) => (
            <Picker.Item key={item.id} label={item.label} value={item.id} />
          ))}
        </Picker>
      </View>
      {error?.message && <Text style={getErrorTextStyle(theme.colors)}>{error.message}</Text>}
    </View>
  );
}

function PickerBooleanField({
  label,
  value,
  onValueChange
}: {
  label: string;
  value: boolean;
  onValueChange: (value: "true" | "false") => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={{ gap: mobileTheme.spacing.md }}>
      <Text style={getFieldLabelStyle(theme.colors)}>{label}</Text>
      <View
        style={{
          borderRadius: mobileTheme.radius.md,
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderColor: theme.colors.border,
          overflow: "hidden"
        }}
      >
        <Picker selectedValue={value ? "true" : "false"} onValueChange={onValueChange}>
          <Picker.Item label={t("common.yes")} value="true" />
          <Picker.Item label={t("common.no")} value="false" />
        </Picker>
      </View>
    </View>
  );
}

function getFieldLabelStyle(colors: ThemeColors) {
  return {
    ...mobileTheme.typography.label,
    color: colors.secondary,
    fontFamily: "Inter_700Bold"
  } as const;
}

function getErrorTextStyle(colors: ThemeColors) {
  return {
    ...mobileTheme.typography.caption,
    color: colors.danger,
    fontFamily: "Inter_600SemiBold"
  } as const;
}
