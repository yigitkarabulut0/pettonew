import { Picker } from "@react-native-picker/picker";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { FieldError } from "react-hook-form";
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent
} from "react-native";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Camera, X } from "lucide-react-native";

import { useTranslation } from "react-i18next";

import { PrimaryButton } from "@/components/primary-button";
import { ScreenShell } from "@/components/screen-shell";
import { listTaxonomies, savePet, uploadMedia } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

type ThemeColors = ReturnType<typeof useTheme>["colors"];

const petSchema = z.object({
  name: z.string().min(2, "Pet name is required.").max(30, "Pet name is too long."),
  ageYearsInput: z.string().min(1, "Pet age is required."),
  gender: z.enum(["male", "female"], { required_error: "Please choose a gender." }),
  speciesId: z.string().min(2, "Please choose a species."),
  breedId: z.string().min(2, "Please choose a breed."),
  bio: z.string().min(12, "Pet bio should be at least 12 characters.").max(1000, "Bio is too long."),
  activityLevel: z.number().min(1).max(5),
  isNeutered: z.boolean()
});

type PetValues = z.infer<typeof petSchema>;

const ACTIVITY_KEYS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "onboarding.pets.activityVeryCalmShort",
  2: "onboarding.pets.activityRelaxed",
  3: "onboarding.pets.activityBalanced",
  4: "onboarding.pets.activityActive",
  5: "onboarding.pets.activityVeryActive"
};

export default function PetsOnboardingPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useSessionStore((state) => state.session);
  const petCount = useSessionStore((state) => state.petCount);
  const setPetCount = useSessionStore((state) => state.setPetCount);
  const setActivePetId = useSessionStore((state) => state.setActivePetId);
  const [photoAssets, setPhotoAssets] = useState<
    Array<{ uri: string; mimeType?: string | null }>
  >([]);
  const [selectedHobbyIds, setSelectedHobbyIds] = useState<string[]>([]);
  const [selectedCompatibilityIds, setSelectedCompatibilityIds] = useState<
    string[]
  >([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [hobbiesModalOpen, setHobbiesModalOpen] = useState(false);
  const [charactersModalOpen, setCharactersModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const { data: species = [] } = useQuery({
    queryKey: ["species", session?.tokens.accessToken],
    queryFn: () => listTaxonomies(session!.tokens.accessToken, "species"),
    enabled: Boolean(session)
  });
  const { data: breeds = [] } = useQuery({
    queryKey: ["breeds", session?.tokens.accessToken],
    queryFn: () => listTaxonomies(session!.tokens.accessToken, "breeds"),
    enabled: Boolean(session)
  });
  const { data: hobbies = [] } = useQuery({
    queryKey: ["hobbies", session?.tokens.accessToken],
    queryFn: () => listTaxonomies(session!.tokens.accessToken, "hobbies"),
    enabled: Boolean(session)
  });
  const { data: compatibility = [] } = useQuery({
    queryKey: ["compatibility", session?.tokens.accessToken],
    queryFn: () => listTaxonomies(session!.tokens.accessToken, "compatibility"),
    enabled: Boolean(session)
  });
  const { data: characters = [] } = useQuery({
    queryKey: ["characters", session?.tokens.accessToken],
    queryFn: () => listTaxonomies(session!.tokens.accessToken, "characters"),
    enabled: Boolean(session)
  });

  const {
    control,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    watch,
    formState: { errors }
  } = useForm<PetValues>({
    defaultValues: {
      name: "",
      ageYearsInput: "",
      gender: "male" as const,
      speciesId: "",
      breedId: "",
      bio: "",
      activityLevel: 3,
      isNeutered: false
    },
    resolver: zodResolver(petSchema)
  });

  const selectedSpeciesId = watch("speciesId");
  const selectedBreedId = watch("breedId");
  const selectedActivityLevel = watch("activityLevel") as 1 | 2 | 3 | 4 | 5;
  const selectedNeutered = watch("isNeutered");

  const filteredBreeds = useMemo(
    () =>
      breeds.filter(
        (breed) => !breed.speciesId || breed.speciesId === selectedSpeciesId
      ),
    [breeds, selectedSpeciesId]
  );
  const selectedHobbies = hobbies.filter((item) =>
    selectedHobbyIds.includes(item.id)
  );
  const selectedCompatibility = compatibility.filter((item) =>
    selectedCompatibilityIds.includes(item.id)
  );
  const selectedCharacters = characters.filter((item) =>
    selectedCharacterIds.includes(item.id)
  );

  const submitPet = async (values: PetValues) => {
    if (!session) {
      setErrorMessage(t("common.noSessionFound"));
      return;
    }

    setErrorMessage(null);
    setPhotoError(null);

    if (photoAssets.length < 1) {
      setPhotoError(t("onboarding.pets.photoRequired"));
      setErrorMessage(t("onboarding.pets.fixFields"));
      return;
    }

    const parsedAge = Number.parseInt(values.ageYearsInput, 10);
    if (Number.isNaN(parsedAge) || parsedAge < 0) {
      setError("ageYearsInput", {
        type: "manual",
        message: "Please enter a valid pet age."
      });
      setErrorMessage(t("onboarding.pets.fixFields"));
      return;
    }

    const selectedSpecies = species.find(
      (item) => item.id === values.speciesId
    );
    if (!selectedSpecies) {
      setError("speciesId", {
        type: "manual",
        message: "Please choose a species."
      });
      setErrorMessage(t("onboarding.pets.fixFields"));
      return;
    }

    const selectedBreed =
      filteredBreeds.find((item) => item.id === values.breedId) ??
      breeds.find((item) => item.id === values.breedId);
    if (!selectedBreed) {
      setError("breedId", {
        type: "manual",
        message: "Please choose a breed."
      });
      setErrorMessage(t("onboarding.pets.fixFields"));
      return;
    }

    mutation.mutate(values);
  };

  const mutation = useMutation({
    mutationFn: async (values: PetValues) => {
      const parsedAge = Number.parseInt(values.ageYearsInput, 10);
      const selectedSpecies = species.find(
        (item) => item.id === values.speciesId
      )!;
      const selectedBreed =
        filteredBreeds.find((item) => item.id === values.breedId) ??
        breeds.find((item) => item.id === values.breedId)!;

      if (!session) {
        throw new Error(t("common.noSessionFound"));
      }

      const uploadedPhotos = await Promise.all(
        photoAssets.map(async (asset, index) => {
          const uploaded = await uploadMedia(
            session.tokens.accessToken,
            asset.uri,
            `pet-photo-${index + 1}.jpg`,
            asset.mimeType ?? "image/jpeg"
          );
          return {
            id: uploaded.id,
            url: uploaded.url,
            isPrimary: index === 0
          };
        })
      );

      return savePet(session.tokens.accessToken, {
        name: values.name.trim(),
        ageYears: parsedAge,
        gender: values.gender,
        speciesId: values.speciesId,
        speciesLabel: selectedSpecies.label,
        breedId: values.breedId,
        breedLabel: selectedBreed.label,
        activityLevel: selectedActivityLevel,
        hobbies: selectedHobbies.map((item) => item.label),
        goodWith: selectedCompatibility.map((item) => item.label),
        characters: selectedCharacters.map((item) => item.label),
        isNeutered: values.isNeutered,
        bio: values.bio.trim(),
        photos: uploadedPhotos,
        cityLabel: session.user.cityLabel
      });
    },
    onSuccess: (pet) => {
      setPetCount(petCount + 1);
      setActivePetId(pet.id);
      router.replace("/");
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error ? error.message : t("onboarding.pets.unableToSavePet")
      );
    }
  });

  const pickPhotos = async () => {
    setErrorMessage(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 6
    });

    if (result.canceled) {
      return;
    }

    setPhotoAssets((current) => {
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
      setPhotoError(null);
      return unique.slice(0, 6);
    });
  };

  return (
    <ScreenShell
      eyebrow={t("onboarding.pets.eyebrow")}
      title={t("onboarding.pets.title")}
      subtitle={t("onboarding.pets.subtitle")}
    >
      {petCount > 0 && (
        <Pressable
          onPress={() => router.back()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: mobileTheme.spacing.sm,
            marginBottom: mobileTheme.spacing.md,
            alignSelf: "flex-start",
            paddingVertical: mobileTheme.spacing.sm,
            paddingHorizontal: mobileTheme.spacing.md,
            borderRadius: mobileTheme.radius.pill,
            backgroundColor: theme.colors.surface
          }}
        >
          <ArrowLeft size={18} color={theme.colors.ink} />
          <Text
            style={{
              fontSize: mobileTheme.typography.caption.fontSize,
              fontWeight: "600",
              color: theme.colors.ink,
              fontFamily: "Inter_600SemiBold"
            }}
          >
            {t("common.back")}
          </Text>
        </Pressable>
      )}
      <View
        style={{
          gap: mobileTheme.spacing.lg,
          padding: mobileTheme.spacing.xl,
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: theme.colors.white
        }}
      >
        <Text
          selectable
          style={{
            ...mobileTheme.typography.micro,
            color: theme.colors.muted,
            fontFamily: "Inter_600SemiBold"
          }}
        >
          {t("onboarding.pets.step")}
        </Text>

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <LabeledInput
              label={t("onboarding.pets.petName")}
              placeholder={t("onboarding.pets.petNamePlaceholder")}
              maxLength={30}
              value={value}
              onChangeText={(nextValue) => {
                setErrorMessage(null);
                onChange(nextValue);
              }}
              error={errors.name}
            />
          )}
        />

        <Controller
          control={control}
          name="ageYearsInput"
          render={({ field: { onChange, value } }) => (
            <LabeledInput
              label={t("onboarding.pets.petAge")}
              placeholder={t("onboarding.pets.petAgePlaceholder")}
              value={value}
              onChangeText={(text) => {
                setErrorMessage(null);
                clearErrors("ageYearsInput");
                onChange(text.replace(/[^0-9]/g, ""));
              }}
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
              <Text selectable style={getFieldLabelStyle(theme.colors)}>
                {t("onboarding.pets.gender")}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: mobileTheme.spacing.md
                }}
              >
                {(["male", "female"] as const).map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => {
                      setErrorMessage(null);
                      onChange(g);
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: mobileTheme.spacing.lg,
                      borderRadius: mobileTheme.radius.md,
                      borderWidth: 1.5,
                      borderColor:
                        value === g
                          ? theme.colors.primary
                          : theme.colors.border,
                      backgroundColor:
                        value === g
                          ? theme.colors.primaryBg
                          : theme.colors.background,
                      alignItems: "center"
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: mobileTheme.typography.body.fontSize,
                        color:
                          value === g
                            ? theme.colors.primary
                            : theme.colors.muted
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
              onValueChange={(nextValue) => {
                setErrorMessage(null);
                clearErrors("speciesId");
                onChange(nextValue);
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
              onValueChange={(nextValue) => {
                setErrorMessage(null);
                clearErrors("breedId");
                onChange(nextValue);
              }}
              items={filteredBreeds}
              placeholder={
                selectedSpeciesId ? t("onboarding.pets.selectBreed") : t("onboarding.pets.chooseSpeciesFirst")
              }
              disabled={!selectedSpeciesId}
              error={errors.breedId}
            />
          )}
        />

        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text selectable style={getFieldLabelStyle(theme.colors)}>
            {t("onboarding.pets.hobbies")}
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: mobileTheme.spacing.md
            }}
          >
            {selectedHobbies.map((item) => (
              <TagChip
                key={item.id}
                label={item.label}
                onRemove={() =>
                  setSelectedHobbyIds((current) =>
                    current.filter((entry) => entry !== item.id)
                  )
                }
              />
            ))}
            <PrimaryButton
              label={t("onboarding.pets.addHobby")}
              variant="ghost"
              onPress={() => setHobbiesModalOpen(true)}
            />
          </View>
        </View>

        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text selectable style={getFieldLabelStyle(theme.colors)}>
            {t("onboarding.pets.goodWith")}
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: mobileTheme.spacing.md
            }}
          >
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
                        ? current.filter((entry) => entry !== item.id)
                        : [...current, item.id]
                    )
                  }
                />
              );
            })}
          </View>
        </View>

        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text selectable style={getFieldLabelStyle(theme.colors)}>
            {t("onboarding.pets.characters")}
          </Text>
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
            {selectedCharacters.length > 0 ? (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: mobileTheme.spacing.sm
                }}
              >
                {selectedCharacters.map((item) => (
                  <TagChip
                    key={item.id}
                    label={item.label}
                    onRemove={() =>
                      setSelectedCharacterIds((current) =>
                        current.filter((entry) => entry !== item.id)
                      )
                    }
                  />
                ))}
              </View>
            ) : (
              <Text
                selectable
                style={{
                  ...mobileTheme.typography.body,
                  color: theme.colors.muted,
                  fontFamily: "Inter_400Regular"
                }}
              >
                {t("onboarding.pets.describePersonality")}
              </Text>
            )}
            <PrimaryButton
              label={t("onboarding.pets.addCharacter")}
              variant="ghost"
              onPress={() => setCharactersModalOpen(true)}
            />
          </View>
        </View>

        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text selectable style={getFieldLabelStyle(theme.colors)}>
            {t("onboarding.pets.activityLevel")}
          </Text>
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
            <Text
              selectable
              style={{
                ...mobileTheme.typography.bodySemiBold,
                color: theme.colors.secondary,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {t(ACTIVITY_KEYS[selectedActivityLevel])}
            </Text>
            <ActivitySlider
              value={selectedActivityLevel}
              onChange={(value) => setValue("activityLevel", value)}
            />
          </View>
        </View>

        <Controller
          control={control}
          name="isNeutered"
          render={({ field: { onChange, value } }) => (
            <PickerBooleanField
              label={t("onboarding.pets.neutered")}
              value={value}
              onValueChange={(nextValue) => onChange(nextValue === "true")}
            />
          )}
        />

        <Controller
          control={control}
          name="bio"
          render={({ field: { onChange, value } }) => (
            <LabeledInput
              label={t("onboarding.pets.petBio")}
              placeholder={t("onboarding.pets.petBioPlaceholder")}
              maxLength={1000}
              value={value}
              onChangeText={(nextValue) => {
                setErrorMessage(null);
                onChange(nextValue);
              }}
              multiline
              error={errors.bio}
            />
          )}
        />

        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text selectable style={getFieldLabelStyle(theme.colors)}>
            {t("onboarding.pets.photos")}
          </Text>
          <Pressable
            onPress={pickPhotos}
            style={{
              borderRadius: mobileTheme.radius.md,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: photoError
                ? theme.colors.danger
                : theme.colors.border,
              padding: mobileTheme.spacing.xl,
              alignItems: "center"
            }}
          >
            <Text
              selectable
              style={{
                ...mobileTheme.typography.bodySemiBold,
                color: theme.colors.secondary,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {t("onboarding.pets.addPhotos")}
            </Text>
          </Pressable>
          <View
            style={{
              flexDirection: "row",
              gap: mobileTheme.spacing.md,
              flexWrap: "wrap"
            }}
          >
            {photoAssets.map((asset, index) => (
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
                    setPhotoAssets((current) =>
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
          </View>
          {photoError ? (
            <Text selectable style={getErrorTextStyle(theme.colors)}>
              {photoError}
            </Text>
          ) : null}
        </View>

        {errorMessage ? (
          <Text
            selectable
            style={{
              ...mobileTheme.typography.body,
              color: theme.colors.danger,
              fontFamily: "Inter_400Regular"
            }}
          >
            {errorMessage}
          </Text>
        ) : null}

        <PrimaryButton
          label={mutation.isPending ? t("onboarding.pets.saving") : t("onboarding.pets.savePet")}
          onPress={handleSubmit(submitPet, () =>
            setErrorMessage("Please fix the highlighted fields and try again.")
          )}
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
            current.includes(id)
              ? current.filter((entry) => entry !== id)
              : [...current, id]
          )
        }
        onClose={() => setHobbiesModalOpen(false)}
      />

      <SelectionModal
        visible={charactersModalOpen}
        title={t("onboarding.pets.selectCharacters")}
        subtitle={t("onboarding.pets.selectCharactersSubtitle")}
        items={characters}
        selectedIds={selectedCharacterIds}
        onToggle={(id) =>
          setSelectedCharacterIds((current) =>
            current.includes(id)
              ? current.filter((entry) => entry !== id)
              : [...current, id]
          )
        }
        onClose={() => setCharactersModalOpen(false)}
      />
    </ScreenShell>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline = false,
  maxLength,
  error
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "number-pad";
  multiline?: boolean;
  maxLength?: number;
  error?: FieldError;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: mobileTheme.spacing.md }}>
      <Text selectable style={getFieldLabelStyle(theme.colors)}>
        {label}
      </Text>
      <TextInput
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        multiline={multiline}
        maxLength={maxLength}
        value={value}
        onChangeText={onChangeText}
        style={{
          borderRadius: mobileTheme.radius.md,
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderColor: error
            ? theme.colors.danger
            : theme.colors.border,
          paddingHorizontal: mobileTheme.spacing.lg,
          paddingVertical: multiline
            ? mobileTheme.spacing.xl
            : mobileTheme.spacing.lg,
          minHeight: multiline ? 110 : undefined,
          color: theme.colors.ink,
          textAlignVertical: multiline ? "top" : "auto",
          fontFamily: "Inter_400Regular"
        }}
      />
      {error?.message ? (
        <Text selectable style={getErrorTextStyle(theme.colors)}>
          {error.message}
        </Text>
      ) : null}
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
      <Text selectable style={getFieldLabelStyle(theme.colors)}>
        {label}
      </Text>
      <View
        style={{
          borderRadius: mobileTheme.radius.md,
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderColor: error
            ? theme.colors.danger
            : theme.colors.border,
          overflow: "hidden"
        }}
      >
        <Picker
          enabled={!disabled}
          selectedValue={value}
          onValueChange={onValueChange}
        >
          <Picker.Item label={placeholder} value="" />
          {items.map((item) => (
            <Picker.Item key={item.id} label={item.label} value={item.id} />
          ))}
        </Picker>
      </View>
      {error?.message ? (
        <Text selectable style={getErrorTextStyle(theme.colors)}>
          {error.message}
        </Text>
      ) : null}
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
      <Text selectable style={getFieldLabelStyle(theme.colors)}>
        {label}
      </Text>
      <View
        style={{
          borderRadius: mobileTheme.radius.md,
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderColor: theme.colors.border,
          overflow: "hidden"
        }}
      >
        <Picker
          selectedValue={value ? "true" : "false"}
          onValueChange={onValueChange}
        >
          <Picker.Item label={t("common.yes")} value="true" />
          <Picker.Item label={t("common.no")} value="false" />
        </Picker>
      </View>
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
        selectable
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
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <ScreenShell eyebrow={t("common.selection")} title={title} subtitle={subtitle}>
        <View
          style={{
            gap: mobileTheme.spacing.lg,
            padding: mobileTheme.spacing.xl,
            borderRadius: mobileTheme.radius.lg,
            backgroundColor: theme.colors.white,
            ...mobileTheme.shadow.sm
          }}
        >
          <ScrollView contentContainerStyle={{ gap: mobileTheme.spacing.md }}>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: mobileTheme.spacing.md
              }}
            >
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
          </ScrollView>
          <PrimaryButton label={t("common.done")} onPress={onClose} />
        </View>
      </ScreenShell>
    </Modal>
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

function ActivitySlider({
  value,
  onChange
}: {
  value: 1 | 2 | 3 | 4 | 5;
  onChange: (value: 1 | 2 | 3 | 4 | 5) => void;
}) {
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);

  const updateValue = (locationX: number) => {
    const width = trackWidthRef.current;
    if (!width) {
      return;
    }

    const clamped = Math.max(0, Math.min(locationX, width));
    const ratio = clamped / width;
    const nextValue = Math.min(5, Math.max(1, Math.round(ratio * 4) + 1)) as
      | 1
      | 2
      | 3
      | 4
      | 5;
    onChange(nextValue);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => updateValue(event.nativeEvent.locationX),
      onPanResponderMove: (event) => updateValue(event.nativeEvent.locationX)
    })
  ).current;

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    trackWidthRef.current = width;
    setTrackWidth(width);
  };

  const progress = ((value - 1) / 4) * 100;
  const thumbOffset = trackWidth ? ((value - 1) / 4) * trackWidth : 0;

  return (
    <View style={{ gap: mobileTheme.spacing.sm }}>
      <View
        onLayout={handleLayout}
        {...panResponder.panHandlers}
        style={{
          height: 38,
          justifyContent: "center"
        }}
      >
        <View
          style={{
            height: 8,
            borderRadius: mobileTheme.radius.pill,
            backgroundColor: theme.colors.border,
            overflow: "hidden"
          }}
        >
          <View
            style={{
              width: `${progress}%`,
              height: "100%",
              backgroundColor: theme.colors.primary
            }}
          />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: Math.max(0, thumbOffset - 12),
            width: 24,
            height: 24,
            borderRadius: mobileTheme.radius.pill,
            backgroundColor: theme.colors.secondary,
            borderWidth: 3,
            borderColor: theme.colors.white
          }}
        />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {[1, 2, 3, 4, 5].map((step) => (
          <Text
            key={step}
            selectable
            style={{
              ...mobileTheme.typography.micro,
              color: theme.colors.muted,
              fontFamily: "Inter_600SemiBold"
            }}
          >
            {step}
          </Text>
        ))}
      </View>
    </View>
  );
}
