"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Pet, SwipeCandidate, SwipeDirection, ActivityLevel } from "@petto/types";
import { ACTIVITY_LABELS } from "@petto/types";
import { Card } from "@petto/ui";
import { Button } from "@petto/ui";
import { Badge } from "@petto/ui";
import { Progress } from "@petto/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@petto/ui";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@petto/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@petto/ui";
import {
  Heart,
  X,
  Loader2,
  PartyPopper,
  Dog,
  PawPrint,
  TrendingUp,
  MapPin,
  Plus,
} from "lucide-react";

export default function MatchPage() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string>("");
  const [candidates, setCandidates] = useState<SwipeCandidate[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [swiping, setSwiping] = useState(false);
  const [matchedPet, setMatchedPet] = useState<Pet | null>(null);
  const [showMatchDialog, setShowMatchDialog] = useState(false);

  useEffect(() => {
    api
      .get<Pet[]>("/pets")
      .then((res) => {
        setPets(res);
        if (res.length > 0) setSelectedPetId(res[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fetchCandidates = useCallback(
    (petId: string) => {
      if (!petId) return;
      setLoading(true);
      setCurrentIndex(0);
      api
        .get<SwipeCandidate[]>("/match/candidates", { pet_id: petId })
        .then(setCandidates)
        .catch(() => setCandidates([]))
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    if (selectedPetId) fetchCandidates(selectedPetId);
  }, [selectedPetId, fetchCandidates]);

  const handleSwipe = async (direction: SwipeDirection) => {
    const candidate = candidates[currentIndex];
    if (!candidate || swiping) return;

    setSwiping(true);
    try {
      const res = await api.post<{ is_match: boolean }>("/match/match/swipe", {
        swiper_pet_id: selectedPetId,
        swiped_pet_id: candidate.pet.id,
        direction,
      });
      if (res.is_match) {
        setMatchedPet(candidate.pet);
        setShowMatchDialog(true);
      }
    } catch {
      // ignore
    } finally {
      setCurrentIndex((i) => i + 1);
      setSwiping(false);
    }
  };

  const currentCandidate = candidates[currentIndex];

  const renderActivityBar = (level: ActivityLevel) => {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Activity</span>
          <span>{ACTIVITY_LABELS[level]}</span>
        </div>
        <Progress value={(level / 5) * 100} className="h-1.5" />
      </div>
    );
  };

  if (loading && pets.length === 0) {
    return (
      <div className="flex h-[calc(100vh-80px)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-4">
        <h1 className="mb-4 text-xl font-bold">Match</h1>
        <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center rounded-lg border-2 border-dashed bg-muted/30">
          <div className="text-center text-muted-foreground">
            <PawPrint className="mx-auto mb-2 h-12 w-12 text-pink-300" />
            <p className="text-lg font-medium">No Pets Yet</p>
            <p className="mb-4 text-sm">Add a pet profile to start matching</p>
            <Link href="/pets/new">
              <Button>
                <Plus className="h-4 w-4" />
                Add Your Pet
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Match</h1>
        {pets.length > 1 && (
          <Select value={selectedPetId} onValueChange={fetchCandidates}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select pet" />
            </SelectTrigger>
            <SelectContent>
              {pets.map((pet) => (
                <SelectItem key={pet.id} value={pet.id}>
                  {pet.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="relative flex h-[calc(100vh-200px)] items-center justify-center">
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : !currentCandidate ? (
          <div className="text-center text-muted-foreground">
            <Dog className="mx-auto mb-2 h-12 w-12 text-pink-300" />
            <p className="text-lg font-medium">No more pets</p>
            <p className="text-sm">Check back later for new matches</p>
          </div>
        ) : (
          <>
            {candidates
              .slice(currentIndex, currentIndex + 2)
              .reverse()
              .map((c, revIdx) => {
                const isActive = revIdx === 0;
                const pet = c.pet;
                return (
                  <Card
                    key={pet.id}
                    className={`absolute w-full max-w-sm transition-all ${
                      isActive
                        ? "z-10 scale-100"
                        : "z-0 scale-95 opacity-50"
                    }`}
                  >
                    <div className="flex flex-col items-center p-6">
                      <Avatar className="h-28 w-28">
                        <AvatarImage src={pet.avatarUrl || undefined} />
                        <AvatarFallback className="text-3xl">
                          {pet.name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <h2 className="mt-3 text-xl font-bold">{pet.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {pet.species.name}
                        {pet.breed ? ` · ${pet.breed.name}` : ""}
                        {pet.age !== null ? ` · ${pet.age}y` : ""}
                      </p>

                      <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                        <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                        <span>{c.compatibilityScore}% compatible</span>
                        <span className="mx-1">·</span>
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{c.distance} km away</span>
                      </div>

                      <div className="mt-4 w-full space-y-3">
                        {renderActivityBar(pet.activityLevel)}

                        {pet.compatibilities.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {pet.compatibilities.map((c) => (
                              <Badge key={c.id} variant="secondary" className="text-xs">
                                {c.name}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {pet.hobbies.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {pet.hobbies.map((h) => (
                              <Badge key={h.id} variant="outline" className="text-xs">
                                {h.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
          </>
        )}
      </div>

      {currentCandidate && (
        <div className="mt-4 flex justify-center gap-6">
          <button
            onClick={() => handleSwipe("pass")}
            disabled={swiping}
            className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-destructive/30 bg-card shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <X className="h-8 w-8 text-destructive" />
          </button>
          <button
            onClick={() => handleSwipe("like")}
            disabled={swiping}
            className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-pink-300 bg-card shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <Heart className="h-8 w-8 text-pink-500" />
          </button>
        </div>
      )}

      <Dialog open={showMatchDialog} onOpenChange={setShowMatchDialog}>
        <DialogContent className="text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2">
              <PartyPopper className="h-6 w-6 text-yellow-500" />
              It&apos;s a Match!
            </DialogTitle>
            <DialogDescription>
              You and {matchedPet?.name} liked each other
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-4 py-2">
            <Avatar className="h-20 w-20">
              <AvatarImage src={matchedPet?.avatarUrl || undefined} />
              <AvatarFallback className="text-2xl">
                {matchedPet?.name?.[0]}
              </AvatarFallback>
            </Avatar>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button variant="outline" onClick={() => setShowMatchDialog(false)}>
              Keep Swiping
            </Button>
            <Button onClick={() => setShowMatchDialog(false)}>
              Send Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
