"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LocationPicker, type LocationValue } from "@/components/common/LocationPicker";
import {
  adminPresignUpload,
  getPosts,
  getVenues,
  updateVenue,
} from "@/lib/admin-api";
import type { ExploreVenue } from "@petto/contracts";

const CATEGORY_COLORS: Record<string, string> = {
  park: "bg-emerald-100 text-emerald-800",
  cafe: "bg-amber-100 text-amber-800",
  bar: "bg-violet-100 text-violet-800",
  beach: "bg-sky-100 text-sky-800",
  trail: "bg-lime-100 text-lime-800",
  other: "bg-gray-100 text-gray-700",
};

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-[var(--petto-border)] bg-white px-3 py-2 text-sm";

export default function VenueDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  /* ---- data fetching ---- */
  const { data: venues = [], isLoading: venuesLoading } = useQuery({
    queryKey: ["admin-venues"],
    queryFn: getVenues,
  });

  const { data: allPosts = [], isLoading: postsLoading } = useQuery({
    queryKey: ["admin-posts"],
    queryFn: getPosts,
  });

  const venue = venues.find((v) => v.id === params.id);
  const taggedPosts = allPosts.filter((p) => p.venueId === params.id);

  /* ---- edit form state ---- */
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "",
    description: "",
    cityLabel: "",
    address: "",
    hours: "",
    latitude: 0,
    longitude: 0,
  });

  /* ---- image upload state ---- */
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  function startEditing() {
    if (!venue) return;
    setForm({
      name: venue.name || "",
      category: venue.category || "park",
      description: venue.description || "",
      cityLabel: venue.cityLabel || "",
      address: venue.address || "",
      hours: venue.hours || "",
      latitude: venue.latitude,
      longitude: venue.longitude,
    });
    setImageFile(null);
    setImagePreview("");
    setEditing(true);
  }

  /* ---- update mutation ---- */
  const updateMutation = useMutation({
    mutationFn: async () => {
      let imageUrl = venue?.imageUrl;
      if (imageFile) {
        setUploading(true);
        try {
          const presign = await adminPresignUpload(imageFile.name, imageFile.type, "venues");
          await fetch(presign.uploadUrl, {
            method: "PUT",
            body: imageFile,
            headers: { "Content-Type": imageFile.type },
          });
          imageUrl = presign.publicUrl;
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
        imageUrl: imageUrl || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      setEditing(false);
      setImageFile(null);
      setImagePreview("");
    },
  });

  /* ---- check-in histogram ---- */
  function buildHourlyHistogram(checkIns: ExploreVenue["currentCheckIns"]) {
    const hours = new Array(24).fill(0);
    for (const ci of checkIns) {
      const date = new Date(ci.checkedInAt);
      if (!isNaN(date.getTime())) {
        hours[date.getHours()]++;
      }
    }
    return hours;
  }

  /* ---- photo gallery ---- */
  function collectPhotos(): string[] {
    const photos: string[] = [];
    if (venue?.imageUrl) photos.push(venue.imageUrl);
    for (const post of taggedPosts) {
      if (post.imageUrl) photos.push(post.imageUrl);
    }
    return photos;
  }

  /* ---- loading / not found states ---- */
  const isLoading = venuesLoading || postsLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--petto-primary)] border-t-transparent" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="space-y-5">
        <Card>
          <Link href="/venues" className="inline-flex items-center gap-2 text-sm text-[var(--petto-primary)] hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to venues
          </Link>
          <p className="mt-4 text-center text-[var(--petto-muted)]">Venue not found.</p>
        </Card>
      </div>
    );
  }

  const checkIns = venue.currentCheckIns;
  const hourlyData = buildHourlyHistogram(checkIns);
  const maxHourly = Math.max(...hourlyData, 1);
  const photos = collectPhotos();

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Card>
        <Link href="/venues" className="inline-flex items-center gap-2 text-sm text-[var(--petto-primary)] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to venues
        </Link>
      </Card>

      {/* ===== Venue Info Card ===== */}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-[var(--petto-ink)]">{venue.name}</h1>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${CATEGORY_COLORS[venue.category] ?? CATEGORY_COLORS.other}`}
              >
                {venue.category}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--petto-muted)]">{venue.cityLabel}</p>
            {venue.address && <p className="mt-1 text-sm text-[var(--petto-ink)]">{venue.address}</p>}
            {venue.hours && <p className="mt-1 text-xs text-[var(--petto-muted)]">{venue.hours}</p>}
            {venue.description && (
              <p className="mt-3 text-sm leading-7 text-[var(--petto-muted)]">{venue.description}</p>
            )}
          </div>
          {venue.imageUrl && (
            <img
              src={venue.imageUrl}
              alt={venue.name}
              className="h-28 w-28 shrink-0 rounded-xl object-cover"
            />
          )}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--petto-muted)]">
            {checkIns.length} live check-ins
          </p>
          {!editing && (
            <Button variant="ghost" className="text-[var(--petto-primary)]" onClick={startEditing}>
              Edit Venue
            </Button>
          )}
        </div>
      </Card>

      {/* ===== Edit Form ===== */}
      {editing && (
        <Card>
          <h2 className="mb-4 text-xl font-semibold text-[var(--petto-ink)]">Edit Venue</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            <Input
              placeholder="Venue name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
            <select
              className={SELECT_CLASS}
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
            >
              <option value="park">Park</option>
              <option value="cafe">Cafe</option>
              <option value="bar">Bar</option>
              <option value="beach">Beach</option>
              <option value="trail">Trail</option>
              <option value="other">Other</option>
            </select>
            <Input
              placeholder="City"
              value={form.cityLabel}
              onChange={(e) => setForm((p) => ({ ...p, cityLabel: e.target.value }))}
            />
            <Input
              placeholder="Hours (e.g. Mon 09:00-17:00, Tue 09:00-17:00)"
              value={form.hours}
              onChange={(e) => setForm((p) => ({ ...p, hours: e.target.value }))}
            />

            {/* Location picker — address + map + draggable marker */}
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

            {/* Image Upload */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[var(--petto-ink)]">Venue Image</label>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer rounded-md border border-dashed border-[var(--petto-border)] px-4 py-3 text-sm text-[var(--petto-muted)] hover:border-[var(--petto-primary)]">
                  {imageFile ? imageFile.name : "Choose new image..."}
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                </label>
                {(imagePreview || venue.imageUrl) && (
                  <img
                    src={imagePreview || venue.imageUrl}
                    className="h-12 w-12 rounded-lg object-cover"
                    alt="Preview"
                  />
                )}
              </div>
              {uploading && <p className="text-xs text-amber-600 animate-pulse">Uploading image...</p>}
            </div>

            <div className="lg:col-span-2">
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-[var(--petto-border)] bg-white px-3 py-2 text-sm placeholder:text-[var(--petto-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--petto-primary)] focus-visible:ring-offset-2"
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 lg:col-span-2">
              <Button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending || uploading}
              >
                {updateMutation.isPending || uploading ? "Saving..." : "Save Changes"}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ===== Check-in Report ===== */}
      <Card>
        <h2 className="text-xl font-semibold text-[var(--petto-ink)]">Check-in Report</h2>
        <p className="mt-1 text-sm text-[var(--petto-muted)]">
          Total check-ins: <strong className="text-[var(--petto-ink)]">{checkIns.length}</strong>
        </p>

        {/* Hourly histogram */}
        {checkIns.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-[var(--petto-ink)]">Check-ins by Hour</h3>
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {hourlyData.map((count, hour) => (
                <div key={hour} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-[var(--petto-primary)] transition-all"
                    style={{
                      height: `${(count / maxHourly) * 100}px`,
                      minHeight: count > 0 ? 4 : 0,
                    }}
                    title={`${hour}:00 - ${count} check-in(s)`}
                  />
                  {hour % 4 === 0 && (
                    <span className="text-[10px] text-[var(--petto-muted)]">{hour}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Check-in list */}
        {checkIns.length > 0 ? (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-semibold text-[var(--petto-ink)]">Who Checked In</h3>
            {checkIns.map((ci, idx) => (
              <div key={idx} className="flex items-center gap-3 rounded-xl border border-[var(--petto-border)] bg-white/60 p-3">
                {ci.avatarUrl ? (
                  <img src={ci.avatarUrl} alt={ci.userName} className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--petto-primary)]/10 text-sm font-semibold text-[var(--petto-primary)]">
                    {ci.userName.charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--petto-ink)]">{ci.userName}</p>
                  {ci.petNames.length > 0 && (
                    <p className="text-xs text-[var(--petto-muted)]">
                      with {ci.petNames.join(", ")}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-xs text-[var(--petto-muted)]">
                  {new Date(ci.checkedInAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--petto-muted)]">No check-ins yet.</p>
        )}
      </Card>

      {/* ===== Tagged Posts ===== */}
      <Card>
        <h2 className="text-xl font-semibold text-[var(--petto-ink)]">Tagged Posts</h2>
        {taggedPosts.length > 0 ? (
          <div className="mt-3 space-y-3">
            {taggedPosts.map((post) => (
              <div key={post.id} className="rounded-xl border border-[var(--petto-border)] bg-white/60 p-4">
                <div className="flex items-start gap-3">
                  {post.author.avatarUrl ? (
                    <img src={post.author.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--petto-primary)]/10 text-sm font-semibold text-[var(--petto-primary)]">
                      {post.author.firstName?.charAt(0) ?? "?"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--petto-ink)]">
                      {post.author.firstName} {post.author.lastName}
                    </p>
                    <p className="text-xs text-[var(--petto-muted)]">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--petto-muted)]">
                    {post.likeCount} like{post.likeCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--petto-ink)]">{post.body}</p>
                {post.imageUrl && (
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="mt-3 h-40 w-full rounded-lg object-cover"
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--petto-muted)]">No posts tagged to this venue yet.</p>
        )}
      </Card>

      {/* ===== Photo Gallery ===== */}
      <Card>
        <h2 className="text-xl font-semibold text-[var(--petto-ink)]">Photo Gallery</h2>
        {photos.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt={`Venue photo ${idx + 1}`}
                className="aspect-square rounded-xl object-cover"
              />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--petto-muted)]">No photos yet.</p>
        )}
      </Card>
    </div>
  );
}
