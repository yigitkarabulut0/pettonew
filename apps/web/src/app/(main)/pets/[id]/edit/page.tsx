"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import type {
  Pet,
  PetSpecies,
  PetBreed,
  PetCompatibilityOption,
  PetHobbyOption,
  ActivityLevel,
} from "@petto/types";
import { ACTIVITY_LABELS } from "@petto/types";
import { Card, CardContent, CardHeader, CardTitle } from "@petto/ui";
import { Input } from "@petto/ui";
import { Label } from "@petto/ui";
import { Button } from "@petto/ui";
import { Badge } from "@petto/ui";
import { Checkbox } from "@petto/ui";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@petto/ui";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function EditPetPage() {
  const router = useRouter();
  const params = useParams();
  const petId = params.id as string;

  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [speciesId, setSpeciesId] = useState("");
  const [breedId, setBreedId] = useState("");
  const [age, setAge] = useState("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(3);
  const [neutered, setNeutered] = useState(false);
  const [selectedCompatIds, setSelectedCompatIds] = useState<string[]>([]);
  const [selectedHobbyIds, setSelectedHobbyIds] = useState<string[]>([]);

  const [speciesList, setSpeciesList] = useState<PetSpecies[]>([]);
  const [breeds, setBreeds] = useState<PetBreed[]>([]);
  const [compatibilities, setCompatibilities] = useState<
    PetCompatibilityOption[]
  >([]);
  const [hobbies, setHobbies] = useState<PetHobbyOption[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<Pet>(`/pets/${petId}`),
      api.get<PetSpecies[]>("/options/species"),
      api.get<PetCompatibilityOption[]>("/options/compatibilities"),
      api.get<PetHobbyOption[]>("/options/hobbies"),
    ])
      .then(([pet, sp, comp, hob]) => {
        setName(pet.name);
        setSpeciesId(pet.speciesId);
        setBreedId(pet.breedId || "");
        setAge(pet.age !== null ? String(pet.age) : "");
        setActivityLevel(pet.activityLevel);
        setNeutered(pet.neutered);
        setSelectedCompatIds(pet.compatibilities.map((c) => c.id));
        setSelectedHobbyIds(pet.hobbies.map((h) => h.id));
        setSpeciesList(sp);
        setCompatibilities(comp);
        setHobbies(hob);

        if (pet.breedId) {
          return api.get<PetBreed[]>(`/options/breeds/${pet.speciesId}`).then(
            setBreeds
          );
        }
      })
      .catch(() => setError("Failed to load pet data"))
      .finally(() => setLoading(false));
  }, [petId]);

  useEffect(() => {
    if (!speciesId || loading) return;
    api
      .get<PetBreed[]>(`/options/breeds/${speciesId}`)
      .then(setBreeds)
      .catch(() => setBreeds([]));
  }, [speciesId, loading]);

  const toggleCheckbox = (
    id: string,
    selected: string[],
    setSelected: (ids: string[]) => void
  ) => {
    setSelected(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !speciesId) return;
    setSubmitting(true);
    setError("");
    try {
      await api.put<Pet>(`/pets/${petId}`, {
        name,
        speciesId,
        breedId: breedId || undefined,
        age: age ? Number(age) : undefined,
        activityLevel,
        neutered,
        compatibilityIds: selectedCompatIds,
        hobbyIds: selectedHobbyIds,
      });
      router.push("/profile/pets");
    } catch {
      setError("Failed to update pet. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
      <Card>
        <CardHeader>
          <CardTitle>Edit Pet</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pet name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Species *</Label>
              <Select value={speciesId} onValueChange={(v) => { setSpeciesId(v); setBreedId(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select species" />
                </SelectTrigger>
                <SelectContent>
                  {speciesList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Breed</Label>
              <Select
                value={breedId}
                onValueChange={setBreedId}
                disabled={!speciesId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={!speciesId ? "Select species first" : "Select breed"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {breeds.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="age">Age (years)</Label>
              <Input
                id="age"
                type="number"
                min="0"
                max="30"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-2">
              <Label>
                Activity Level:{" "}
                <Badge variant="secondary" className="ml-1">
                  {ACTIVITY_LABELS[activityLevel]}
                </Badge>
              </Label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setActivityLevel(level as ActivityLevel)}
                    className={`flex h-9 flex-1 items-center justify-center rounded-md border text-xs transition-colors ${
                      activityLevel === level
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-muted"
                    }`}
                  >
                    {ACTIVITY_LABELS[level as ActivityLevel].split(" ").pop()}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                checked={neutered}
                onCheckedChange={setNeutered}
              />
              <Label className="cursor-pointer" onClick={() => setNeutered(!neutered)}>
                Neutered / Spayed
              </Label>
            </div>

            {compatibilities.length > 0 && (
              <div className="space-y-2">
                <Label>Compatibilities</Label>
                <div className="flex flex-wrap gap-2">
                  {compatibilities.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        toggleCheckbox(c.id, selectedCompatIds, setSelectedCompatIds)
                      }
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        selectedCompatIds.includes(c.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hobbies.length > 0 && (
              <div className="space-y-2">
                <Label>Hobbies</Label>
                <div className="flex flex-wrap gap-2">
                  {hobbies.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() =>
                        toggleCheckbox(h.id, selectedHobbyIds, setSelectedHobbyIds)
                      }
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        selectedHobbyIds.includes(h.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
