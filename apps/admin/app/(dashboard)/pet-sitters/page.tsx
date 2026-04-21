"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LocationPicker, type LocationValue } from "@/components/common/LocationPicker";
import { getAdminPetSitters } from "@/lib/admin-api";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const cookieName = "petto_admin_session";

function getToken() {
  if (typeof document === "undefined") return "";
  const cookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${cookieName}=`));
  return cookie?.split("=")[1] ?? "";
}

async function createAdminPetSitter(sitter: {
  name: string;
  bio: string;
  hourlyRate: number;
  cityLabel: string;
  services: string[];
  phone?: string;
  currency?: string;
  latitude?: number;
  longitude?: number;
}) {
  const res = await fetch(`${apiBaseUrl}/v1/admin/pet-sitters`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(sitter)
  });
  if (!res.ok) throw new Error("Failed to create pet sitter");
  return res.json();
}

const EMPTY_LOCATION: LocationValue = {
  address: "",
  latitude: 0,
  longitude: 0,
  cityLabel: ""
};

type SitterFormValues = {
  name: string;
  bio: string;
  hourlyRate: string;
  cityLabel: string;
  servicesText: string;
  phone: string;
  currency: string;
};

export default function PetSittersPage() {
  const queryClient = useQueryClient();
  const { data: rawSitters, isLoading } = useQuery({
    queryKey: ["admin-pet-sitters"],
    queryFn: getAdminPetSitters
  });
  const sitters = rawSitters ?? [];

  const { register, handleSubmit, reset, setValue, watch } = useForm<SitterFormValues>({
    defaultValues: { currency: "USD" }
  });

  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION);

  const handleLocationChange = (next: LocationValue) => {
    setLocation(next);
    if (next.cityLabel && !watch("cityLabel")) {
      setValue("cityLabel", next.cityLabel);
    }
  };

  const createMutation = useMutation({
    mutationFn: (values: SitterFormValues) =>
      createAdminPetSitter({
        name: values.name.trim(),
        bio: values.bio.trim(),
        hourlyRate: parseFloat(values.hourlyRate) || 0,
        cityLabel: values.cityLabel.trim(),
        services: values.servicesText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        phone: values.phone?.trim() || undefined,
        currency: values.currency || undefined,
        latitude: location.latitude,
        longitude: location.longitude
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pet-sitters"] });
      reset();
      setLocation(EMPTY_LOCATION);
    }
  });

  return (
    <div className="space-y-5">
      <Card className="">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          Pet Sitters
        </p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-[var(--foreground)]">
          Manage pet sitter profiles
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--petto-muted)]">
          Add and manage trusted pet sitters available to users in different cities.
        </p>
      </Card>

      <Card>
        <p className="mb-4 text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          Add Pet Sitter
        </p>
        <form className="grid gap-3" onSubmit={handleSubmit((v) => createMutation.mutate(v))}>
          <div className="grid gap-3 lg:grid-cols-2">
            <Input placeholder="Name" {...register("name", { required: true })} />
            <Input placeholder="City" {...register("cityLabel", { required: true })} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Input
              placeholder="Hourly rate (e.g. 25)"
              type="number"
              step="0.01"
              {...register("hourlyRate", { required: true })}
            />
            <Input
              placeholder="Services (comma separated: walking, sitting, grooming)"
              {...register("servicesText")}
            />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Input placeholder="Phone number" {...register("phone")} />
            <select
              className="flex h-10 w-full rounded-md border border-[var(--petto-border)] bg-white px-3 py-2 text-sm text-[var(--petto-ink)] outline-none focus:ring-2 focus:ring-[var(--petto-primary)]/20"
              {...register("currency")}
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (&euro;)</option>
              <option value="GBP">GBP (&pound;)</option>
              <option value="TRY">TRY (&#8378;)</option>
              <option value="CAD">CAD (C$)</option>
              <option value="AUD">AUD (A$)</option>
              <option value="JPY">JPY (&yen;)</option>
              <option value="CHF">CHF (Fr)</option>
            </select>
          </div>

          <LocationPicker
            value={location}
            onChange={handleLocationChange}
            markerColor="#6d28d9"
            label="Area / address"
            placeholder="Area / address (start typing to search)"
            mapHeight={360}
          />

          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-[var(--petto-border)] bg-white px-4 py-3 text-sm text-[var(--petto-ink)] outline-none placeholder:text-[var(--petto-muted)] focus:ring-2 focus:ring-[var(--petto-primary)]/20"
            placeholder="Bio / description"
            {...register("bio", { required: true })}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding..." : "Add Pet Sitter"}
            </Button>
          </div>
        </form>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--petto-primary)] border-t-transparent" />
        </div>
      )}
      {!isLoading && sitters.length === 0 && (
        <div className="rounded-md border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-12 text-center text-sm text-[var(--petto-muted)]">
          No pet sitters yet. Add the first one above.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {sitters.map((sitter: any) => (
          <Card key={sitter.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-[var(--petto-ink)]">{sitter.name}</p>
                <p className="text-sm text-[var(--petto-muted)]">{sitter.cityLabel}</p>
                {sitter.phone && (
                  <p className="text-sm text-[var(--petto-muted)]">{sitter.phone}</p>
                )}
              </div>
              <span className="shrink-0 text-lg font-semibold text-[var(--petto-primary)]">
                {sitter.currency === "EUR"
                  ? "\u20AC"
                  : sitter.currency === "GBP"
                    ? "\u00A3"
                    : sitter.currency === "TRY"
                      ? "\u20BA"
                      : sitter.currency === "JPY"
                        ? "\u00A5"
                        : sitter.currency === "CHF"
                          ? "Fr"
                          : sitter.currency === "CAD"
                            ? "C$"
                            : sitter.currency === "AUD"
                              ? "A$"
                              : "$"}
                {sitter.hourlyRate}/hr
              </span>
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--petto-muted)]">{sitter.bio}</p>
            {sitter.services && sitter.services.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {sitter.services.map((service: string) => (
                  <Badge key={service} tone="neutral">
                    {service}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
