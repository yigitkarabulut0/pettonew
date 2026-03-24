"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPets, updatePetVisibility } from "@/lib/admin-api";

export default function PetsPage() {
  const queryClient = useQueryClient();
  const { data: pets = [] } = useQuery({
    queryKey: ["admin-pets"],
    queryFn: getPets
  });
  const mutation = useMutation({
    mutationFn: ({ petId, hidden }: { petId: string; hidden: boolean }) => updatePetVisibility(petId, hidden),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pets"] });
    }
  });

  return (
    <Card>
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Pets</p>
      <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">Discovery inventory</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pets.map((pet) => (
          <div key={pet.id} className="rounded-[28px] border border-[var(--petto-border)] bg-white/70 p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl text-[var(--petto-ink)]">{pet.name}</h2>
              <Badge tone={pet.isHidden ? "warning" : "success"}>{pet.isHidden ? "Hidden" : "Visible"}</Badge>
            </div>
            <p className="mt-2 text-sm text-[var(--petto-secondary)]">
              {pet.speciesLabel} • {pet.breedLabel} • {pet.cityLabel}
            </p>
            <p className="mt-3 text-sm leading-6 text-[var(--petto-muted)]">{pet.bio}</p>
            <div className="mt-5 flex gap-2">
              <Button variant="ghost" onClick={() => mutation.mutate({ petId: pet.id, hidden: !pet.isHidden })}>
                {pet.isHidden ? "Show in discovery" : "Hide from discovery"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

