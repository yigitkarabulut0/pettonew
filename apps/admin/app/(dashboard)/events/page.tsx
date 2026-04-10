"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createEvent, deleteEvent, getEvents, getVenues } from "@/lib/admin-api";

export default function EventsPage() {
  const queryClient = useQueryClient();
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["admin-events"],
    queryFn: getEvents
  });
  const { data: venues = [] } = useQuery({
    queryKey: ["admin-venues"],
    queryFn: getVenues
  });
  const { register, handleSubmit, reset } = useForm<{
    title: string;
    description: string;
    cityLabel: string;
    venueId: string;
    startsAt: string;
    endsAt: string;
    audience: string;
    petFocus: string;
  }>({
    defaultValues: {
      audience: "everyone",
      petFocus: "all-pets"
    }
  });

  const createMutation = useMutation({
    mutationFn: (values: {
      title: string;
      description: string;
      cityLabel: string;
      venueId: string;
      startsAt: string;
      endsAt: string;
      audience: string;
      petFocus: string;
    }) =>
      createEvent({
        ...values,
        startsAt: values.startsAt ? new Date(values.startsAt).toISOString() : "",
        endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : undefined,
        venueId: values.venueId || undefined
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      reset();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => deleteEvent(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    }
  });

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Events</p>
        <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">Create attendance-based meetups with rules</h1>
      </Card>

      <Card>
        <form className="grid gap-3 lg:grid-cols-2" onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
          <Input placeholder="Event title" {...register("title")} />
          <Input placeholder="City" {...register("cityLabel")} />
          <Input placeholder="Description" {...register("description")} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--petto-muted)]">Start date</label>
            <input type="datetime-local" className="flex h-10 w-full rounded-md border border-[var(--petto-border)] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--petto-primary)]/20" {...register("startsAt")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--petto-muted)]">End date</label>
            <input type="datetime-local" className="flex h-10 w-full rounded-md border border-[var(--petto-border)] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--petto-primary)]/20" {...register("endsAt")} />
          </div>
          <select className="flex h-10 w-full rounded-md border border-[var(--petto-border)] bg-white px-3 py-2 text-sm" {...register("venueId")}>
            <option value="">Optional venue</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
          <select className="flex h-10 w-full rounded-md border border-[var(--petto-border)] bg-white px-3 py-2 text-sm" {...register("audience")}>
            <option value="everyone">Everyone</option>
            <option value="women-only">Women only</option>
            <option value="men-only">Men only</option>
          </select>
          <select className="flex h-10 w-full rounded-md border border-[var(--petto-border)] bg-white px-3 py-2 text-sm" {...register("petFocus")}>
            <option value="all-pets">All pets</option>
            <option value="dogs-only">Dogs only</option>
            <option value="cats-only">Cats only</option>
          </select>
          <div className="lg:col-span-2">
            <Button type="submit">Create event</Button>
          </div>
        </form>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--petto-primary)] border-t-transparent" />
        </div>
      )}
      {!isLoading && events.length === 0 && (
        <div className="rounded-[22px] border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-12 text-center text-sm text-[var(--petto-muted)]">
          No items found.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {events.map((event) => {
          const hasEnded = event.endsAt && new Date(event.endsAt) < new Date();
          return (
            <Card key={event.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[var(--petto-ink)]">{event.title}</p>
                    {hasEnded && (
                      <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                        Ended
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--petto-muted)]">
                    {event.cityLabel} • {event.audience} • {event.petFocus}
                  </p>
                </div>
                <Button variant="ghost" className="text-rose-700 hover:text-rose-800" onClick={() => deleteMutation.mutate(event.id)}>
                  Delete
                </Button>
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--petto-muted)]">{event.description}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--petto-muted)]">
                {event.attendeeCount} attendees • {new Date(event.startsAt).toLocaleString("en-GB")}
                {event.endsAt ? ` — ${new Date(event.endsAt).toLocaleString("en-GB")}` : ""}
              </p>
              {event.attendees && event.attendees.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {event.attendees.map((attendee: any, idx: number) => (
                    <span
                      key={attendee.userId || idx}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--petto-primary-bg)] px-2.5 py-1 text-xs font-medium text-[var(--petto-primary)]"
                    >
                      {attendee.userName}
                      {attendee.petNames && attendee.petNames.length > 0 && (
                        <span className="text-[var(--petto-muted)]">
                          ({attendee.petNames.join(", ")})
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
