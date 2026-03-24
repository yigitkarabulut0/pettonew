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
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent
} from "react-native";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

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

const styles = StyleSheet.create({
  formCard: {
    gap: 14,
    padding: 18,
    borderRadius: 20,
    backgroundColor: mobileTheme.colors.surface
  },
  fieldLabel: {
    color: mobileTheme.colors.secondary,
    fontWeight: "700",
    fontFamily: mobileTheme.fontFamily
  },
  errorText: {
    color: mobileTheme.colors.danger,
    fontSize: 13,
    fontWeight: "600",
    fontFamily: mobileTheme.fontFamily
  },
  inputContainer: {
    gap: 10
  },
  input: {
    borderRadius: mobileTheme.radius.md,
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: mobileTheme.colors.ink,
    fontFamily: mobileTheme.fontFamily
  },
  inputMultiline: {
    borderRadius: mobileTheme.radius.md,
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 110,
    color: mobileTheme.colors.ink,
    textAlignVertical: "top",
    fontFamily: mobileTheme.fontFamily
  },
  inputError: {
    borderColor: mobileTheme.colors.danger
  },
  pickerContainer: {
    gap: 10,
    opacity: 1
  },
  pickerDisabled: {
    opacity: 0.65
  },
  pickerWrapper: {
    borderRadius: mobileTheme.radius.md,
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    overflow: "hidden"
  },
  pickerWrapperError: {
    borderColor: mobileTheme.colors.danger
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  activityBox: {
    borderRadius: mobileTheme.radius.md,
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 6
  },
  activityLabel: {
    color: mobileTheme.colors.secondary,
    fontWeight: "700",
    fontSize: 16,
    fontFamily: mobileTheme.fontFamily
  },
  photoSection: {
    gap: 12
  },
  photoPressable: {
    borderRadius: mobileTheme.radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: mobileTheme.colors.border,
    padding: 18,
    alignItems: "center"
  },
  photoPressableError: {
    borderColor: mobileTheme.colors.danger
  },
  photoAddText: {
    color: mobileTheme.colors.secondary,
    fontWeight: "700",
    fontFamily: mobileTheme.fontFamily
  },
  photoGrid: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  photoThumb: {
    width: 92,
    height: 92,
    borderRadius: 16
  },
  badge: {
    position: "absolute",
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  badgeTopRight: {
    top: 6,
    right: 6
  },
  badgeBottomLeft: {
    left: 6,
    bottom: 6
  },
  badgeText: {
    color: mobileTheme.colors.surface,
    fontSize: 11,
    fontWeight: "700",
    fontFamily: mobileTheme.fontFamily
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  tagChipLabel: {
    color: mobileTheme.colors.secondary,
    fontWeight: "700",
    fontFamily: mobileTheme.fontFamily
  },
  tagChipRemove: {
    color: mobileTheme.colors.danger,
    fontWeight: "700",
    fontSize: 12,
    fontFamily: mobileTheme.fontFamily
  },
  modalCard: {
    gap: 14,
    padding: 18,
    borderRadius: 20,
    backgroundColor: mobileTheme.colors.surface
  },
  errorMessage: {
    color: mobileTheme.colors.danger,
    fontFamily: mobileTheme.fontFamily
  },
  sliderStep: {
    color: mobileTheme.colors.muted,
    fontSize: 12,
    fontFamily: mobileTheme.fontFamily
  }
});

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
      eyebrow="Your pet"
      title="Add a pet"
      subtitle="Create a profile pets would swipe right on."
    >
      <View style={styles.formCard}>
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

        <View style={styles.inputContainer}>
          <Text style={styles.fieldLabel}>Hobbies</Text>
          <View style={styles.chipsRow}>
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

        <View style={styles.inputContainer}>
          <Text style={styles.fieldLabel}>Good with</Text>
          <View style={styles.chipsRow}>
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

        <View style={styles.inputContainer}>
          <Text style={styles.fieldLabel}>Activity level</Text>
          <View style={styles.activityBox}>
            <Text style={styles.activityLabel}>
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

        <View style={styles.photoSection}>
          <Text style={styles.fieldLabel}>Photos</Text>
          <Pressable
            onPress={pickPhotos}
            style={[
              styles.photoPressable,
              photoError ? styles.photoPressableError : null
            ]}
          >
            <Text style={styles.photoAddText}>Add up to 6 photos</Text>
          </Pressable>
          <View style={styles.photoGrid}>
            {photoAssets.map((asset, index) => (
              <View key={asset.uri} style={{ position: "relative" }}>
                <Image
                  source={{ uri: asset.uri }}
                  style={styles.photoThumb}
                  resizeMode="cover"
                />
                <Pressable
                  onPress={() =>
                    setPhotoAssets((current) =>
                      current.filter((entry) => entry.uri !== asset.uri)
                    )
                  }
                  style={[styles.badge, styles.badgeTopRight]}
                >
                  <Text style={styles.badgeText}>Remove</Text>
                </Pressable>
                {index === 0 ? (
                  <View style={[styles.badge, styles.badgeBottomLeft]}>
                    <Text style={styles.badgeText}>Cover</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
          {photoError ? (
            <Text style={styles.errorText}>{photoError}</Text>
          ) : null}
        </View>

        {errorMessage ? (
          <Text style={styles.errorMessage}>{errorMessage}</Text>
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
    <View style={styles.inputContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={mobileTheme.colors.muted}
        multiline={multiline}
        value={value}
        onChangeText={onChangeText}
        style={[
          multiline ? styles.inputMultiline : styles.input,
          error ? styles.inputError : null
        ]}
      />
      {error?.message ? (
        <Text style={styles.errorText}>{error.message}</Text>
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
    <View
      style={[styles.pickerContainer, disabled ? styles.pickerDisabled : null]}
    >
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[styles.pickerWrapper, error ? styles.pickerWrapperError : null]}
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
        <Text style={styles.errorText}>{error.message}</Text>
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
    <View style={styles.inputContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.pickerWrapper}>
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
    <View style={styles.tagChip}>
      <Text style={styles.tagChipLabel}>{label}</Text>
      <Pressable onPress={onRemove}>
        <Text style={styles.tagChipRemove}>Remove</Text>
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
        <View style={styles.modalCard}>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <View style={styles.chipsRow}>
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
    <View style={{ gap: 8 }}>
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
            borderRadius: 999,
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
            borderRadius: 999,
            backgroundColor: mobileTheme.colors.secondary,
            borderWidth: 3,
            borderColor: mobileTheme.colors.surface
          }}
        />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {[1, 2, 3, 4, 5].map((step) => (
          <Text key={step} style={styles.sliderStep}>
            {step}
          </Text>
        ))}
      </View>
    </View>
  );
}
