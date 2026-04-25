"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExploreVenue } from "@petto/contracts";
import {
  ArrowLeft,
  CalendarClock,
  Eye,
  EyeOff,
  ImageIcon,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Users
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { LocationPicker, type LocationValue } from "@/components/common/LocationPicker";
import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addVenuePhoto,
  deleteVenuePhoto,
  getPosts,
  getVenuePhotosManage,
  getVenues,
  setVenuePostPhotoHidden,
  updateVenue,
  type VenuePhotoEntry
} from "@/lib/admin-api";
import { uploadImageFile } from "@/lib/media";
import { cn } from "@/lib/utils";

const CATEGORY_TONES: Record<string, "brand" | "success" | "warning" | "info" | "neutral"> = {
  park: "success",
  cafe: "warning",
  bar: "brand",
  beach: "info",
  trail: "success",
  other: "neutral"
};

const CATEGORY_OPTIONS = ["park", "cafe", "bar", "beach", "trail", "other"] as const;

export default function VenueDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: venues = [], isLoading: venuesLoading } = useQuery({
    queryKey: ["admin-venues"],
    queryFn: getVenues
  });

  const { data: allPosts = [], isLoading: postsLoading } = useQuery({
    queryKey: ["admin-posts"],
    queryFn: getPosts
  });

  const venue = venues.find((v) => v.id === params.id);
  const taggedPosts = allPosts.filter((p) => p.venueId === params.id);
  const isLoading = venuesLoading || postsLoading;

  const [editing, setEditing] = React.useState(false);
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string>("");
  const [uploading, setUploading] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    category: "park",
    description: "",
    cityLabel: "",
    address: "",
    hours: "",
    latitude: 0,
    longitude: 0
  });

  const startEditing = React.useCallback(() => {
    if (!venue) return;
    setForm({
      name: venue.name || "",
      category: venue.category || "park",
      description: venue.description || "",
      cityLabel: venue.cityLabel || "",
      address: venue.address || "",
      hours: venue.hours || "",
      latitude: venue.latitude,
      longitude: venue.longitude
    });
    setImageFile(null);
    setImagePreview("");
    setEditing(true);
  }, [venue]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      // Preserve the existing image unless the admin explicitly picked a new
      // file. Prior bug (pre-v0.13.6) used presign.publicUrl which was
      // undefined — uploads succeeded but the URL never landed on the row.
      let imageUrl = venue?.imageUrl;
      if (imageFile) {
        setUploading(true);
        try {
          imageUrl = await uploadImageFile(imageFile, "venues");
        } finally {
          setUploading(false);
        }
      }
      return updateVenue(params.id, {
        name: form.name,
        category: form.category,
        description: form.description,
        cityLabel: form.cityLabel,
        address: form.address,
        hours: form.hours,
        latitude: form.latitude,
        longitude: form.longitude,
        imageUrl: imageUrl || undefined
      });
    },
    onSuccess: () => {
      toast.success("Venue updated");
      queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      setEditing(false);
      setImageFile(null);
      setImagePreview("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed")
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-72 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Venue not found"
          breadcrumbs={
            <BackLink />
          }
        />
        <EmptyState
          icon={MapPin}
          title="This venue doesn't exist"
          description="It may have been deleted. Head back to the list to pick another."
          action={
            <Button size="sm" onClick={() => router.push("/venues")} className="gap-2">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to venues
            </Button>
          }
        />
      </div>
    );
  }

  const checkIns = venue.currentCheckIns;
  const hourlyData = buildHourlyHistogram(checkIns);
  const maxHourly = Math.max(...hourlyData, 1);

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={<BackLink />}
        title={venue.name}
        description={[venue.cityLabel, venue.address].filter(Boolean).join(" · ")}
        actions={
          editing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setImageFile(null);
                  setImagePreview("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending || uploading}
                className="gap-2"
              >
                <Upload className="h-3.5 w-3.5" />
                {updateMutation.isPending || uploading ? "Saving…" : "Save changes"}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={startEditing} className="gap-2">
              <Pencil className="h-3.5 w-3.5" />
              Edit venue
            </Button>
          )
        }
      />

      {/* Hero + vitals */}
      <Card className="overflow-hidden p-0">
        <VenueHero venue={venue} />
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={CATEGORY_TONES[venue.category] ?? "neutral"} className="capitalize">
                {venue.category}
              </Badge>
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                <Users className="h-3.5 w-3.5" />
                {checkIns.length} live check-in{checkIns.length === 1 ? "" : "s"}
              </span>
              {venue.hours ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {venue.hours}
                </span>
              ) : null}
            </div>
            {venue.description ? (
              <p className="max-w-2xl text-sm leading-6 text-[var(--foreground)]">
                {venue.description}
              </p>
            ) : (
              <p className="text-xs italic text-[var(--muted-foreground)]">
                No description yet.
              </p>
            )}
          </div>
        </div>
      </Card>

      {editing ? (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Edit venue</h2>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            Image auto-optimises to WebP. Coordinates come from the map pin.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <Input
              placeholder="Venue name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
            <Select
              value={form.category}
              onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="City"
              value={form.cityLabel}
              onChange={(e) => setForm((p) => ({ ...p, cityLabel: e.target.value }))}
            />
            <Input
              placeholder="Hours (Mon 09:00-17:00, …)"
              value={form.hours}
              onChange={(e) => setForm((p) => ({ ...p, hours: e.target.value }))}
            />

            <div className="lg:col-span-2">
              <LocationPicker
                value={{
                  address: form.address,
                  latitude: form.latitude,
                  longitude: form.longitude
                }}
                onChange={(loc: LocationValue) =>
                  setForm((p) => ({
                    ...p,
                    address: loc.address,
                    latitude: loc.latitude,
                    longitude: loc.longitude,
                    cityLabel: p.cityLabel || loc.cityLabel || ""
                  }))
                }
                markerColor="#6d28d9"
                label="Address"
                mapHeight={300}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Venue image
              </label>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-xs text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]">
                  <Upload className="h-3.5 w-3.5" />
                  {imageFile ? imageFile.name : "Replace image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                </label>
                {imagePreview || venue.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imagePreview || venue.imageUrl}
                    className="h-12 w-12 rounded-md object-cover ring-1 ring-[var(--border)]"
                    alt="Preview"
                  />
                ) : null}
              </div>
              {uploading ? (
                <p className="animate-pulse text-[11px] text-[var(--warning)]">
                  Uploading image…
                </p>
              ) : null}
            </div>

            <div className="lg:col-span-2">
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-1"
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
        </Card>
      ) : null}

      {/* Check-in report */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Check-in report</h2>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              Total live check-ins:{" "}
              <span className="font-semibold text-[var(--foreground)]">{checkIns.length}</span>
            </p>
          </div>
        </div>

        {checkIns.length > 0 ? (
          <>
            <div className="mt-5">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Check-ins by hour
              </p>
              <div className="flex items-end gap-1" style={{ height: 120 }}>
                {hourlyData.map((count, hour) => (
                  <div key={hour} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-[var(--primary)] transition-all"
                      style={{
                        height: `${(count / maxHourly) * 100}px`,
                        minHeight: count > 0 ? 4 : 0
                      }}
                      title={`${hour}:00 — ${count} check-in(s)`}
                    />
                    {hour % 4 === 0 ? (
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        {hour}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
              {checkIns.map((ci, idx) => (
                <div key={idx} className="flex items-center gap-3 px-4 py-3">
                  {ci.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={ci.avatarUrl}
                      alt={ci.userName}
                      className="h-9 w-9 rounded-full object-cover ring-1 ring-[var(--border)]"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--muted)] text-xs font-semibold text-[var(--muted-foreground)]">
                      {ci.userName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--foreground)]">
                      {ci.userName}
                    </p>
                    {ci.petNames.length > 0 ? (
                      <p className="truncate text-[11px] text-[var(--muted-foreground)]">
                        with {ci.petNames.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
                    <RelativeTime value={ci.checkedInAt} />
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            className="mt-4"
            icon={Users}
            title="No check-ins yet"
            description="Once pet parents drop by, their check-ins will show up here."
          />
        )}
      </Card>

      {/* Tagged posts */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Tagged posts</h2>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              Home-feed posts pet parents tagged with this venue.
            </p>
          </div>
        </div>
        {taggedPosts.length > 0 ? (
          <div className="mt-4 space-y-3">
            {taggedPosts.map((post) => (
              <div
                key={post.id}
                className="rounded-md border border-[var(--border)] bg-[var(--background)] p-4"
              >
                <div className="flex items-start gap-3">
                  {post.author.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={post.author.avatarUrl}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover ring-1 ring-[var(--border)]"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--muted)] text-xs font-semibold text-[var(--muted-foreground)]">
                      {post.author.firstName?.charAt(0) ?? "?"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {post.author.firstName} {post.author.lastName}
                    </p>
                    <span className="text-[11px] text-[var(--muted-foreground)]">
                      <RelativeTime value={post.createdAt} />
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
                    {post.likeCount} like{post.likeCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">{post.body}</p>
                {post.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="mt-3 h-40 w-full rounded-md object-cover ring-1 ring-[var(--border)]"
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            className="mt-4"
            icon={MessageSquare}
            title="No posts tagged yet"
            description="Pet parents can tag this venue from the home composer."
          />
        )}
      </Card>

      <PhotoGallery venueId={venue.id} />
    </div>
  );
}

/* ── Managed photo gallery ─────────────────────────────────────────────
 * Three photo sources, each with its own controls:
 *   cover  — read-only (edited via "Edit venue" flow).
 *   admin  — curated additions. Upload new + delete per photo.
 *   post   — pulled from tagged home-feed posts. Toggle per photo to hide
 *            it from the venue gallery without touching the post itself.
 * Backed by /v1/admin/venues/{id}/photos (GET/POST/DELETE/PATCH). */
function PhotoGallery({ venueId }: { venueId: string }) {
  const queryClient = useQueryClient();
  const { confirm, node: confirmNode } = useConfirm();

  const {
    data: photos = [],
    isLoading
  } = useQuery({
    queryKey: ["admin-venue-photos", venueId],
    queryFn: () => getVenuePhotosManage(venueId)
  });

  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-venue-photos", venueId] });

  const addMutation = useMutation({
    mutationFn: (url: string) => addVenuePhoto(venueId, url),
    onSuccess: () => {
      toast.success("Photo added");
      invalidate();
      // Also refresh the cover card — a new admin photo might be the
      // next-best candidate if cover is missing.
      queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed")
  });

  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => deleteVenuePhoto(venueId, photoId),
    onSuccess: () => {
      toast.success("Photo removed");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed")
  });

  const hideMutation = useMutation({
    mutationFn: ({ postId, hidden }: { postId: string; hidden: boolean }) =>
      setVenuePostPhotoHidden(venueId, postId, hidden),
    onSuccess: (_, { hidden }) => {
      toast.success(hidden ? "Hidden from venue" : "Shown on venue");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const handleAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be picked twice in a row.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadImageFile(file, "venues");
      await addMutation.mutateAsync(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const coverCount = photos.filter((p) => p.kind === "cover").length;
  const adminPhotos = photos.filter((p) => p.kind === "admin");
  const postPhotos = photos.filter((p) => p.kind === "post");

  return (
    <Card className="p-5">
      {confirmNode}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Photo gallery</h2>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            Cover + admin-curated photos are always shown. Toggle individual
            post photos off to hide them from this venue without deleting the post.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || addMutation.isPending}
          className="gap-2"
        >
          <Plus className="h-3.5 w-3.5" />
          {uploading || addMutation.isPending ? "Uploading…" : "Add photo"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAdd}
        />
      </div>

      {isLoading ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={ImageIcon}
          title="No photos yet"
          description="Add a cover image via Edit venue, upload admin photos, or wait for tagged posts."
        />
      ) : (
        <div className="mt-4 space-y-5">
          {coverCount > 0 && (
            <GallerySection
              title="Cover"
              description="Primary image. Edit the venue to replace it."
              items={photos.filter((p) => p.kind === "cover")}
              renderItem={(p) => (
                <PhotoTile url={p.url} kindTone="brand" kindLabel="Cover" />
              )}
            />
          )}

          <GallerySection
            title="Admin-curated"
            description="Shown to everyone on Fetcht's venue page."
            empty="No admin photos yet — tap 'Add photo' above."
            items={adminPhotos}
            renderItem={(p) => (
              <PhotoTile
                url={p.url}
                kindTone="success"
                kindLabel="Added"
                actions={
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 px-2 text-[var(--destructive)] hover:text-[var(--destructive)]"
                    disabled={deleteMutation.isPending}
                    onClick={() =>
                      confirm({
                        title: "Remove this photo?",
                        description:
                          "It will disappear from the venue gallery on the app. You can always add it back later.",
                        confirmLabel: "Remove",
                        destructive: true,
                        onConfirm: () => deleteMutation.mutateAsync(p.id!)
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                }
              />
            )}
          />

          <GallerySection
            title="From tagged posts"
            description="Photos pet parents posted with this venue tagged. Hide individual ones that shouldn't represent the venue — the post itself stays untouched."
            empty="No tagged posts yet."
            items={postPhotos}
            renderItem={(p) => (
              <PhotoTile
                url={p.url}
                dim={p.hidden}
                kindTone={p.hidden ? "neutral" : "info"}
                kindLabel={p.hidden ? "Hidden" : "Public"}
                actions={
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "h-7 gap-1.5 px-2",
                      p.hidden
                        ? "text-[var(--foreground)]"
                        : "text-[var(--muted-foreground)]"
                    )}
                    disabled={hideMutation.isPending}
                    onClick={() =>
                      hideMutation.mutate({
                        postId: p.postId!,
                        hidden: !p.hidden
                      })
                    }
                  >
                    {p.hidden ? (
                      <>
                        <Eye className="h-3.5 w-3.5" />
                        Show
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3.5 w-3.5" />
                        Hide
                      </>
                    )}
                  </Button>
                }
              />
            )}
          />
        </div>
      )}
    </Card>
  );
}

function GallerySection({
  title,
  description,
  empty,
  items,
  renderItem
}: {
  title: string;
  description?: string;
  empty?: string;
  items: VenuePhotoEntry[];
  renderItem: (item: VenuePhotoEntry) => React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {title}
          <span className="ml-1.5 font-mono text-[var(--foreground)]">{items.length}</span>
        </h3>
      </div>
      {description ? (
        <p className="mb-3 text-[11px] text-[var(--muted-foreground)]">{description}</p>
      ) : null}
      {items.length === 0 ? (
        empty ? (
          <p className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-6 text-center text-[11px] text-[var(--muted-foreground)]">
            {empty}
          </p>
        ) : null
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((p, idx) => (
            <React.Fragment key={p.id ?? p.postId ?? p.url ?? idx}>
              {renderItem(p)}
            </React.Fragment>
          ))}
        </div>
      )}
    </section>
  );
}

function PhotoTile({
  url,
  kindLabel,
  kindTone,
  actions,
  dim
}: {
  url: string;
  kindLabel: string;
  kindTone: "brand" | "success" | "warning" | "info" | "neutral";
  actions?: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-md ring-1 ring-[var(--border)]",
        dim ? "opacity-50" : undefined
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="aspect-square w-full object-cover"
        loading="lazy"
      />
      <div className="absolute left-2 top-2">
        <Badge tone={kindTone}>{kindLabel}</Badge>
      </div>
      {actions ? (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="rounded bg-white/95 shadow-sm">{actions}</div>
        </div>
      ) : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/venues"
      className="inline-flex w-fit items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
    >
      <ArrowLeft className="h-3 w-3" />
      Back to venues
    </Link>
  );
}

function VenueHero({ venue }: { venue: ExploreVenue }) {
  if (venue.imageUrl) {
    return (
      <div className="relative h-56 w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={venue.imageUrl}
          alt={venue.name}
          className="h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex h-40 w-full items-center justify-center",
        "bg-gradient-to-br from-[var(--muted)] to-[var(--background)]"
      )}
    >
      <div className="flex flex-col items-center gap-2 text-[var(--muted-foreground)]">
        <MapPin className="h-8 w-8" />
        <span className="text-[11px] uppercase tracking-[0.18em]">No cover image</span>
      </div>
    </div>
  );
}

function buildHourlyHistogram(checkIns: ExploreVenue["currentCheckIns"]) {
  const hours = new Array(24).fill(0);
  for (const ci of checkIns) {
    const date = new Date(ci.checkedInAt);
    if (!isNaN(date.getTime())) hours[date.getHours()]++;
  }
  return hours;
}

