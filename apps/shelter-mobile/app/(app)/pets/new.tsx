import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import { PetForm, emptyPet, toShelterPet, type PetFormValues } from "@/components/pet-form";
import { createShelterPet } from "@/lib/api";
import { theme } from "@/lib/theme";

export default function NewPetScreen() {
  const router = useRouter();
  const [values, setValues] = useState<PetFormValues>(emptyPet);
  const mutation = useMutation({
    mutationFn: () => createShelterPet(toShelterPet(values)),
    onSuccess: () => {
      Alert.alert("Pet added");
      router.back();
    },
    onError: (err: Error) => Alert.alert("Could not save", err.message)
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={22} color={theme.colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.ink }}>
          New pet
        </Text>
      </View>
      <PetForm
        value={values}
        onChange={setValues}
        onSubmit={() => {
          if (!values.name.trim()) return Alert.alert("Name is required");
          mutation.mutate();
        }}
        submitLabel="Save pet"
        pending={mutation.isPending}
      />
    </SafeAreaView>
  );
}
