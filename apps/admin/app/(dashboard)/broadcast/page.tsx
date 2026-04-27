"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Calendar, Hash, Link2, MapPin, PawPrint, Send, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getAdminGroups,
  getAdminPlaydates,
  getTaxonomy,
  getVenues
} from "@/lib/admin-api";
import { listAdminUsers } from "@/lib/api/users";
import { sendBroadcast, type BroadcastSegment } from "@/lib/api/system";

// ── Deep link library ──────────────────────────────────────────────
//
// The mobile app's expo-router scheme is `petto://`. Each entry maps a
// human label the admin sees in the picker to the URL the push payload
// carries. `target` of "static" → no row-level select, the URL is final.
// `target` of a kind ("playdate" / "group" / ...) → the picker fetches
// the matching list from the admin API so the admin can choose a row.
type DeepLinkKind =
  | "none"
  | "static"
  | "playdate"
  | "group"
  | "venue"
  | "user";

type StaticDeepLink = { label: string; url: string; description?: string };

const STATIC_DEEP_LINKS: StaticDeepLink[] = [
  { label: "Home (feed)", url: "petto://(tabs)/home", description: "Bottom-tab home screen" },
  { label: "Discover (swipe)", url: "petto://(tabs)/discover", description: "Pet discovery deck" },
  { label: "Explore (venues)", url: "petto://(tabs)/explore", description: "Venues & events" },
  { label: "Match", url: "petto://(tabs)/match", description: "Matches inbox" },
  { label: "Care", url: "petto://(tabs)/care", description: "Pet care hub" },
  { label: "Profile", url: "petto://(tabs)/profile", description: "Current user profile" },
  { label: "Playdates list", url: "petto://playdates", description: "All discoverable playdates" },
  { label: "Groups list", url: "petto://groups" },
  { label: "Conversations", url: "petto://conversations" },
  { label: "Lost pets", url: "petto://lost-pets" },
  { label: "Adopt index", url: "petto://adopt", description: "Adoptable pets feed" },
  { label: "Favorites", url: "petto://favorites" },
  { label: "Pet sitters", url: "petto://pet-sitters" },
  { label: "First aid", url: "petto://first-aid" },
  { label: "Training tips", url: "petto://training-tips" },
  { label: "Notification settings", url: "petto://notification-settings" }
];

export default function BroadcastPage() {
  const router = useRouter();

  // Composer state
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");

  // Audience state
  const [audience, setAudience] = React.useState<"all" | "pet_type" | "users">("all");
  const [petTypes, setPetTypes] = React.useState<string[]>([]);
  const [userIds, setUserIds] = React.useState<string[]>([]);
  const [userSearch, setUserSearch] = React.useState("");

  // Deep-link picker state
  const [linkKind, setLinkKind] = React.useState<DeepLinkKind>("none");
  const [linkTargetId, setLinkTargetId] = React.useState<string>("");
  const [linkStaticUrl, setLinkStaticUrl] = React.useState<string>("");

  // Audience data sources
  const speciesQuery = useQuery({
    queryKey: ["taxonomy", "species"],
    queryFn: () => getTaxonomy("species")
  });
  const usersQuery = useQuery({
    queryKey: ["broadcast-user-search", userSearch],
    queryFn: () => listAdminUsers({ search: userSearch, pageSize: 20 }),
    enabled: audience === "users"
  });

  // Deep-link target sources (lazy — only fetched when needed)
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

  // Compose the final deep link string from picker state.
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

  const segment: BroadcastSegment | null = React.useMemo(() => {
    if (audience === "all") return { audience: "all" };
    if (audience === "pet_type") {
      if (petTypes.length === 0) return null;
      return { audience: "pet_type", petTypes };
    }
    if (audience === "users") {
      if (userIds.length === 0) return null;
      return { audience: "users", userIds };
    }
    return null;
  }, [audience, petTypes, userIds]);

  const mut = useMutation({
    mutationFn: () => {
      if (!segment) throw new Error("Pick at least one recipient");
      return sendBroadcast({
        title,
        body,
        segment,
        deepLink: composedDeepLink || undefined
      });
    },
    onSuccess: (result) => {
      toast.success(
        `Sent — ${result?.deliveredCount ?? 0} pushes to ${result?.recipientCount ?? 0} users`
      );
      router.push("/notifications");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const sendDisabled =
    !title.trim() ||
    !body.trim() ||
    !segment ||
    mut.isPending ||
    (audience === "users" && userIds.length === 0) ||
    (audience === "pet_type" && petTypes.length === 0);

  function togglePetType(slug: string) {
    setPetTypes((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }

  function addUser(id: string) {
    if (!id) return;
    setUserIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function removeUser(id: string) {
    setUserIds((prev) => prev.filter((u) => u !== id));
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Broadcast"
        description="Send a push to a specific cohort. Respects per-user notification preferences."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,1fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Message</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short, punchy"
                  maxLength={80}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Body</Label>
                <Textarea
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Context for the user"
                  maxLength={240}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audience</CardTitle>
              <p className="text-xs text-[var(--muted-foreground)]">
                Choose who receives this push.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                <AudienceTab
                  active={audience === "all"}
                  icon={Users}
                  label="All users"
                  onClick={() => setAudience("all")}
                />
                <AudienceTab
                  active={audience === "pet_type"}
                  icon={PawPrint}
                  label="By pet type"
                  onClick={() => setAudience("pet_type")}
                />
                <AudienceTab
                  active={audience === "users"}
                  icon={Hash}
                  label="Specific users"
                  onClick={() => setAudience("users")}
                />
              </div>

              {audience === "pet_type" ? (
                <div className="flex flex-wrap gap-1.5">
                  {(speciesQuery.data ?? []).length === 0 ? (
                    <span className="text-xs text-[var(--muted-foreground)]">
                      Loading species…
                    </span>
                  ) : (
                    (speciesQuery.data ?? []).map((s) => {
                      const slug = s.slug;
                      const checked = petTypes.includes(slug);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => togglePetType(slug)}
                          className={
                            "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors " +
                            (checked
                              ? "border-[#E6694A] bg-[#E6694A]/10 text-[#E6694A]"
                              : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]")
                          }
                        >
                          <PawPrint className="h-3 w-3" />
                          {s.label}
                        </button>
                      );
                    })
                  )}
                  {petTypes.length === 0 ? (
                    <span className="w-full text-[11px] text-[var(--muted-foreground)]">
                      Pick one or more species. Owners of any matching pet receive the push.
                    </span>
                  ) : null}
                </div>
              ) : null}

              {audience === "users" ? (
                <div className="flex flex-col gap-2">
                  <Input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by name, email, or paste a user id"
                  />
                  <div className="max-h-48 overflow-y-auto rounded-md border border-[var(--border)]">
                    {(usersQuery.data?.data ?? []).length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-[var(--muted-foreground)]">
                        {userSearch
                          ? "No matches."
                          : "Start typing to search users."}
                      </div>
                    ) : (
                      (usersQuery.data?.data ?? []).map((u) => {
                        const picked = userIds.includes(u.id);
                        const display =
                          [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => (picked ? removeUser(u.id) : addUser(u.id))}
                            className="flex w-full items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--muted)]"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-[var(--foreground)]">
                                {display}
                              </div>
                              <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                                {u.email}
                              </div>
                            </div>
                            {picked ? (
                              <Badge tone="success">picked</Badge>
                            ) : (
                              <span className="text-[11px] text-[var(--primary)]">
                                + Add
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {userIds.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {userIds.map((id) => (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-md bg-[var(--muted)] px-2 py-0.5 text-[11px] text-[var(--foreground)]"
                        >
                          {id.slice(0, 18)}…
                          <button
                            type="button"
                            onClick={() => removeUser(id)}
                            aria-label={`Remove ${id}`}
                          >
                            <X className="h-3 w-3 text-[var(--muted-foreground)] hover:text-[var(--destructive)]" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deep link</CardTitle>
              <p className="text-xs text-[var(--muted-foreground)]">
                Where the app opens when the user taps the push. Optional — leave as "None"
                for an info-only notification.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                <LinkKindTab
                  active={linkKind === "none"}
                  icon={X}
                  label="None"
                  onClick={() => {
                    setLinkKind("none");
                    setLinkTargetId("");
                    setLinkStaticUrl("");
                  }}
                />
                <LinkKindTab
                  active={linkKind === "static"}
                  icon={Link2}
                  label="App page"
                  onClick={() => {
                    setLinkKind("static");
                    setLinkTargetId("");
                  }}
                />
                <LinkKindTab
                  active={linkKind === "playdate"}
                  icon={Calendar}
                  label="Playdate"
                  onClick={() => {
                    setLinkKind("playdate");
                    setLinkStaticUrl("");
                    setLinkTargetId("");
                  }}
                />
                <LinkKindTab
                  active={linkKind === "group"}
                  icon={Users}
                  label="Group"
                  onClick={() => {
                    setLinkKind("group");
                    setLinkStaticUrl("");
                    setLinkTargetId("");
                  }}
                />
                <LinkKindTab
                  active={linkKind === "venue"}
                  icon={MapPin}
                  label="Venue"
                  onClick={() => {
                    setLinkKind("venue");
                    setLinkStaticUrl("");
                    setLinkTargetId("");
                  }}
                />
                <LinkKindTab
                  active={linkKind === "user"}
                  icon={Hash}
                  label="User id"
                  onClick={() => {
                    setLinkKind("user");
                    setLinkStaticUrl("");
                    setLinkTargetId("");
                  }}
                />
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
                        {entry.description ? (
                          <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                            {entry.description}
                          </div>
                        ) : null}
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
            </CardContent>
          </Card>
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <p className="text-xs text-[var(--muted-foreground)]">
                What the user will see and where they'll land.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  Petto
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-[var(--foreground)]">
                  {title || <em className="text-[var(--muted-foreground)]">Title…</em>}
                </div>
                <div className="mt-0.5 line-clamp-3 text-xs text-[var(--foreground)]">
                  {body || <em className="text-[var(--muted-foreground)]">Body…</em>}
                </div>
              </div>

              <div className="flex flex-col gap-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-[var(--muted-foreground)]" />
                  <span className="text-[var(--muted-foreground)]">Audience:</span>
                  <span className="font-medium text-[var(--foreground)]">
                    {audience === "all"
                      ? "All users"
                      : audience === "pet_type"
                        ? petTypes.length === 0
                          ? "Pick a pet type"
                          : `Pet type · ${petTypes.join(", ")}`
                        : userIds.length === 0
                          ? "Pick users"
                          : `${userIds.length} user${userIds.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Link2 className="h-3 w-3 text-[var(--muted-foreground)]" />
                  <span className="text-[var(--muted-foreground)]">Deep link:</span>
                  <span className="break-all font-mono text-[10px] text-[var(--foreground)]">
                    {composedDeepLink || (
                      <em className="text-[var(--muted-foreground)]">none</em>
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => router.back()}>
                  Cancel
                </Button>
                <Button disabled={sendDisabled} onClick={() => mut.mutate()}>
                  <Send className="h-4 w-4" />
                  {mut.isPending ? "Sending…" : "Send broadcast"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AudienceTab({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors " +
        (active
          ? "border-[#E6694A] bg-[#E6694A]/10 text-[#E6694A]"
          : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]")
      }
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function LinkKindTab(props: React.ComponentProps<typeof AudienceTab>) {
  return <AudienceTab {...props} />;
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
    return (
      <span className="text-xs text-[var(--muted-foreground)]">Loading…</span>
    );
  }
  if (options.length === 0) {
    return (
      <span className="text-xs text-[var(--muted-foreground)]">No items available.</span>
    );
  }
  return (
    <div className="max-h-56 overflow-y-auto rounded-md border border-[var(--border)]">
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
