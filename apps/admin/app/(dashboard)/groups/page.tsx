"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createAdminGroup, getAdminGroups, getTaxonomy } from "@/lib/admin-api";

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
  const { register, handleSubmit, reset } = useForm<{
    name: string;
    description: string;
    petType: string;
  }>({
    defaultValues: {
      petType: "all"
    }
  });

  const createMutation = useMutation({
    mutationFn: (values: { name: string; description: string; petType: string }) =>
      createAdminGroup(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
      reset();
    }
  });

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Groups</p>
        <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">Community groups for pet owners</h1>
      </Card>

      <Card>
        <form className="grid gap-3 lg:grid-cols-2" onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
          <Input placeholder="Group name" {...register("name")} />
          <select className="flex h-10 w-full rounded-md border border-[var(--petto-border)] bg-white px-3 py-2 text-sm" {...register("petType")}>
            <option value="all">All</option>
            {speciesList.map((s) => (
              <option key={s.id} value={s.slug}>{s.label}</option>
            ))}
          </select>
          <div className="lg:col-span-2">
            <Input placeholder="Description" {...register("description")} />
          </div>
          <div className="lg:col-span-2">
            <Button type="submit">Create group</Button>
          </div>
        </form>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--petto-primary)] border-t-transparent" />
        </div>
      )}
      {!isLoading && groups.length === 0 && (
        <div className="rounded-[22px] border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-12 text-center text-sm text-[var(--petto-muted)]">
          No items found.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.id}>
            <div>
              <div className="flex items-center gap-3">
                <p className="font-semibold text-[var(--petto-ink)]">{group.name}</p>
                <Badge tone="success">{group.petType}</Badge>
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
