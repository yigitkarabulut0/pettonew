"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getAdminAdoptions,
  updateAdminAdoptionStatus,
  deleteAdminAdoption
} from "@/lib/admin-api";

export default function AdoptionsPage() {
  const queryClient = useQueryClient();
  const { data: listings = [], isLoading } = useQuery({
    queryKey: ["admin-adoptions"],
    queryFn: getAdminAdoptions
  });

  const updateMutation = useMutation({
    mutationFn: (listingId: string) =>
      updateAdminAdoptionStatus(listingId, "adopted"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-adoptions"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (listingId: string) => deleteAdminAdoption(listingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-adoptions"] });
    }
  });

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">
          Adoptions
        </p>
        <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">
          Pet adoption listings
        </h1>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--petto-primary)] border-t-transparent" />
        </div>
      )}
      {!isLoading && listings.length === 0 && (
        <div className="rounded-[22px] border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-12 text-center text-sm text-[var(--petto-muted)]">
          No adoption listings found.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {listings.map((listing) => (
          <Card key={listing.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-[var(--petto-ink)]">
                    {listing.petName}
                  </p>
                  <Badge
                    tone={
                      listing.status === "active" ? "warning" : "success"
                    }
                  >
                    {listing.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--petto-muted)]">
                  {listing.petSpecies}
                  {listing.petBreed ? ` \u00B7 ${listing.petBreed}` : ""}{" "}
                  \u00B7 {listing.petAge}{" "}
                  {listing.petAge === 1 ? "yr" : "yrs"} \u00B7{" "}
                  {listing.gender}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {listing.status === "active" && (
                  <Button
                    variant="ghost"
                    className="text-emerald-700 hover:text-emerald-800"
                    onClick={() => updateMutation.mutate(listing.id)}
                    disabled={updateMutation.isPending}
                  >
                    Mark Adopted
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete listing for "${listing.petName}"?`
                      )
                    ) {
                      deleteMutation.mutate(listing.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </Button>
              </div>
            </div>
            {listing.description && (
              <p className="mt-2 line-clamp-2 text-sm text-[var(--petto-muted)]">
                {listing.description}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between text-xs text-[var(--petto-muted)]">
              <div className="space-y-0.5">
                {listing.location && <p>Location: {listing.location}</p>}
                {listing.userName && <p>Listed by: {listing.userName}</p>}
              </div>
              <p className="uppercase tracking-[0.18em]">
                {new Date(listing.createdAt).toLocaleDateString("en-GB")}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
