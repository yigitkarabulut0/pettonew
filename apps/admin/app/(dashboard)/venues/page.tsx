"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createVenue, deleteVenue, getVenues } from "@/lib/admin-api";

export default function VenuesPage() {
  const queryClient = useQueryClient();
  const { data: venues = [] } = useQuery({
    queryKey: ["admin-venues"],
    queryFn: getVenues
  });
  const { register, handleSubmit, reset } = useForm<{
    name: string;
    category: string;
    description: string;
    cityLabel: string;
    address: string;
    latitude: string;
    longitude: string;
    imageUrl: string;
  }>({
    defaultValues: {
      category: "park"
    }
  });

  const createMutation = useMutation({
    mutationFn: (values: {
      name: string;
      category: string;
      description: string;
      cityLabel: string;
      address: string;
      latitude: string;
      longitude: string;
      imageUrl: string;
    }) =>
      createVenue({
        ...values,
        latitude: Number(values.latitude),
        longitude: Number(values.longitude),
        imageUrl: values.imageUrl || undefined
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      reset();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (venueId: string) => deleteVenue(venueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    }
  });

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Explore venues</p>
        <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">Curate pet-friendly places for the map</h1>
      </Card>

      <Card>
        <form className="grid gap-3 lg:grid-cols-2" onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
          <Input placeholder="Venue name" {...register("name")} />
          <Input placeholder="Category (park, cafe, bar...)" {...register("category")} />
          <Input placeholder="City" {...register("cityLabel")} />
          <Input placeholder="Address" {...register("address")} />
          <Input placeholder="Latitude" {...register("latitude")} />
          <Input placeholder="Longitude" {...register("longitude")} />
          <Input placeholder="Image URL" {...register("imageUrl")} />
          <Input placeholder="Description" {...register("description")} />
          <div className="lg:col-span-2">
            <Button type="submit">Add venue</Button>
          </div>
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {venues.map((venue) => (
          <Card key={venue.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-[var(--petto-ink)]">{venue.name}</p>
                <p className="text-sm text-[var(--petto-muted)]">
                  {venue.category} • {venue.cityLabel}
                </p>
              </div>
              <Button variant="ghost" className="text-rose-700 hover:text-rose-800" onClick={() => deleteMutation.mutate(venue.id)}>
                Delete
              </Button>
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--petto-muted)]">{venue.description}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--petto-muted)]">
              {venue.currentCheckIns.length} live check-ins
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
