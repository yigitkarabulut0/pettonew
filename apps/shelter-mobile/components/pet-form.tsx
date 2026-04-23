// Pet form — fully aligned with the shelter-web version: taxonomy-driven
// species + breed pickers, R2 photo upload, "I don't know" toggles for
// birth/intake dates, structured vaccine list, colour field removed.

import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useQuery } from "@tanstack/react-query";
import { Check, ImagePlus, Trash2, X } from "lucide-react-native";

import { getTaxonomy, uploadImageUriToR2 } from "@/lib/api";
import { theme } from "@/lib/theme";
import type { ShelterPet, VaccineRecord } from "@petto/contracts";

export type PetFormValues = {
  name: string;
  species: string;
  breed: string;
  sex: string;
  size: string;
  ageMonths: string;
  birthDate: string;
  birthDateUnknown: boolean;
  intakeDate: string;
  intakeDateUnknown: boolean;
  description: string;
  microchipId: string;
  specialNeeds: string;
  isNeutered: boolean;
  characterTags: string[];
  photos: string[];
  vaccines: VaccineRecord[];
  status: ShelterPet["status"];
};

export const emptyPet: PetFormValues = {
  name: "",
  species: "",
  breed: "",
  sex: "",
  size: "",
  ageMonths: "",
  birthDate: "",
  birthDateUnknown: false,
  intakeDate: "",
  intakeDateUnknown: false,
  description: "",
  microchipId: "",
  specialNeeds: "",
  isNeutered: false,
  characterTags: [],
  photos: [],
  vaccines: [],
  status: "available"
};

const CHAR_TAGS = [
  "playful",
  "calm",
  "curious",
  "kid-friendly",
  "dog-friendly",
  "cat-friendly",
  "house-trained",
  "energetic"
];

const MAX_PHOTOS = 10;
const MAX_PHOTO_MB = 5;

export function PetForm({
  value,
  onChange,
  onSubmit,
  submitLabel,
  pending
}: {
  value: PetFormValues;
  onChange: (v: PetFormValues) => void;
  onSubmit: () => void;
  submitLabel: string;
  pending: boolean;
}) {
  /* ── taxonomies from admin catalogue ────────────────────── */
  const { data: speciesList = [] } = useQuery({
    queryKey: ["shelter-taxonomy", "species"],
    queryFn: () => getTaxonomy("species"),
    staleTime: 5 * 60_000
  });
  const { data: breedsList = [] } = useQuery({
    queryKey: ["shelter-taxonomy", "breeds"],
    queryFn: () => getTaxonomy("breeds"),
    staleTime: 5 * 60_000
  });

  const selectedSpecies = speciesList.find((s) => s.slug === value.species);
  const breedsForSpecies = useMemo(
    () =>
      selectedSpecies
        ? breedsList.filter((b) => b.speciesId === selectedSpecies.id)
        : breedsList,
    [breedsList, selectedSpecies]
  );

  const [speciesPickerOpen, setSpeciesPickerOpen] = useState(false);
  const [breedPickerOpen, setBreedPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadIndex, setUploadIndex] = useState({ current: 0, total: 0 });

  function patch<K extends keyof PetFormValues>(k: K, v: PetFormValues[K]) {
    onChange({ ...value, [k]: v });
  }

  function toggleTag(tag: string) {
    const on = value.characterTags.includes(tag);
    patch(
      "characterTags",
      on ? value.characterTags.filter((t) => t !== tag) : [...value.characterTags, tag]
    );
  }

  async function onPickPhoto() {
    if (value.photos.length >= MAX_PHOTOS) {
      Alert.alert("Limit reached", `Up to ${MAX_PHOTOS} photos per pet.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Photo library access is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - value.photos.length,
      quality: 0.85
    });
    if (result.canceled) return;

    const assets = result.assets ?? [];
    setUploading(true);
    setUploadProgress(0);
    setUploadIndex({ current: 0, total: assets.length });
    const next = [...value.photos];
    for (let i = 0; i < assets.length; i += 1) {
      const asset = assets[i];
      if (!asset) continue;
      setUploadIndex({ current: i + 1, total: assets.length });
      setUploadProgress(0);
      const size = asset.fileSize ?? 0;
      if (size && size > MAX_PHOTO_MB * 1024 * 1024) {
        Alert.alert("Too large", `${asset.fileName ?? "Image"} is larger than ${MAX_PHOTO_MB} MB.`);
        continue;
      }
      try {
        const url = await uploadImageUriToR2({
          uri: asset.uri,
          fileName: asset.fileName ?? `photo-${Date.now()}.jpg`,
          mimeType: asset.mimeType ?? undefined,
          folder: "shelter-pets",
          onProgress: (ratio) => setUploadProgress(ratio)
        });
        next.push(url);
      } catch (err) {
        Alert.alert("Upload failed", err instanceof Error ? err.message : "Try again.");
      }
    }
    patch("photos", next);
    setUploading(false);
    setUploadProgress(0);
    setUploadIndex({ current: 0, total: 0 });
  }

  const statusOptions = ["available", "reserved", "adopted", "hidden"] as const;

  return (
    <ScrollView
      contentContainerStyle={{
        padding: theme.spacing.xl,
        gap: theme.spacing.xl,
        paddingBottom: 100
      }}
    >
      {/* ── Basic info ──────────────────────────────── */}
      <Section title="Basic info">
        <Field label="Name">
          <TextInput
            style={inp}
            value={value.name}
            onChangeText={(v) => patch("name", v)}
          />
        </Field>

        {/* Species picker */}
        <PickerButton
          label="Species"
          placeholder="Select a species"
          value={selectedSpecies?.label}
          onPress={() => setSpeciesPickerOpen(true)}
        />

        {/* Breed picker (depends on species) */}
        <PickerButton
          label={selectedSpecies ? `Breed (${selectedSpecies.label})` : "Breed"}
          placeholder={value.species ? "Select a breed" : "Pick a species first"}
          disabled={!value.species}
          value={breedsForSpecies.find((b) => b.slug === value.breed)?.label}
          onPress={() => setBreedPickerOpen(true)}
        />

        <Chips
          label="Sex"
          options={["male", "female", "unknown"]}
          selected={value.sex}
          onPick={(v) => patch("sex", v)}
        />
        <Chips
          label="Size"
          options={["small", "medium", "large"]}
          selected={value.size}
          onPick={(v) => patch("size", v)}
        />
        <Field label="Age (months)">
          <TextInput
            style={inp}
            keyboardType="numeric"
            value={value.ageMonths}
            onChangeText={(v) => patch("ageMonths", v)}
          />
        </Field>

        {/* Birth date + unknown */}
        <DateFieldWithUnknown
          label="Birth date"
          value={value.birthDate}
          onChangeText={(v) => patch("birthDate", v)}
          unknown={value.birthDateUnknown}
          onToggleUnknown={(v) => patch("birthDateUnknown", v)}
        />
        <DateFieldWithUnknown
          label="Intake date"
          value={value.intakeDate}
          onChangeText={(v) => patch("intakeDate", v)}
          unknown={value.intakeDateUnknown}
          onToggleUnknown={(v) => patch("intakeDateUnknown", v)}
        />

        <Field label="Description">
          <TextInput
            style={[inp, { minHeight: 90, textAlignVertical: "top" }]}
            multiline
            value={value.description}
            onChangeText={(v) => patch("description", v)}
            placeholder="Tell adopters about this pet"
            placeholderTextColor={theme.colors.muted}
          />
        </Field>

        <Chips
          label="Status"
          options={statusOptions as unknown as string[]}
          selected={value.status}
          onPick={(v) => patch("status", v as ShelterPet["status"])}
        />
      </Section>

      {/* ── Character ────────────────────────────── */}
      <Section title="Character">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {CHAR_TAGS.map((tag) => {
            const on = value.characterTags.includes(tag);
            return (
              <Pressable
                key={tag}
                onPress={() => toggleTag(tag)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: theme.radius.pill,
                  backgroundColor: on ? theme.colors.primary : theme.colors.background,
                  borderWidth: 1,
                  borderColor: on ? theme.colors.primary : theme.colors.border
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: on ? "#FFFFFF" : theme.colors.ink
                  }}
                >
                  {tag}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      {/* ── Health ───────────────────────────────── */}
      <Section title="Health">
        <Field label="Microchip ID">
          <TextInput
            style={inp}
            value={value.microchipId}
            onChangeText={(v) => patch("microchipId", v)}
          />
        </Field>
        <Pressable
          onPress={() => patch("isNeutered", !value.isNeutered)}
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: value.isNeutered ? theme.colors.primary : theme.colors.border,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: value.isNeutered ? theme.colors.primary : "transparent"
            }}
          >
            {value.isNeutered ? (
              <Check size={14} color="#FFFFFF" />
            ) : null}
          </View>
          <Text style={{ fontSize: 13, color: theme.colors.ink }}>Neutered / spayed</Text>
        </Pressable>
        <Field label="Special needs">
          <TextInput
            style={[inp, { minHeight: 60, textAlignVertical: "top" }]}
            multiline
            value={value.specialNeeds}
            onChangeText={(v) => patch("specialNeeds", v)}
            placeholder="Medications, allergies…"
            placeholderTextColor={theme.colors.muted}
          />
        </Field>
      </Section>

      {/* ── Photos (R2 upload via image picker) ──── */}
      <Section title="Photos">
        <Pressable
          onPress={onPickPhoto}
          disabled={uploading || value.photos.length >= MAX_PHOTOS}
          style={{
            paddingVertical: 16,
            borderRadius: theme.radius.lg,
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: uploading ? theme.colors.border : theme.colors.primary,
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            backgroundColor: theme.colors.background
          }}
        >
          {uploading ? (
            <View style={{ alignItems: "center", gap: 6 }}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.ink }}>
                {uploadIndex.total > 1
                  ? `Uploading ${uploadIndex.current}/${uploadIndex.total} · ${Math.round(uploadProgress * 100)}%`
                  : `Uploading · ${Math.round(uploadProgress * 100)}%`}
              </Text>
              <Text style={{ fontSize: 10, color: theme.colors.muted }}>
                Optimising to WebP — ~50% smaller
              </Text>
            </View>
          ) : (
            <>
              <ImagePlus size={22} color={theme.colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.ink }}>
                Upload photos ({value.photos.length}/{MAX_PHOTOS})
              </Text>
              <Text style={{ fontSize: 10, color: theme.colors.muted, textAlign: "center" }}>
                JPG / PNG / HEIC · up to {MAX_PHOTO_MB} MB each · auto-optimised
              </Text>
            </>
          )}
        </Pressable>

        {value.photos.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {value.photos.map((url) => (
              <View
                key={url}
                style={{ width: 86, height: 86, borderRadius: theme.radius.md, overflow: "hidden" }}
              >
                <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                <Pressable
                  onPress={() => patch("photos", value.photos.filter((p) => p !== url))}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: "rgba(0,0,0,0.65)",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Trash2 size={12} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </Section>

      <Pressable
        onPress={onSubmit}
        disabled={pending || uploading}
        style={({ pressed }) => ({
          paddingVertical: 14,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.primary,
          alignItems: "center",
          opacity: pending || uploading ? 0.6 : pressed ? 0.9 : 1
        })}
      >
        {pending ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>{submitLabel}</Text>
        )}
      </Pressable>

      {/* ── Species picker modal ───────────────────── */}
      <OptionPickerModal
        visible={speciesPickerOpen}
        title="Pick a species"
        options={speciesList.map((s) => ({ value: s.slug, label: s.label }))}
        selected={value.species}
        onSelect={(v) => {
          onChange({ ...value, species: v, breed: "" });
          setSpeciesPickerOpen(false);
        }}
        onClose={() => setSpeciesPickerOpen(false)}
      />
      <OptionPickerModal
        visible={breedPickerOpen}
        title={selectedSpecies ? `Breed of ${selectedSpecies.label}` : "Pick a breed"}
        options={breedsForSpecies.map((b) => ({ value: b.slug, label: b.label }))}
        selected={value.breed}
        onSelect={(v) => {
          patch("breed", v);
          setBreedPickerOpen(false);
        }}
        onClose={() => setBreedPickerOpen(false)}
      />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text
        style={{ fontSize: 11, fontWeight: "700", color: theme.colors.muted, letterSpacing: 0.5 }}
      >
        {title.toUpperCase()}
      </Text>
      <View
        style={{
          padding: theme.spacing.md,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          gap: theme.spacing.md
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.muted }}>{label}</Text>
      {children}
    </View>
  );
}

function Chips({
  label,
  options,
  selected,
  onPick
}: {
  label: string;
  options: string[];
  selected: string;
  onPick: (v: string) => void;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.muted }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {options.map((opt) => {
          const on = selected === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onPick(opt)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: theme.radius.pill,
                backgroundColor: on ? theme.colors.primary : theme.colors.background,
                borderWidth: 1,
                borderColor: on ? theme.colors.primary : theme.colors.border
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: on ? "#FFFFFF" : theme.colors.ink,
                  textTransform: "capitalize"
                }}
              >
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PickerButton({
  label,
  value,
  placeholder,
  onPress,
  disabled
}: {
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.muted }}>{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          height: 42,
          paddingHorizontal: 12,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: disabled ? theme.colors.border : theme.colors.background,
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1
        })}
      >
        <Text
          style={{
            fontSize: 13,
            color: value ? theme.colors.ink : theme.colors.muted
          }}
        >
          {value ?? placeholder}
        </Text>
      </Pressable>
    </View>
  );
}

function DateFieldWithUnknown({
  label,
  value,
  onChangeText,
  unknown,
  onToggleUnknown
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  unknown: boolean;
  onToggleUnknown: (v: boolean) => void;
}) {
  return (
    <View style={{ gap: 4 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.muted }}>{label}</Text>
        <Pressable
          onPress={() => onToggleUnknown(!unknown)}
          hitSlop={6}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 4,
              borderWidth: 1.5,
              borderColor: unknown ? theme.colors.primary : theme.colors.border,
              backgroundColor: unknown ? theme.colors.primary : "transparent",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {unknown ? <Check size={10} color="#FFFFFF" /> : null}
          </View>
          <Text style={{ fontSize: 10, color: theme.colors.muted }}>I don&apos;t know</Text>
        </Pressable>
      </View>
      <TextInput
        style={[
          inp,
          unknown ? { backgroundColor: theme.colors.border, color: theme.colors.muted } : null
        ]}
        value={unknown ? "" : value}
        onChangeText={onChangeText}
        editable={!unknown}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={theme.colors.muted}
      />
    </View>
  );
}

function OptionPickerModal({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose
}: {
  visible: boolean;
  title: string;
  options: Array<{ value: string; label: string }>;
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "flex-end"
        }}
      >
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: theme.spacing.md,
            paddingHorizontal: theme.spacing.xl,
            paddingBottom: theme.spacing["2xl"],
            maxHeight: "75%"
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: theme.spacing.md
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: theme.colors.ink }}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={theme.colors.ink} />
            </Pressable>
          </View>

          {options.length === 0 ? (
            <Text style={{ textAlign: "center", padding: 24, color: theme.colors.muted }}>
              No options available.
            </Text>
          ) : (
            <ScrollView>
              {options.map((opt) => {
                const on = selected === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => onSelect(opt.value)}
                    style={({ pressed }) => ({
                      paddingVertical: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border,
                      opacity: pressed ? 0.7 : 1
                    })}
                  >
                    <Text style={{ fontSize: 14, color: theme.colors.ink, fontWeight: on ? "700" : "500" }}>
                      {opt.label}
                    </Text>
                    {on ? <Check size={16} color={theme.colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const inp = {
  height: 42,
  paddingHorizontal: 12,
  borderRadius: theme.radius.md,
  borderWidth: 1,
  borderColor: theme.colors.border,
  backgroundColor: theme.colors.background,
  color: theme.colors.ink,
  fontSize: 13
};

export function toShelterPet(v: PetFormValues): Partial<ShelterPet> {
  const ageRaw = v.ageMonths.trim();
  return {
    name: v.name.trim(),
    species: v.species.trim(),
    breed: v.breed.trim(),
    sex: v.sex,
    size: v.size,
    color: "",
    ageMonths: ageRaw ? Number(ageRaw) : undefined,
    description: v.description,
    microchipId: v.microchipId.trim(),
    specialNeeds: v.specialNeeds.trim(),
    isNeutered: v.isNeutered,
    characterTags: v.characterTags,
    photos: v.photos,
    vaccines: v.vaccines,
    status: v.status,
    birthDate: v.birthDateUnknown ? "" : v.birthDate,
    intakeDate: v.intakeDateUnknown ? "" : v.intakeDate
  };
}
