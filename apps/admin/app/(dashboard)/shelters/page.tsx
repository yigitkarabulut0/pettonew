"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Building2,
  Copy,
  KeyRound,
  Mail,
  MapPin,
  PawPrint,
  Phone,
  Plus,
  RotateCcw,
  Trash2,
  UserRound
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LocationPicker, type LocationValue } from "@/components/common/LocationPicker";
import {
  AdminShelter,
  CreateShelterInput,
  createAdminShelter,
  deleteAdminShelter,
  listAdminShelters,
  resetAdminShelterPassword
} from "@/lib/admin-api";

type CredentialsState = {
  shelter: AdminShelter;
  tempPassword: string;
  notice: string;
  mode: "created" | "reset";
} | null;

export default function ShelterAdminPage() {
  const queryClient = useQueryClient();
  const { data: shelters = [], isLoading } = useQuery({
    queryKey: ["admin-shelters"],
    queryFn: listAdminShelters
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [credentials, setCredentials] = useState<CredentialsState>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shelters;
    return shelters.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.cityLabel.toLowerCase().includes(q)
    );
  }, [shelters, search]);

  const createMutation = useMutation({
    mutationFn: createAdminShelter,
    onSuccess: (res) => {
      setCredentials({
        shelter: res.shelter,
        tempPassword: res.tempPassword,
        notice: res.passwordNotice,
        mode: "created"
      });
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-shelters"] });
      toast.success(`Shelter "${res.shelter.name}" created`);
    },
    onError: (err: Error) => toast.error(err.message || "Could not create shelter")
  });

  const resetMutation = useMutation({
    mutationFn: async (shelter: AdminShelter) => {
      const res = await resetAdminShelterPassword(shelter.id);
      return { shelter, ...res };
    },
    onSuccess: (res) => {
      setCredentials({
        shelter: res.shelter,
        tempPassword: res.tempPassword,
        notice: res.passwordNotice,
        mode: "reset"
      });
      toast.success(`Password reset for ${res.shelter.name}`);
    },
    onError: (err: Error) => toast.error(err.message || "Could not reset password")
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminShelter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-shelters"] });
      toast.success("Shelter deleted");
    },
    onError: (err: Error) => toast.error(err.message || "Could not delete shelter")
  });

  return (
    <div className="space-y-6 px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Building2 className="size-6 text-primary" />
            Shelters
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Create accounts for animal shelters. Each shelter can log in to the
            shelter panel to list pets and manage adoption applications. A
            one-time temporary password is shown after creation — copy it
            immediately; it is not stored in plaintext.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1">
          <Plus className="size-4" /> New shelter
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by name, email or city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Badge tone="info">{filtered.length} shelters</Badge>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading shelters…</div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <Building2 className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No shelters yet. Create the first one to unlock the adoption flow
            on the mobile app.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((shelter) => (
            <ShelterCard
              key={shelter.id}
              shelter={shelter}
              onReset={() => resetMutation.mutate(shelter)}
              onDelete={() => {
                if (
                  typeof window !== "undefined" &&
                  window.confirm(`Delete shelter "${shelter.name}"?`)
                ) {
                  deleteMutation.mutate(shelter.id);
                }
              }}
              busy={resetMutation.isPending || deleteMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <CreateShelterModal
          onCancel={() => setCreateOpen(false)}
          onSubmit={(input) => createMutation.mutate(input)}
          pending={createMutation.isPending}
        />
      )}

      {/* Credentials modal */}
      {credentials && (
        <CredentialsModal
          state={credentials}
          onClose={() => setCredentials(null)}
        />
      )}
    </div>
  );
}

function ShelterCard({
  shelter,
  onReset,
  onDelete,
  busy
}: {
  shelter: AdminShelter;
  onReset: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {shelter.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shelter.logoUrl}
              alt={shelter.name}
              className="size-12 rounded-2xl object-cover"
            />
          ) : (
            <Building2 className="size-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {/* Link wraps the name so admins can jump into the detail
              page (team + audit tabs). Keep the name visually identical
              to the pre-link version so the UX layout doesn't shift. */}
          <Link
            href={`/shelters/${shelter.id}`}
            className="block truncate text-base font-semibold hover:underline"
          >
            {shelter.name}
          </Link>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="size-3" />
            <span className="truncate">{shelter.email}</span>
          </div>
        </div>
        <Badge tone={shelter.mustChangePassword ? "warning" : "success"}>
          {shelter.mustChangePassword ? "temp pwd" : "active"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        {shelter.cityLabel ? (
          <div className="flex items-center gap-1.5 truncate">
            <MapPin className="size-3" />
            <span className="truncate">{shelter.cityLabel}</span>
          </div>
        ) : null}
        {shelter.phone ? (
          <div className="flex items-center gap-1.5 truncate">
            <Phone className="size-3" />
            <span className="truncate">{shelter.phone}</span>
          </div>
        ) : null}
      </div>

      {shelter.about ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">{shelter.about}</p>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <div className="text-[11px] text-muted-foreground">
          Created {new Date(shelter.createdAt).toLocaleDateString()}
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={onReset}
            disabled={busy}
            className="gap-1"
          >
            <RotateCcw className="size-3.5" /> Reset
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            className="gap-1 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CreateShelterModal({
  onCancel,
  onSubmit,
  pending
}: {
  onCancel: () => void;
  onSubmit: (input: CreateShelterInput) => void;
  pending: boolean;
}) {
  const { register, handleSubmit, formState, setValue, watch } =
    useForm<CreateShelterInput>();
  const [location, setLocation] = useState<LocationValue>({
    address: "",
    latitude: 0,
    longitude: 0,
    cityLabel: ""
  });

  const handleLocationChange = (next: LocationValue) => {
    setLocation(next);
    setValue("address", next.address);
    setValue("latitude", next.latitude);
    setValue("longitude", next.longitude);
    if (next.cityLabel && !watch("cityLabel")) {
      setValue("cityLabel", next.cityLabel);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <Card className="my-8 w-full max-w-xl space-y-5 p-6">
        <div>
          <h2 className="text-lg font-semibold">Create shelter account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A temporary password will be generated and shown once. The shelter
            must change it on first login.
          </p>
        </div>

        <form
          onSubmit={handleSubmit((values) =>
            onSubmit({
              ...values,
              latitude: location.latitude || undefined,
              longitude: location.longitude || undefined,
              address: location.address || values.address,
              cityLabel: values.cityLabel || location.cityLabel
            })
          )}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              placeholder="Happy Paws Shelter"
              {...register("name", { required: true })}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground">Login email</label>
            <Input
              type="email"
              placeholder="contact@happypaws.com"
              {...register("email", { required: true })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input placeholder="+90 212…" {...register("phone")} />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground">Website</label>
              <Input placeholder="https://…" {...register("website")} />
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground">About</label>
            <textarea
              className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Short bio shown on the shelter profile…"
              {...register("about")}
            />
          </div>

          {/* Location picker — address + map + draggable marker */}
          <LocationPicker
            value={location}
            onChange={handleLocationChange}
            markerColor="#e6694a"
            label="Shelter address"
            placeholder="Start typing the shelter address…"
            mapHeight={220}
          />

          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground">City</label>
            <Input
              placeholder="Istanbul"
              {...register("cityLabel")}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || formState.isSubmitting}>
              {pending ? "Creating…" : "Create shelter"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function CredentialsModal({
  state,
  onClose
}: {
  state: NonNullable<CredentialsState>;
  onClose: () => void;
}) {
  const copy = async () => {
    await navigator.clipboard.writeText(state.tempPassword);
    toast.success("Password copied");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md space-y-5 p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="size-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">
              {state.mode === "reset"
                ? "Password reset"
                : "Shelter account created"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              For {state.shelter.name}
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <UserRound className="size-4" />
            <span className="select-all font-mono">{state.shelter.email}</span>
          </div>
          <div className="flex items-center gap-2 font-medium">
            <KeyRound className="size-4" />
            <span className="select-all font-mono text-base tracking-wide">
              {state.tempPassword}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto gap-1"
              onClick={copy}
            >
              <Copy className="size-3" /> Copy
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{state.notice}</p>

        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </Card>
    </div>
  );
}
