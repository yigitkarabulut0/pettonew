"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  Hash,
  Link2,
  Loader2,
  MapPin,
  Pause,
  PawPrint,
  Play,
  Plus,
  Send,
  Trash2,
  Users,
  X
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type ScheduledPush,
  type ScheduledPushAudience,
  type ScheduledPushInput,
  createScheduledPush,
  deleteScheduledPush,
  getAdminGroups,
  getAdminLocations,
  getAdminPlaydates,
  getTaxonomy,
  getVenues,
  listScheduledPushes,
  updateScheduledPush
} from "@/lib/admin-api";

// Sunday=0 … Saturday=6 (matches Go's time.Weekday()). Order in the UI is
// Mon→Sun because that reads more naturally for week scheduling.
const WEEKDAYS: Array<{ index: number; short: string; long: string }> = [
  { index: 1, short: "Mon", long: "Monday" },
  { index: 2, short: "Tue", long: "Tuesday" },
  { index: 3, short: "Wed", long: "Wednesday" },
  { index: 4, short: "Thu", long: "Thursday" },
  { index: 5, short: "Fri", long: "Friday" },
  { index: 6, short: "Sat", long: "Saturday" },
  { index: 0, short: "Sun", long: "Sunday" }
];

const STATIC_DEEP_LINKS: Array<{ label: string; url: string }> = [
  { label: "Home (feed)", url: "petto://(tabs)/home" },
  { label: "Discover (swipe)", url: "petto://(tabs)/discover" },
  { label: "Explore (venues)", url: "petto://(tabs)/explore" },
  { label: "Match", url: "petto://(tabs)/match" },
  { label: "Care", url: "petto://(tabs)/care" },
  { label: "Profile", url: "petto://(tabs)/profile" },
  { label: "Playdates list", url: "petto://playdates" },
  { label: "Groups list", url: "petto://groups" },
  { label: "Conversations", url: "petto://conversations" },
  { label: "Lost pets", url: "petto://lost-pets" },
  { label: "Adopt index", url: "petto://adopt" },
  { label: "Favorites", url: "petto://favorites" },
  { label: "Pet sitters", url: "petto://pet-sitters" },
  { label: "First aid", url: "petto://first-aid" },
  { label: "Training tips", url: "petto://training-tips" },
  { label: "Notification settings", url: "petto://notification-settings" }
];

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { confirm, node: confirmNode } = useConfirm();
  const [createOpen, setCreateOpen] = React.useState(false);

  const query = useQuery({
    queryKey: ["scheduled-pushes"],
    queryFn: listScheduledPushes
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateScheduledPush(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled-pushes"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteScheduledPush(id),
    onSuccess: () => {
      toast.success("Schedule deleted");
      qc.invalidateQueries({ queryKey: ["scheduled-pushes"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const list = query.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Scheduled pushes"
        description="Recurring notifications that fire automatically on the days and time you choose. For one-shot sends use Broadcast."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New schedule
          </Button>
        }
      />

      {query.isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--muted-foreground)]">
            Loading…
          </CardContent>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-[var(--muted-foreground)]">
            <Clock className="h-5 w-5" />
            <div>No scheduled pushes yet.</div>
            <div className="text-xs">
              Create one to send a recurring notification — e.g. every Monday 9:00 AM to dog
              owners in Istanbul.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.map((row) => (
            <ScheduleRow
              key={row.id}
              schedule={row}
              onToggle={(enabled) => toggleMut.mutate({ id: row.id, enabled })}
              onDelete={() =>
                confirm({
                  title: "Delete this schedule?",
                  description: "It will stop firing immediately.",
                  destructive: true,
                  confirmLabel: "Delete",
                  onConfirm: () => deleteMut.mutateAsync(row.id)
                })
              }
              isToggling={toggleMut.isPending && toggleMut.variables?.id === row.id}
            />
          ))}
        </div>
      )}

      <CreateScheduleDialog open={createOpen} onOpenChange={setCreateOpen} />
      {confirmNode}
    </div>
  );
}

function ScheduleRow({
  schedule,
  onToggle,
  onDelete,
  isToggling
}: {
  schedule: ScheduledPush;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  isToggling: boolean;
}) {
  const dayLabels = WEEKDAYS.filter((w) => schedule.daysOfWeek.includes(w.index)).map(
    (w) => w.short
  );
  return (
    <Card className={schedule.enabled ? "" : "opacity-60"}>
      <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-[var(--foreground)]">
              {schedule.title}
            </span>
            <Badge tone={schedule.enabled ? "success" : "neutral"}>
              {schedule.enabled ? "active" : "paused"}
            </Badge>
            <Badge tone="neutral">
              <Clock className="h-3 w-3" /> {schedule.timeOfDay} {schedule.timezone}
            </Badge>
            <Badge tone="neutral">
              <Calendar className="h-3 w-3" /> {dayLabels.join(", ") || "—"}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-[var(--muted-foreground)]">
            {schedule.body}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--muted-foreground)]">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {audienceLabel(schedule)}
            </span>
            {schedule.countryFilter || schedule.cityFilter ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {[schedule.countryFilter, schedule.cityFilter].filter(Boolean).join(" · ")}
              </span>
            ) : null}
            {schedule.deepLink ? (
              <span className="inline-flex items-center gap-1 break-all font-mono">
                <Link2 className="h-3 w-3" />
                {schedule.deepLink}
              </span>
            ) : null}
            <span>
              · next <RelativeTime value={schedule.nextRunAt} />
            </span>
            {schedule.lastRunAt ? (
              <span>
                · last <RelativeTime value={schedule.lastRunAt} />
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggle(!schedule.enabled)}
            disabled={isToggling}
            title={schedule.enabled ? "Pause" : "Resume"}
          >
            {isToggling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : schedule.enabled ? (
              <>
                <Pause className="h-3.5 w-3.5" /> Pause
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Resume
              </>
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete schedule">
            <Trash2 className="h-3.5 w-3.5 text-[var(--destructive)]" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function audienceLabel(s: ScheduledPush): string {
  if (s.audience === "all") return "All users";
  if (s.audience === "pet_type") {
    return s.petTypes.length > 0 ? `Pet type · ${s.petTypes.join(", ")}` : "Pet type";
  }
  if (s.audience === "users") {
    return `${s.userIds.length} user${s.userIds.length === 1 ? "" : "s"}`;
  }
  return s.audience;
}

// ── Create dialog ────────────────────────────────────────────────────────

function CreateScheduleDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const qc = useQueryClient();

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [audience, setAudience] = React.useState<ScheduledPushAudience>("all");
  const [petTypes, setPetTypes] = React.useState<string[]>([]);
  const [userIds, setUserIds] = React.useState<string[]>([]);
  const [userIdInput, setUserIdInput] = React.useState("");
  const [countryFilter, setCountryFilter] = React.useState("");
  const [cityFilter, setCityFilter] = React.useState("");
  const [daysOfWeek, setDaysOfWeek] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [timeOfDay, setTimeOfDay] = React.useState("09:00");
  const [timezone, setTimezone] = React.useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );

  const locationsQuery = useQuery({
    queryKey: ["admin-locations"],
    queryFn: getAdminLocations
  });
  const countries = locationsQuery.data?.countries ?? [];
  // Server-curated zone list, augmented with the admin's local zone if it
  // isn't one of the popular options. Keeps the dropdown small but always
  // contains the timezone the admin is likely to want.
  const timezones = React.useMemo(() => {
    const list = locationsQuery.data?.timezones ?? [];
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return list.includes(localTz) ? list : [localTz, ...list];
  }, [locationsQuery.data]);
  const selectedCountry = countries.find((c) => c.code === countryFilter);

  // Reset city when country changes — picking "Türkiye" then a "London"
  // city would silently filter to nobody.
  React.useEffect(() => {
    if (cityFilter && selectedCountry && !selectedCountry.cities.includes(cityFilter)) {
      setCityFilter("");
    }
  }, [countryFilter]);

  const [linkKind, setLinkKind] = React.useState<
    "none" | "static" | "playdate" | "group" | "venue" | "user"
  >("none");
  const [linkTargetId, setLinkTargetId] = React.useState("");
  const [linkStaticUrl, setLinkStaticUrl] = React.useState("");

  const speciesQuery = useQuery({
    queryKey: ["taxonomy", "species"],
    queryFn: () => getTaxonomy("species")
  });
  const playdatesQuery = useQuery({
    queryKey: ["admin-playdates"],
    queryFn: getAdminPlaydates,
    enabled: linkKind === "playdate"
  });
  const groupsQuery = useQuery({
    queryKey: ["admin-groups"],
    queryFn: getAdminGroups,
    enabled: linkKind === "group"
  });
  const venuesQuery = useQuery({
    queryKey: ["admin-venues"],
    queryFn: getVenues,
    enabled: linkKind === "venue"
  });

  const composedDeepLink = React.useMemo(() => {
    switch (linkKind) {
      case "static":
        return linkStaticUrl;
      case "playdate":
        return linkTargetId ? `petto://playdates/${linkTargetId}` : "";
      case "group":
        return linkTargetId ? `petto://group/${linkTargetId}` : "";
      case "venue":
        return linkTargetId ? `petto://venue/${linkTargetId}` : "";
      case "user":
        return linkTargetId ? `petto://user/${linkTargetId}` : "";
      default:
        return "";
    }
  }, [linkKind, linkTargetId, linkStaticUrl]);

  function reset() {
    setTitle("");
    setBody("");
    setAudience("all");
    setPetTypes([]);
    setUserIds([]);
    setUserIdInput("");
    setCountryFilter("");
    setCityFilter("");
    setDaysOfWeek([1, 2, 3, 4, 5]);
    setTimeOfDay("09:00");
    setLinkKind("none");
    setLinkTargetId("");
    setLinkStaticUrl("");
  }

  const createMut = useMutation({
    mutationFn: () => {
      const payload: ScheduledPushInput = {
        title,
        body,
        audience,
        petTypes: audience === "pet_type" ? petTypes : [],
        userIds: audience === "users" ? userIds : [],
        countryFilter: countryFilter || undefined,
        cityFilter: cityFilter || undefined,
        daysOfWeek,
        timeOfDay,
        timezone,
        deepLink: composedDeepLink || undefined,
        enabled: true
      };
      return createScheduledPush(payload);
    },
    onSuccess: () => {
      toast.success("Schedule created");
      qc.invalidateQueries({ queryKey: ["scheduled-pushes"] });
      reset();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const valid =
    title.trim() &&
    body.trim() &&
    daysOfWeek.length > 0 &&
    /^\d{2}:\d{2}$/.test(timeOfDay) &&
    (audience !== "pet_type" || petTypes.length > 0) &&
    (audience !== "users" || userIds.length > 0);

  function toggleDay(idx: number) {
    setDaysOfWeek((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort((a, b) => a - b)
    );
  }
  function togglePetType(slug: string) {
    setPetTypes((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }
  function addUserId() {
    const id = userIdInput.trim();
    if (!id) return;
    setUserIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setUserIdInput("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New scheduled push</DialogTitle>
          <DialogDescription>
            Fires automatically on the chosen weekdays and time. Pick an audience and
            (optionally) a deep link the app should open.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Time (HH:MM)</Label>
              <Input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Body</Label>
            <Textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={240}
            />
          </div>

          {/* Days */}
          <div className="flex flex-col gap-1.5">
            <Label>Days of week</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const checked = daysOfWeek.includes(d.index);
                return (
                  <button
                    key={d.index}
                    type="button"
                    onClick={() => toggleDay(d.index)}
                    className={
                      "rounded-md border px-2.5 py-1 text-xs transition-colors " +
                      (checked
                        ? "border-[#E6694A] bg-[#E6694A]/10 text-[#E6694A]"
                        : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]")
                    }
                    title={d.long}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label>Timezone</Label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Country (optional)</Label>
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <option value="">Any country</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>City (optional)</Label>
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                disabled={!selectedCountry}
                className="flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">
                  {selectedCountry ? "Any city in country" : "Pick a country first"}
                </option>
                {(selectedCountry?.cities ?? []).map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Audience */}
          <div className="flex flex-col gap-2">
            <Label>Audience</Label>
            <div className="flex flex-wrap gap-1.5">
              {([
                { id: "all", label: "All users", icon: Users },
                { id: "pet_type", label: "By pet type", icon: PawPrint },
                { id: "users", label: "Specific users", icon: Hash }
              ] as const).map((opt) => {
                const Icon = opt.icon;
                const active = audience === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAudience(opt.id)}
                    className={
                      "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors " +
                      (active
                        ? "border-[#E6694A] bg-[#E6694A]/10 text-[#E6694A]"
                        : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]")
                    }
                  >
                    <Icon className="h-3.5 w-3.5" /> {opt.label}
                  </button>
                );
              })}
            </div>
            {audience === "pet_type" ? (
              <div className="flex flex-wrap gap-1.5">
                {(speciesQuery.data ?? []).map((s) => {
                  const checked = petTypes.includes(s.slug);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => togglePetType(s.slug)}
                      className={
                        "rounded-md border px-2.5 py-1 text-xs transition-colors " +
                        (checked
                          ? "border-[#E6694A] bg-[#E6694A]/10 text-[#E6694A]"
                          : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]")
                      }
                    >
                      <PawPrint className="mr-1 inline h-3 w-3" />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {audience === "users" ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <Input
                    value={userIdInput}
                    onChange={(e) => setUserIdInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addUserId();
                      }
                    }}
                    placeholder="Paste a user id and press Enter"
                    className="font-mono text-xs"
                  />
                  <Button type="button" variant="outline" onClick={addUserId}>
                    Add
                  </Button>
                </div>
                {userIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {userIds.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--muted)] px-2 py-0.5 font-mono text-[11px] text-[var(--foreground)]"
                      >
                        {id.slice(0, 18)}…
                        <button
                          type="button"
                          onClick={() => setUserIds((prev) => prev.filter((x) => x !== id))}
                        >
                          <X className="h-3 w-3 text-[var(--muted-foreground)] hover:text-[var(--destructive)]" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Deep link */}
          <div className="flex flex-col gap-2">
            <Label>Deep link</Label>
            <div className="flex flex-wrap gap-1.5">
              {([
                { id: "none", label: "None", icon: X },
                { id: "static", label: "App page", icon: Link2 },
                { id: "playdate", label: "Playdate", icon: Calendar },
                { id: "group", label: "Group", icon: Users },
                { id: "venue", label: "Venue", icon: MapPin },
                { id: "user", label: "User id", icon: Hash }
              ] as const).map((k) => {
                const Icon = k.icon;
                const active = linkKind === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => {
                      setLinkKind(k.id);
                      setLinkTargetId("");
                      setLinkStaticUrl("");
                    }}
                    className={
                      "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors " +
                      (active
                        ? "border-[#E6694A] bg-[#E6694A]/10 text-[#E6694A]"
                        : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]")
                    }
                  >
                    <Icon className="h-3.5 w-3.5" /> {k.label}
                  </button>
                );
              })}
            </div>

            {linkKind === "static" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {STATIC_DEEP_LINKS.map((entry) => {
                  const picked = linkStaticUrl === entry.url;
                  return (
                    <button
                      key={entry.url}
                      type="button"
                      onClick={() => setLinkStaticUrl(entry.url)}
                      className={
                        "rounded-md border px-3 py-2 text-left transition-colors " +
                        (picked
                          ? "border-[#E6694A] bg-[#E6694A]/5"
                          : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]")
                      }
                    >
                      <div className="truncate text-sm font-medium text-[var(--foreground)]">
                        {entry.label}
                      </div>
                      <div className="truncate font-mono text-[10px] text-[var(--muted-foreground)]">
                        {entry.url}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {linkKind === "playdate" ? (
              <PickerSelect
                loading={playdatesQuery.isLoading}
                value={linkTargetId}
                onChange={setLinkTargetId}
                options={(playdatesQuery.data ?? []).map((p) => ({
                  id: p.id,
                  label: p.title,
                  sub: p.location || ""
                }))}
              />
            ) : null}

            {linkKind === "group" ? (
              <PickerSelect
                loading={groupsQuery.isLoading}
                value={linkTargetId}
                onChange={setLinkTargetId}
                options={(groupsQuery.data ?? []).map((g) => ({
                  id: g.id,
                  label: g.name,
                  sub: g.cityLabel || g.petType
                }))}
              />
            ) : null}

            {linkKind === "venue" ? (
              <PickerSelect
                loading={venuesQuery.isLoading}
                value={linkTargetId}
                onChange={setLinkTargetId}
                options={(venuesQuery.data ?? []).map((v) => ({
                  id: v.id,
                  label: v.name,
                  sub: [v.category, v.cityLabel].filter(Boolean).join(" · ")
                }))}
              />
            ) : null}

            {linkKind === "user" ? (
              <Input
                value={linkTargetId}
                onChange={(e) => setLinkTargetId(e.target.value)}
                placeholder="user-1234… (paste a user id)"
                className="font-mono text-xs"
              />
            ) : null}

            {composedDeepLink ? (
              <div className="break-all rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 py-1 font-mono text-[11px] text-[var(--foreground)]">
                {composedDeepLink}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            <Send className="h-4 w-4" />
            {createMut.isPending ? "Saving…" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickerSelect({
  loading,
  value,
  onChange,
  options
}: {
  loading: boolean;
  value: string;
  onChange: (id: string) => void;
  options: { id: string; label: string; sub?: string }[];
}) {
  if (loading) {
    return <span className="text-xs text-[var(--muted-foreground)]">Loading…</span>;
  }
  if (options.length === 0) {
    return <span className="text-xs text-[var(--muted-foreground)]">No items available.</span>;
  }
  return (
    <div className="max-h-48 overflow-y-auto rounded-md border border-[var(--border)]">
      {options.map((opt) => {
        const picked = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={
              "flex w-full items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 text-left transition-colors last:border-b-0 " +
              (picked ? "bg-[#E6694A]/5" : "hover:bg-[var(--muted)]")
            }
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-[var(--foreground)]">
                {opt.label}
              </div>
              {opt.sub ? (
                <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                  {opt.sub}
                </div>
              ) : null}
            </div>
            {picked ? <Badge tone="success">picked</Badge> : null}
          </button>
        );
      })}
    </div>
  );
}
