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
import { Camera, X } from "lucide-react-native";

import { PrimaryButton } from "@/components/primary-button";
import { ScreenShell } from "@/components/screen-shell";
import { listTaxonomies, savePet, uploadMedia } from "@/lib/api";
import { mobileTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

const petSchema = z.object({
  name: z.string().min(2, "Pet name is required."),
  ageYearsInput: z.string().min(1, "Pet age is required."),
  speciesId: z.string().min(2, "Please choose a species."),
  breedId: z.string().min(2, "Please choose a breed."),
  bio: z.string().min(12, "Pet bio should be at least 12 characters."),
  activityLevel: z.number().min(1).max(5),
  isNeutered: z.boolean()
});

type PetValues = z.infer<typeof petSchema>;

const ACTIVITY_COPY: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Very calm",
  2: "Relaxed",
  3: "Balanced",
  4: "Active",
  5: "Very active"
};

export default function PetsOnboardingPage() {
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
  const [hobbiesModalOpen, setHobbiesModalOpen] = useState(false);
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

  const submitPet = async (values: PetValues) => {
    if (!session) {
      setErrorMessage("No session found.");
      return;
    }

    setErrorMessage(null);
    setPhotoError(null);

    if (photoAssets.length < 1) {
      setPhotoError("Please add at least one pet photo.");
      setErrorMessage("Please fix the highlighted fields and try again.");
      return;
    }

    const parsedAge = Number.parseInt(values.ageYearsInput, 10);
    if (Number.isNaN(parsedAge) || parsedAge < 0) {
      setError("ageYearsInput", {
        type: "manual",
        message: "Please enter a valid pet age."
      });
      setErrorMessage("Please fix the highlighted fields and try again.");
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
      setErrorMessage("Please fix the highlighted fields and try again.");
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
      setErrorMessage("Please fix the highlighted fields and try again.");
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
        throw new Error("No session found.");
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
        speciesId: values.speciesId,
        speciesLabel: selectedSpecies.label,
        breedId: values.breedId,
        breedLabel: selectedBreed.label,
        activityLevel: selectedActivityLevel,
        hobbies: selectedHobbies.map((item) => item.label),
        goodWith: selectedCompatibility.map((item) => item.label),
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
        error instanceof Error ? error.message : "Unable to save pet."
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
      eyebrow="Pet onboarding"
      title="Create a profile pets would actually swipe right on."
      subtitle="Set species, breed, hobbies, energy level, and photos in a way that feels easy to scan."
    >
      <View
        style={{
          gap: mobileTheme.spacing.lg,
          padding: mobileTheme.spacing.xl,
          borderRadius: mobileTheme.radius.lg,
          backgroundColor: mobileTheme.colors.white
        }}
      >
        <Text
          selectable
          style={{
            ...mobileTheme.typography.micro,
            color: mobileTheme.colors.muted,
            fontFamily: "Inter_600SemiBold"
          }}
        >
          Step 3 of 3
        </Text>

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <LabeledInput
              label="Pet name"
              placeholder="For example Milo"
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
              label="Pet age"
              placeholder="Enter age in years"
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
          name="speciesId"
          render={({ field: { onChange, value } }) => (
            <PickerField
              label="Species"
              value={value}
              onValueChange={(nextValue) => {
                setErrorMessage(null);
                clearErrors("speciesId");
                onChange(nextValue);
                setValue("breedId", "");
              }}
              items={species}
              placeholder="Select a species"
              error={errors.speciesId}
            />
          )}
        />

        <Controller
          control={control}
          name="breedId"
          render={({ field: { onChange, value } }) => (
            <PickerField
              label="Breed"
              value={value}
              onValueChange={(nextValue) => {
                setErrorMessage(null);
                clearErrors("breedId");
                onChange(nextValue);
              }}
              items={filteredBreeds}
              placeholder={
                selectedSpeciesId ? "Select a breed" : "Choose species first"
              }
              disabled={!selectedSpeciesId}
              error={errors.breedId}
            />
          )}
        />

        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text selectable style={fieldLabelStyle}>
            Hobbies
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
              label="+ Add"
              variant="ghost"
              onPress={() => setHobbiesModalOpen(true)}
            />
          </View>
        </View>

        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text selectable style={fieldLabelStyle}>
            Good with
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
          <Text selectable style={fieldLabelStyle}>
            Activity level
          </Text>
          <View
            style={{
              borderRadius: mobileTheme.radius.md,
              backgroundColor: mobileTheme.colors.background,
              borderWidth: 1,
              borderColor: mobileTheme.colors.border,
              paddingHorizontal: mobileTheme.spacing.lg,
              paddingVertical: mobileTheme.spacing.lg,
              gap: mobileTheme.spacing.sm
            }}
          >
            <Text
              selectable
              style={{
                ...mobileTheme.typography.bodySemiBold,
                color: mobileTheme.colors.secondary,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              {ACTIVITY_COPY[selectedActivityLevel]}
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
              label="Neutered"
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
              label="Pet bio"
              placeholder="Tell other pet parents about your pet's personality"
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
          <Text selectable style={fieldLabelStyle}>
            Photos
          </Text>
          <Pressable
            onPress={pickPhotos}
            style={{
              borderRadius: mobileTheme.radius.md,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: photoError
                ? mobileTheme.colors.danger
                : mobileTheme.colors.border,
              padding: mobileTheme.spacing.xl,
              alignItems: "center"
            }}
          >
            <Text
              selectable
              style={{
                ...mobileTheme.typography.bodySemiBold,
                color: mobileTheme.colors.secondary,
                fontFamily: "Inter_600SemiBold"
              }}
            >
              Add up to 6 photos
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
                  <X size={14} color={mobileTheme.colors.white} />
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
                    <Camera size={14} color={mobileTheme.colors.white} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
          {photoError ? (
            <Text selectable style={errorTextStyle}>
              {photoError}
            </Text>
          ) : null}
        </View>

        {errorMessage ? (
          <Text
            selectable
            style={{
              ...mobileTheme.typography.body,
              color: mobileTheme.colors.danger,
              fontFamily: "Inter_400Regular"
            }}
          >
            {errorMessage}
          </Text>
        ) : null}

        <PrimaryButton
          label={mutation.isPending ? "Saving..." : "Save pet"}
          onPress={handleSubmit(submitPet, () =>
            setErrorMessage("Please fix the highlighted fields and try again.")
          )}
          disabled={mutation.isPending}
        />
      </View>

      <SelectionModal
        visible={hobbiesModalOpen}
        title="Select hobbies"
        subtitle="Choose as many hobbies as you want, then tap Done."
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
  return (
    <View style={{ gap: mobileTheme.spacing.md }}>
      <Text selectable style={fieldLabelStyle}>
        {label}
      </Text>
      <TextInput
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={mobileTheme.colors.muted}
        multiline={multiline}
        value={value}
        onChangeText={onChangeText}
        style={{
          borderRadius: mobileTheme.radius.md,
          backgroundColor: mobileTheme.colors.background,
          borderWidth: 1,
          borderColor: error
            ? mobileTheme.colors.danger
            : mobileTheme.colors.border,
          paddingHorizontal: mobileTheme.spacing.lg,
          paddingVertical: multiline
            ? mobileTheme.spacing.xl
            : mobileTheme.spacing.lg,
          minHeight: multiline ? 110 : undefined,
          color: mobileTheme.colors.ink,
          textAlignVertical: multiline ? "top" : "auto",
          fontFamily: "Inter_400Regular"
        }}
      />
      {error?.message ? (
        <Text selectable style={errorTextStyle}>
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
  return (
    <View style={{ gap: mobileTheme.spacing.md, opacity: disabled ? 0.65 : 1 }}>
      <Text selectable style={fieldLabelStyle}>
        {label}
      </Text>
      <View
        style={{
          borderRadius: mobileTheme.radius.md,
          backgroundColor: mobileTheme.colors.background,
          borderWidth: 1,
          borderColor: error
            ? mobileTheme.colors.danger
            : mobileTheme.colors.border,
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
        <Text selectable style={errorTextStyle}>
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
  return (
    <View style={{ gap: mobileTheme.spacing.md }}>
      <Text selectable style={fieldLabelStyle}>
        {label}
      </Text>
      <View
        style={{
          borderRadius: mobileTheme.radius.md,
          backgroundColor: mobileTheme.colors.background,
          borderWidth: 1,
          borderColor: mobileTheme.colors.border,
          overflow: "hidden"
        }}
      >
        <Picker
          selectedValue={value ? "true" : "false"}
          onValueChange={onValueChange}
        >
          <Picker.Item label="Yes" value="true" />
          <Picker.Item label="No" value="false" />
        </Picker>
      </View>
    </View>
  );
}

function TagChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: mobileTheme.spacing.sm,
        borderRadius: mobileTheme.radius.pill,
        borderWidth: 1,
        borderColor: mobileTheme.colors.border,
        backgroundColor: mobileTheme.colors.background,
        paddingHorizontal: mobileTheme.spacing.md,
        paddingVertical: mobileTheme.spacing.md
      }}
    >
      <Text
        selectable
        style={{
          ...mobileTheme.typography.bodySemiBold,
          color: mobileTheme.colors.secondary,
          fontFamily: "Inter_600SemiBold"
        }}
      >
        {label}
      </Text>
      <Pressable onPress={onRemove}>
        <X size={14} color={mobileTheme.colors.danger} />
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
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <ScreenShell eyebrow="Selection" title={title} subtitle={subtitle}>
        <View
          style={{
            gap: mobileTheme.spacing.lg,
            padding: mobileTheme.spacing.xl,
            borderRadius: mobileTheme.radius.lg,
            backgroundColor: mobileTheme.colors.white,
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
          <PrimaryButton label="Done" onPress={onClose} />
        </View>
      </ScreenShell>
    </Modal>
  );
}

const fieldLabelStyle = {
  ...mobileTheme.typography.label,
  color: mobileTheme.colors.secondary,
  fontFamily: "Inter_700Bold"
} as const;

const errorTextStyle = {
  ...mobileTheme.typography.caption,
  color: mobileTheme.colors.danger,
  fontFamily: "Inter_600SemiBold"
} as const;

function ActivitySlider({
  value,
  onChange
}: {
  value: 1 | 2 | 3 | 4 | 5;
  onChange: (value: 1 | 2 | 3 | 4 | 5) => void;
}) {
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
            backgroundColor: mobileTheme.colors.border,
            overflow: "hidden"
          }}
        >
          <View
            style={{
              width: `${progress}%`,
              height: "100%",
              backgroundColor: mobileTheme.colors.primary
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
            backgroundColor: mobileTheme.colors.secondary,
            borderWidth: 3,
            borderColor: mobileTheme.colors.white
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
              color: mobileTheme.colors.muted,
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
