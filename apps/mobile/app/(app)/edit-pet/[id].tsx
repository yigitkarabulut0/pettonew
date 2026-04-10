import { Picker } from "@react-native-picker/picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
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

import { PrimaryButton } from "@/components/primary-button";
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
  1: "Very calm",
  2: "Relaxed",
  3: "Balanced",
  4: "Active",
  5: "Very active"
};

export default function EditPetPage() {
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

  const [selectedHobbyIds, setSelectedHobbyIds] = useState<string[]>([]);
  const [selectedCompatibilityIds, setSelectedCompatibilityIds] = useState<string[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [hobbiesModalOpen, setHobbiesModalOpen] = useState(false);
  const [compatibilityModalOpen, setCompatibilityModalOpen] = useState(false);
  const [charactersModalOpen, setCharactersModalOpen] = useState(false);
  const [taxonomyInitialized, setTaxonomyInitialized] = useState(false);

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

  const mutation = useMutation({
    mutationFn: async (values: PetValues) => {
      if (!session || !petId) throw new Error("Missing session or petId");

      const parsedAge = Number.parseInt(values.ageYearsInput, 10);
      const selectedSpecies = species.find((s) => s.id === values.speciesId)!;
      const selectedBreed = breeds.find((b) => b.id === values.breedId)!;

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
        photos: pet?.photos ?? [],
        cityLabel: session.user.cityLabel
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["my-pets"] });
      router.back();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update pet.");
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
          Edit {pet.name}
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
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <LabeledInput label="Pet name" placeholder="Name" value={value} onChangeText={onChange} error={errors.name} />
          )}
        />

        <Controller
          control={control}
          name="ageYearsInput"
          render={({ field: { onChange, value } }) => (
            <LabeledInput
              label="Pet age"
              placeholder="Age in years"
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
              <Text style={getFieldLabelStyle(theme.colors)}>Gender</Text>
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
                      {g === "male" ? "Male" : "Female"}
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
              label="Species"
              value={value}
              onValueChange={(v) => {
                onChange(v);
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
              onValueChange={onChange}
              items={filteredBreeds}
              placeholder={selectedSpeciesId ? "Select a breed" : "Choose species first"}
              disabled={!selectedSpeciesId}
              error={errors.breedId}
            />
          )}
        />

        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text style={getFieldLabelStyle(theme.colors)}>Activity level</Text>
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
          <Text style={getFieldLabelStyle(theme.colors)}>Hobbies</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing.md }}>
            {selectedHobbies.map((item) => (
              <TagChip
                key={item.id}
                label={item.label}
                onRemove={() => setSelectedHobbyIds((current) => current.filter((e) => e !== item.id))}
              />
            ))}
            <PrimaryButton label="+ Add" variant="ghost" onPress={() => setHobbiesModalOpen(true)} />
          </View>
        </View>

        <View style={{ gap: mobileTheme.spacing.md }}>
          <Text style={getFieldLabelStyle(theme.colors)}>Good with</Text>
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
          <Text style={getFieldLabelStyle(theme.colors)}>Characters</Text>
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
                Describe your pet's personality
              </Text>
            )}
            <PrimaryButton label="+ Add Character" variant="ghost" onPress={() => setCharactersModalOpen(true)} />
          </View>
        </View>

        <Controller
          control={control}
          name="isNeutered"
          render={({ field: { onChange, value } }) => (
            <PickerBooleanField label="Neutered" value={value} onValueChange={(v) => onChange(v === "true")} />
          )}
        />

        <Controller
          control={control}
          name="bio"
          render={({ field: { onChange, value } }) => (
            <LabeledInput label="Pet bio" placeholder="Tell about your pet" value={value} onChangeText={onChange} multiline error={errors.bio} />
          )}
        />

        {errorMessage && (
          <Text style={{ ...mobileTheme.typography.body, color: theme.colors.danger, fontFamily: "Inter_400Regular" }}>
            {errorMessage}
          </Text>
        )}

        <PrimaryButton
          label={mutation.isPending ? "Saving..." : "Save changes"}
          onPress={handleSubmit((values) => mutation.mutate(values))}
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
            current.includes(id) ? current.filter((e) => e !== id) : [...current, id]
          )
        }
        onClose={() => setHobbiesModalOpen(false)}
      />

      <SelectionModal
        visible={compatibilityModalOpen}
        title="Select compatibility"
        subtitle="Pick what your pet is good with."
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
        title="Select characters"
        subtitle="Pick traits that best describe your pet's personality."
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
            <PrimaryButton label="Done" onPress={onClose} />
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
          <Picker.Item label="Yes" value="true" />
          <Picker.Item label="No" value="false" />
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
