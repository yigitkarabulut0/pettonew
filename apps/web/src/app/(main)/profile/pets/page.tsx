"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Pet } from "@petto/types";
import { ACTIVITY_LABELS } from "@petto/types";
import { Card, CardContent } from "@petto/ui";
import { Button } from "@petto/ui";
import { Progress } from "@petto/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@petto/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@petto/ui";
import { ArrowLeft, Loader2, Plus, Pencil, Trash2, PawPrint } from "lucide-react";

export default function MyPetsPage() {
  const router = useRouter();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Pet | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPets = () => {
    api
      .get<Pet[]>("/pets")
      .then(setPets)
      .catch(() => setError("Failed to load pets"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPets();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/pets/${deleteTarget.id}`);
      setPets((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setError("Failed to delete pet");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">My Pets</h1>
        <Link href="/pets/new">
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Add Pet
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error && pets.length === 0 ? (
        <div className="py-12 text-center text-sm text-destructive">{error}</div>
      ) : pets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <PawPrint className="mb-3 h-12 w-12 text-pink-300" />
          <p className="mb-1 text-lg font-medium">No pets yet</p>
          <p className="mb-4 text-sm">Add your first pet to get started</p>
          <Link href="/pets/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add Pet
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {pets.map((pet) => (
            <Card key={pet.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <Avatar className="h-14 w-14 shrink-0">
                  <AvatarImage src={pet.avatarUrl || undefined} />
                  <AvatarFallback className="text-lg">
                    {pet.name[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">{pet.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {pet.species.name}
                        {pet.breed ? ` · ${pet.breed.name}` : ""}
                        {pet.age !== null ? ` · ${pet.age}y` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Link href={`/pets/${pet.id}/edit`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(pet)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Activity</span>
                      <span>{ACTIVITY_LABELS[pet.activityLevel]}</span>
                    </div>
                    <Progress value={(pet.activityLevel / 5) * 100} className="h-1.5" />
                  </div>
                  {(pet.neutered || pet.compatibilities.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {pet.neutered && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                          Neutered
                        </span>
                      )}
                      {pet.compatibilities.map((c) => (
                        <span
                          key={c.id}
                          className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium"
                        >
                          {c.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Pet</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">{deleteTarget?.name}</span>? This
              action cannot be undone. All match history for this pet will be
              lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
