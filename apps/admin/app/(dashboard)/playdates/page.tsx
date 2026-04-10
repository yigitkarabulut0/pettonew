"use client";

import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { getAdminPlaydates } from "@/lib/admin-api";

export default function PlaydatesPage() {
  const { data: playdates = [], isLoading } = useQuery({
    queryKey: ["admin-playdates"],
    queryFn: getAdminPlaydates
  });

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Playdates</p>
        <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">All scheduled playdates</h1>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--petto-primary)] border-t-transparent" />
        </div>
      )}
      {!isLoading && playdates.length === 0 && (
        <div className="rounded-[22px] border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-12 text-center text-sm text-[var(--petto-muted)]">
          No items found.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {playdates.map((playdate) => (
          <Card key={playdate.id}>
            <div>
              <p className="font-semibold text-[var(--petto-ink)]">{playdate.title}</p>
              <p className="text-sm text-[var(--petto-muted)]">
                {playdate.location}
              </p>
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--petto-muted)]">{playdate.description}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--petto-muted)]">
              {new Date(playdate.date).toLocaleString("en-GB")} • Max {playdate.maxPets} pets • {playdate.attendees.length} attendees
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
