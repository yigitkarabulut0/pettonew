"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PetWizard } from "@/components/pet-wizard";
import type { ShelterPet } from "@petto/contracts";
import type { PetFormValues } from "@/components/pet-form";

// Keeps the linear-form edit flow (`/pets/[id]`) compatible: that page
// still imports `toShelterPet` from here to convert the PetForm's view
// model into an API payload. Creation itself has moved to the wizard.
export function toShelterPet(values: PetFormValues): Partial<ShelterPet> {
  const age = values.ageMonths.trim();
  return {
    name: values.name.trim(),
    species: values.species.trim(),
    breed: values.breed.trim(),
    sex: values.sex,
    size: values.size,
    color: "",
    birthDate: values.birthDateUnknown ? "" : values.birthDate,
    ageMonths: age ? Number(age) : undefined,
    description: values.description,
    microchipId: values.microchipId.trim(),
    specialNeeds: values.specialNeeds.trim(),
    isNeutered: values.isNeutered,
    isUrgent: values.isUrgent,
    intakeDate: values.intakeDateUnknown ? "" : values.intakeDate,
    status: values.status,
    characterTags: values.characterTags,
    photos: values.photos.filter(
      (u): u is string => typeof u === "string" && u.trim().length > 0
    ),
    vaccines: values.vaccines
      .filter((v) => v.name.trim())
      .map((v) => ({ name: v.name.trim(), date: v.date, notes: v.notes }))
  };
}

// Creation flow is now a guided wizard. The linear PetForm is retained
// only for /pets/[petId] edits — that page still wants a single-surface
// editor since the shelter has already published the listing and is
// tweaking fields. New listings must go through the 9-step wizard so
// jurisdiction compliance is enforced step-by-step.

export default function NewPetPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href="/pets">
            <ArrowLeft className="size-4" /> Back to pets
          </Link>
        </Button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Add a new pet</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Follow the guided steps. We check each field against jurisdictional
          rules so surprise rejections after publish become rare.
        </p>
      </div>
      <div className="mt-6">
        <PetWizard />
      </div>
    </div>
  );
}
