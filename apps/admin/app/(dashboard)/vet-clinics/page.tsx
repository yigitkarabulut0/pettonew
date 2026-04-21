"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LocationPicker, type LocationValue } from "@/components/common/LocationPicker";
import {
  getAdminVetClinics,
  createAdminVetClinic,
  deleteAdminVetClinic
} from "@/lib/admin-api";

type ClinicFormValues = {
  name: string;
  phone: string;
  city: string;
  website: string;
  isEmergency: boolean;
};

const EMPTY_LOCATION: LocationValue = {
  address: "",
  latitude: 0,
  longitude: 0,
  cityLabel: ""
};

export default function VetClinicsPage() {
  const queryClient = useQueryClient();

  const { data: clinics = [], isLoading } = useQuery({
    queryKey: ["admin-vet-clinics"],
    queryFn: getAdminVetClinics
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm<ClinicFormValues>({
    defaultValues: { isEmergency: false }
  });

  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION);

  const handleLocationChange = (next: LocationValue) => {
    setLocation(next);
    if (next.cityLabel && !watch("city")) {
      setValue("city", next.cityLabel);
    }
  };

  /* ---- hours formatter ---- */
  const formatHours = (values: any) => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const parts = days
      .map((day) => {
        const open = values[`hours_${day}_open`];
        const close = values[`hours_${day}_close`];
        if (open && close) return `${day} ${open}-${close}`;
        return null;
      })
      .filter(Boolean);
    return parts.join(", ");
  };

  /* ---- mutations ---- */
  const createMutation = useMutation({
    mutationFn: (values: ClinicFormValues) =>
      createAdminVetClinic({
        name: values.name,
        phone: values.phone,
        address: location.address,
        city: values.city,
        isEmergency: values.isEmergency,
        website: values.website || undefined,
        hours: formatHours(values) || undefined,
        latitude: location.latitude,
        longitude: location.longitude
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-vet-clinics"] });
      reset();
      setLocation(EMPTY_LOCATION);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (clinicId: string) => deleteAdminVetClinic(clinicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-vet-clinics"] });
    }
  });

  /* ---- render ---- */
  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          Vet Clinics
        </p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-[var(--foreground)]">
          Manage veterinary clinic listings
        </h1>
      </Card>

      {/* Create Form */}
      <Card>
        <form
          className="grid gap-3 lg:grid-cols-2"
          onSubmit={handleSubmit((values) => createMutation.mutate(values))}
        >
          {/* Name */}
          <Input placeholder="Clinic name" {...register("name")} />

          {/* Phone */}
          <Input placeholder="Phone number" {...register("phone")} />

          {/* City */}
          <Input placeholder="City" {...register("city")} />

          {/* Website */}
          <Input placeholder="Website (optional)" {...register("website")} />

          {/* Location picker — address + map + draggable marker */}
          <div className="lg:col-span-2">
            <LocationPicker
              value={location}
              onChange={handleLocationChange}
              markerColor="#A14632"
              label="Clinic address"
              placeholder="Address (start typing to search)"
              mapHeight={360}
            />
          </div>

          {/* Operating Hours */}
          <div className="space-y-2 lg:col-span-2">
            <label className="text-sm font-semibold text-[var(--petto-ink)]">
              Operating Hours
            </label>
            <div className="grid gap-2">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div key={day} className="flex items-center gap-3">
                  <span className="w-10 text-sm font-medium text-[var(--petto-muted)]">{day}</span>
                  <input
                    type="time"
                    className="rounded-lg border border-[var(--petto-border)] bg-white px-3 py-1.5 text-sm"
                    {...register(`hours_${day}_open` as any)}
                  />
                  <span className="text-sm text-[var(--petto-muted)]">to</span>
                  <input
                    type="time"
                    className="rounded-lg border border-[var(--petto-border)] bg-white px-3 py-1.5 text-sm"
                    {...register(`hours_${day}_close` as any)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Emergency checkbox */}
          <div className="flex items-center gap-3 lg:col-span-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                {...register("isEmergency")}
                className="h-4 w-4 rounded border-[var(--petto-border)]"
              />
              <span className="text-sm font-medium text-[var(--petto-ink)]">Emergency Clinic</span>
            </label>
          </div>

          {/* Submit */}
          <div className="lg:col-span-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding..." : "Add clinic"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--petto-primary)] border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && clinics.length === 0 && (
        <div className="rounded-md border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-12 text-center text-sm text-[var(--petto-muted)]">
          No vet clinics found. Add your first clinic above.
        </div>
      )}

      {/* Clinic grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {clinics.map((clinic) => (
          <Card key={clinic.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-[var(--petto-ink)]">{clinic.name}</p>
                  {clinic.isEmergency && <Badge tone="warning">Emergency</Badge>}
                </div>
                <p className="mt-1 text-sm text-[var(--petto-muted)]">{clinic.address}</p>
                <p className="text-sm text-[var(--petto-muted)]">{clinic.city}</p>
                {clinic.phone && (
                  <p className="mt-1 text-sm text-[var(--petto-ink)]">{clinic.phone}</p>
                )}
                {clinic.hours && (
                  <p className="mt-1 text-xs text-[var(--petto-muted)]">{clinic.hours}</p>
                )}
                {clinic.website && (
                  <a
                    href={clinic.website}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-xs text-[var(--petto-primary)] underline"
                  >
                    {clinic.website}
                  </a>
                )}
              </div>
              <Button
                variant="ghost"
                className="shrink-0 text-rose-700 hover:text-rose-800"
                onClick={() => deleteMutation.mutate(clinic.id)}
                disabled={deleteMutation.isPending}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
