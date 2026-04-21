// Pet edit / manage screen. Mirrors shelter-web's detail page:
// state-aware action rail (pause/publish/mark-adopted/archive/delete),
// soft-delete with 30-day restore window, pending_review lock, and
// rejection reason banner — all on top of the existing PetForm editor.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Copy } from "lucide-react-native";

import { PetForm, emptyPet, toShelterPet, type PetFormValues } from "@/components/pet-form";
import {
  ListingActionRail,
  listingCanEdit
} from "@/components/listing-actions";
import {
  duplicateShelterListing,
  getShelterPet,
  updateShelterPet
} from "@/lib/api";
import { theme, useTheme } from "@/lib/theme";

export default function EditPetScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const petId = Array.isArray(id) ? id[0] : id;
  const t = useTheme();

  const { data: pet, isLoading } = useQuery({
    queryKey: ["shelter-pet", petId],
    queryFn: () => getShelterPet(petId as string),
    enabled: Boolean(petId)
  });

  const [values, setValues] = useState<PetFormValues>(emptyPet);
  useEffect(() => {
    if (pet) {
      setValues({
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        sex: pet.sex,
        size: pet.size,
        ageMonths: pet.ageMonths != null ? String(pet.ageMonths) : "",
        birthDate: pet.birthDate ?? "",
        birthDateUnknown: !pet.birthDate,
        intakeDate: pet.intakeDate ?? "",
        intakeDateUnknown: !pet.intakeDate,
        description: pet.description,
        microchipId: pet.microchipId ?? "",
        specialNeeds: pet.specialNeeds ?? "",
        isNeutered: pet.isNeutered,
        characterTags: pet.characterTags,
        photos: pet.photos,
        vaccines: pet.vaccines,
        status: pet.status
      });
    }
  }, [pet]);

  const updateMut = useMutation({
    mutationFn: () => updateShelterPet(petId as string, toShelterPet(values)),
    onSuccess: () => {
      Alert.alert("Saved");
      queryClient.invalidateQueries({ queryKey: ["shelter-pets"] });
      queryClient.invalidateQueries({ queryKey: ["shelter-pet", petId] });
    },
    onError: (err: Error) => Alert.alert("Could not save", err.message)
  });

  const duplicateMut = useMutation({
    mutationFn: () => duplicateShelterListing(petId as string),
    onSuccess: (newPet) => {
      Alert.alert("Duplicated", "A new draft was created.");
      queryClient.invalidateQueries({ queryKey: ["shelter-pets"] });
      router.replace(`/(app)/pets/${newPet.id}` as any);
    },
    onError: (err: Error) => Alert.alert("Could not duplicate", err.message)
  });

  if (isLoading || !pet) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.colors.background
        }}
      >
        <ActivityIndicator color={t.colors.primary} />
      </SafeAreaView>
    );
  }

  const editable = listingCanEdit(pet.listingState);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: t.colors.border,
          justifyContent: "space-between"
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing.md,
            flex: 1
          }}
        >
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ArrowLeft size={22} color={t.colors.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 16, fontWeight: "700", color: t.colors.ink }}
              numberOfLines={1}
            >
              {pet.name}
            </Text>
            <StateBadge state={pet.listingState} />
          </View>
        </View>
        <Pressable
          onPress={() => duplicateMut.mutate()}
          disabled={duplicateMut.isPending}
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            opacity: pressed ? 0.7 : duplicateMut.isPending ? 0.5 : 1
          })}
        >
          <Copy size={16} color={t.colors.muted} />
          <Text style={{ fontSize: 11, color: t.colors.muted, fontWeight: "600" }}>
            {duplicateMut.isPending ? "…" : "Duplicate"}
          </Text>
        </Pressable>
      </View>

      {/* Scroll body: rail at top, then form (if editable) or locked notice */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: theme.spacing["2xl"] }}
        keyboardShouldPersistTaps="handled"
      >
        <ListingActionRail pet={pet} />

        {editable ? (
          <View style={{ marginTop: theme.spacing.md }}>
            <PetForm
              value={values}
              onChange={setValues}
              onSubmit={() => updateMut.mutate()}
              submitLabel="Save changes"
              pending={updateMut.isPending}
            />
          </View>
        ) : (
          <View
            style={{
              marginHorizontal: theme.spacing.xl,
              marginTop: theme.spacing.lg,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.lg,
              backgroundColor: t.colors.background,
              borderWidth: 1,
              borderColor: t.colors.border
            }}
          >
            <Text style={{ fontSize: 13, color: t.colors.muted, textAlign: "center" }}>
              Editing is disabled while this listing is{" "}
              <Text style={{ fontWeight: "700" }}>{pet.listingState}</Text>.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Small pill that shows the current listing_state under the pet name.
function StateBadge({ state }: { state: string }) {
  const t = useTheme();
  const palette: Record<string, { bg: string; fg: string }> = {
    draft: { bg: t.colors.border, fg: t.colors.muted },
    pending_review: { bg: t.colors.warningBg, fg: t.colors.warning },
    published: { bg: t.colors.successBg, fg: t.colors.success },
    paused: { bg: "rgba(71, 85, 105, 0.1)", fg: "#475569" },
    adopted: { bg: "rgba(13, 148, 136, 0.1)", fg: "#0F766E" },
    archived: { bg: t.colors.border, fg: t.colors.muted },
    rejected: { bg: t.colors.dangerBg, fg: t.colors.danger }
  };
  const p = palette[state] ?? palette.draft!;
  return (
    <View
      style={{
        marginTop: 2,
        alignSelf: "flex-start",
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: theme.radius.pill,
        backgroundColor: p.bg
      }}
    >
      <Text style={{ fontSize: 9, fontWeight: "700", color: p.fg, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {state.replace(/_/g, " ")}
      </Text>
    </View>
  );
}
