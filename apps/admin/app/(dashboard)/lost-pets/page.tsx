"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAdminLostPets, updateAdminLostPetStatus } from "@/lib/admin-api";

export default function LostPetsPage() {
  const queryClient = useQueryClient();
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["admin-lost-pets"],
    queryFn: getAdminLostPets
  });

  const updateMutation = useMutation({
    mutationFn: (alertId: string) => updateAdminLostPetStatus(alertId, "found"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-lost-pets"] });
    }
  });

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Adoptions</p>
        <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">Pet adoption listings and management</h1>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--petto-primary)] border-t-transparent" />
        </div>
      )}
      {!isLoading && alerts.length === 0 && (
        <div className="rounded-[22px] border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-12 text-center text-sm text-[var(--petto-muted)]">
          No items found.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {alerts.map((alert) => (
          <Card key={alert.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-[var(--petto-ink)]">Alert #{alert.id.slice(0, 8)}</p>
                  <Badge tone={alert.status === "active" ? "warning" : "success"}>
                    {alert.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--petto-muted)]">{alert.description}</p>
              </div>
              {alert.status === "active" && (
                <Button
                  variant="ghost"
                  className="shrink-0 text-emerald-700 hover:text-emerald-800"
                  onClick={() => updateMutation.mutate(alert.id)}
                >
                  Mark as Found
                </Button>
              )}
            </div>
            <div className="mt-3 space-y-1 text-sm text-[var(--petto-muted)]">
              <p>Last seen: {alert.lastSeenLocation}</p>
              <p>Date: {new Date(alert.lastSeenDate).toLocaleDateString("en-GB")}</p>
              <p>Contact: {alert.contactPhone}</p>
            </div>
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--petto-muted)]">
              Reported {new Date(alert.createdAt).toLocaleDateString("en-GB")}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
