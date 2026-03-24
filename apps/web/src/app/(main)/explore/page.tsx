"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { Location, Event, LocationCategory } from "@petto/types";
import { Card, CardContent } from "@petto/ui";
import { Button } from "@petto/ui";
import { Badge } from "@petto/ui";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@petto/ui";
import {
  MapPin,
  Calendar,
  Navigation,
  MapPinned,
  Clock,
  Users,
  Loader2,
  LogIn,
  LogOut,
  CheckCircle2,
} from "lucide-react";

const CATEGORY_STYLES: Record<LocationCategory, string> = {
  park: "bg-green-100 text-green-700",
  cafe: "bg-amber-100 text-amber-700",
  restaurant: "bg-orange-100 text-orange-700",
  pub: "bg-purple-100 text-purple-700",
  vet: "bg-blue-100 text-blue-700",
  grooming: "bg-pink-100 text-pink-700",
  other: "bg-gray-100 text-gray-700",
};

export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      <h1 className="mb-4 text-xl font-bold">Explore</h1>
      <Tabs defaultValue="places">
        <TabsList className="w-full">
          <TabsTrigger value="places" className="flex-1 gap-1.5">
            <MapPin className="h-4 w-4" />
            Places
          </TabsTrigger>
          <TabsTrigger value="events" className="flex-1 gap-1.5">
            <Calendar className="h-4 w-4" />
            Events
          </TabsTrigger>
        </TabsList>
        <TabsContent value="places">
          <PlacesTab />
        </TabsContent>
        <TabsContent value="events">
          <EventsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlacesTab() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [checkedInId, setCheckedInId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const fetchLocations = useCallback(() => {
    api
      .get<Location[]>("/explore/locations")
      .then((res) => {
        setLocations(res);
        const active = res.find((l) => l.checkinCount > 0);
        if (active) setCheckedInId(active.id);
      })
      .catch(() => setError("Failed to load locations"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const handleCheckIn = async (location: Location) => {
    setCheckingIn(location.id);
    try {
      await api.post("/explore/check-in", {
        location_id: location.id,
        lat: location.lat,
        lng: location.lng,
      });
      setCheckedInId(location.id);
    } catch {
      setError("Failed to check in");
    } finally {
      setCheckingIn(null);
    }
  };

  const handleCheckOut = async () => {
    if (!checkedInId) return;
    setCheckingOut(true);
    try {
      await api.post("/explore/check-out");
      setCheckedInId(null);
    } catch {
      setError("Failed to check out");
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed bg-muted/30">
        <div className="text-center text-muted-foreground">
          <MapPinned className="mx-auto mb-2 h-8 w-8" />
          <p className="text-sm">Connect Mapbox to see pet-friendly places</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error && locations.length === 0 ? (
        <div className="py-12 text-center text-sm text-destructive">{error}</div>
      ) : locations.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Navigation className="mx-auto mb-2 h-8 w-8" />
          <p className="text-sm">No locations found nearby</p>
        </div>
      ) : (
        <div className="space-y-3">
          {locations.map((location) => (
            <Card key={location.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    CATEGORY_STYLES[location.category]
                  }`}
                >
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{location.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {location.address}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={CATEGORY_STYLES[location.category]}
                    >
                      {location.category}
                    </Badge>
                  </div>
                  <div className="mt-2">
                    {checkedInId === location.id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCheckOut}
                        disabled={checkingOut}
                        className="text-destructive"
                      >
                        {checkingOut ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <LogOut className="h-3.5 w-3.5" />
                        )}
                        Check Out
                      </Button>
                    ) : checkedInId && checkedInId !== location.id ? (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        Checked in elsewhere
                      </p>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCheckIn(location)}
                        disabled={checkingIn === location.id}
                      >
                        {checkingIn === location.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <LogIn className="h-3.5 w-3.5" />
                        )}
                        Check In
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EventsTab() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Event[]>("/explore/events")
      .then(setEvents)
      .catch(() => setError("Failed to load events"))
      .finally(() => setLoading(false));
  }, []);

  const handleToggleJoin = async (event: Event) => {
    setJoining(event.id);
    try {
      if (event.isParticipating) {
        await api.post(`/explore/events/${event.id}/leave`);
        setEvents((prev) =>
          prev.map((e) =>
            e.id === event.id
              ? { ...e, isParticipating: false, participantCount: e.participantCount - 1 }
              : e
          )
        );
      } else {
        await api.post(`/explore/events/${event.id}/join`);
        setEvents((prev) =>
          prev.map((e) =>
            e.id === event.id
              ? { ...e, isParticipating: true, participantCount: e.participantCount + 1 }
              : e
          )
        );
      }
    } catch {
      setError("Failed to update event participation");
    } finally {
      setJoining(null);
    }
  };

  const formatEventDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatEventTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-4 pt-2">
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error && events.length === 0 ? (
        <div className="py-12 text-center text-sm text-destructive">{error}</div>
      ) : events.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Calendar className="mx-auto mb-2 h-8 w-8" />
          <p className="text-sm">No upcoming events</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <Card key={event.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold">{event.title}</h3>
                    {event.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {event.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatEventDate(event.startTime)},{" "}
                        {formatEventTime(event.startTime)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {event.participantCount}
                        {event.maxParticipants &&
                          ` / ${event.maxParticipants}`}
                      </span>
                      {event.locationName && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {event.locationName}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant={event.isParticipating ? "outline" : "default"}
                    size="sm"
                    onClick={() => handleToggleJoin(event)}
                    disabled={joining === event.id}
                    className="shrink-0"
                  >
                    {joining === event.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : event.isParticipating ? (
                      "Leave"
                    ) : (
                      "Join"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
