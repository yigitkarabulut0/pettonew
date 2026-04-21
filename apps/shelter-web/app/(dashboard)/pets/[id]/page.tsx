"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PetForm, type PetFormValues } from "@/components/pet-form";
import {
  duplicateShelterListing,
  getShelterPet,
  updateShelterPet
} from "@/lib/api";
import type { ShelterPet } from "@petto/contracts";
import { toShelterPet } from "@/app/(dashboard)/pets/new/page";
import { ListingActionRail, listingCanEdit } from "@/components/listing-actions";

export default function ShelterPetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: pet, isLoading } = useQuery({
    queryKey: ["shelter-pet", id],
    queryFn: () => getShelterPet(id as string),
    enabled: Boolean(id)
  });

  const updateMutation = useMutation({
    mutationFn: (values: Partial<ShelterPet>) =>
      updateShelterPet(id as string, values),
    onSuccess: () => {
      toast.success("Pet updated");
      queryClient.invalidateQueries({ queryKey: ["shelter-pet", id] });
      queryClient.invalidateQueries({ queryKey: ["shelter-pets"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not update")
  });

  // Duplicate: copies all fields from the current listing except photos
  // and microchip ID (per spec). Creates a new draft that the shelter
  // lands on immediately.
  const duplicateMutation = useMutation({
    mutationFn: () => duplicateShelterListing(id as string),
    onSuccess: (pet) => {
      toast.success("Draft created from this listing.");
      router.push(`/pets/${pet.id}`);
    },
    onError: (err: Error) => toast.error(err.message || "Could not duplicate")
  });

  if (isLoading || !pet) {
    return (
      <div className="flex h-full items-center justify-center p-12 text-[var(--muted-foreground)]">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  const defaults: PetFormValues = {
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    sex: pet.sex,
    size: pet.size,
    birthDate: pet.birthDate ?? "",
    birthDateUnknown: !pet.birthDate,
    intakeDate: pet.intakeDate ?? "",
    intakeDateUnknown: !pet.intakeDate,
    ageMonths: pet.ageMonths != null ? String(pet.ageMonths) : "",
    description: pet.description,
    microchipId: pet.microchipId ?? "",
    specialNeeds: pet.specialNeeds ?? "",
    isNeutered: pet.isNeutered,
    isUrgent: !!pet.isUrgent,
    status: pet.status,
    characterTags: pet.characterTags,
    vaccines: pet.vaccines.map((v) => ({
      name: v.name,
      date: v.date,
      notes: v.notes ?? ""
    })),
    photos: pet.photos
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link href="/pets">
              <ArrowLeft className="size-4" /> Back to pets
            </Link>
          </Button>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Edit {pet.name}
          </h1>
        </div>
        <Button
          variant="outline"
          className="gap-1"
          onClick={() => duplicateMutation.mutate()}
          disabled={duplicateMutation.isPending}
        >
          <Copy className="size-4" />
          {duplicateMutation.isPending ? "Duplicating…" : "Duplicate"}
        </Button>
      </div>

      <ListingActionRail pet={pet} />

      {listingCanEdit(pet.listingState) ? (
        <PetForm
          defaultValues={defaults}
          submitLabel="Save changes"
          pending={updateMutation.isPending}
          onSubmit={(values) => updateMutation.mutate(toShelterPet(values))}
        />
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-6 text-sm text-[var(--muted-foreground)]">
          Editing is disabled while this listing is <strong>{pet.listingState}</strong>.
        </div>
      )}
    </div>
  );
}
