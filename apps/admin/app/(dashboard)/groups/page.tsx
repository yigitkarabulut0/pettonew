"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LocationPicker, type LocationValue } from "@/components/common/LocationPicker";
import { createAdminGroup, getAdminGroups, getTaxonomy } from "@/lib/admin-api";

interface GroupFormValues {
  name: string;
  description: string;
  petType: string;
  cityLabel: string;
  code: string;
  isPrivate: boolean;
}

const EMPTY_LOCATION: LocationValue = {
  address: "",
  latitude: 0,
  longitude: 0,
  cityLabel: ""
};

export default function GroupsPage() {
  const queryClient = useQueryClient();
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["admin-groups"],
    queryFn: getAdminGroups
  });
  const { data: speciesList = [] } = useQuery({
    queryKey: ["taxonomy", "species"],
    queryFn: () => getTaxonomy("species")
  });
  const { register, handleSubmit, reset, setValue, watch } = useForm<GroupFormValues>({
    defaultValues: {
      petType: "all",
      cityLabel: "",
      code: "",
      isPrivate: false
    }
  });

  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION);

  const handleLocationChange = (next: LocationValue) => {
    setLocation(next);
    if (next.cityLabel && !watch("cityLabel")) {
      setValue("cityLabel", next.cityLabel);
    }
  };

  const createMutation = useMutation({
    mutationFn: (values: GroupFormValues) =>
      createAdminGroup({
        name: values.name,
        description: values.description,
        petType: values.petType,
        cityLabel: values.cityLabel || undefined,
        latitude: location.latitude,
        longitude: location.longitude,
        code: values.code || undefined,
        isPrivate: values.isPrivate
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
      reset();
      setLocation(EMPTY_LOCATION);
    }
  });

  return (
    <div className="space-y-5">
      <Card className="">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Groups</p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-[var(--foreground)]">Community groups for pet owners</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--petto-muted)]">
          Create groups with location data so users can discover nearby communities. Private groups require a code to join.
        </p>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-[var(--petto-ink)]">Create Group</h2>
        <form className="space-y-4" onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
          {/* Row 1: Name + Pet Type */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Input placeholder="Group name" {...register("name", { required: true })} />
            <select
              className="flex h-11 w-full rounded-md border border-[var(--petto-border)] bg-white px-4 text-sm text-[var(--petto-ink)] outline-none"
              {...register("petType")}
            >
              <option value="all">All pets</option>
              {speciesList.map((s) => (
                <option key={s.id} value={s.slug}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Row 2: Description */}
          <Input placeholder="Description" {...register("description", { required: true })} />

          {/* Row 3: Location */}
          <div className="rounded-xl border border-[var(--petto-border)] bg-white/60 p-4 space-y-3">
            <p className="text-sm font-semibold text-[var(--petto-ink)]">Location</p>
            <LocationPicker
              value={location}
              onChange={handleLocationChange}
              markerColor="#6d28d9"
              label="Group base location"
              placeholder="Search a city or neighbourhood…"
              mapHeight={260}
            />
            <Input placeholder="City name" {...register("cityLabel")} />
          </div>

          {/* Row 4: Privacy */}
          <div className="rounded-xl border border-[var(--petto-border)] bg-white/60 p-4 space-y-3">
            <p className="text-sm font-semibold text-[var(--petto-ink)]">Privacy</p>
            <div className="grid gap-3 lg:grid-cols-2">
              <Input placeholder="Private join code (optional)" {...register("code")} />
              <label className="flex items-center gap-3 rounded-xl border border-[var(--petto-border)] bg-white px-4 py-3 cursor-pointer">
                <input type="checkbox" {...register("isPrivate")} className="h-4 w-4 rounded accent-[var(--petto-primary)]" />
                <span className="text-sm text-[var(--petto-ink)]">Private group (hidden from public listing)</span>
              </label>
            </div>
          </div>

          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create group"}
          </Button>
        </form>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--petto-primary)] border-t-transparent" />
        </div>
      )}
      {!isLoading && groups.length === 0 && (
        <div className="rounded-md border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-12 text-center text-sm text-[var(--petto-muted)]">
          No groups created yet.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.id}>
            <div>
              <div className="flex items-center gap-3">
                <p className="font-semibold text-[var(--petto-ink)]">{group.name}</p>
                <Badge tone="success">{group.petType}</Badge>
                {(group as any).cityLabel && (
                  <Badge tone="info">{(group as any).cityLabel}</Badge>
                )}
                {(group as any).isPrivate && (
                  <Badge tone="warning">Private</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-[var(--petto-muted)]">{group.description}</p>
            </div>
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--petto-muted)]">
              {group.memberCount} members • Created {new Date(group.createdAt).toLocaleDateString("en-GB")}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
