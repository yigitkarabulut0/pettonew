"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Heart, Image as ImageIcon, MapPin, Trash2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { deletePost, getPosts } from "@/lib/admin-api";

function formatTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function PostsPage() {
  const queryClient = useQueryClient();
  const { data: posts = [] } = useQuery({
    queryKey: ["admin-posts"],
    queryFn: getPosts
  });

  const deleteMutation = useMutation({
    mutationFn: deletePost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
    }
  });

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">
          Posts
        </p>
        <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">
          Community publishing overview
        </h1>
      </Card>

      {!posts.length && (
        <Card>
          <p className="text-sm text-[var(--petto-muted)]">No posts yet.</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {posts.map((post) => (
          <Card key={post.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {post.author.avatarUrl ? (
                  <img
                    src={post.author.avatarUrl}
                    alt={post.author.firstName}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--petto-primary-soft)] text-sm font-bold text-[var(--petto-primary)]">
                    {post.author.firstName[0]}
                    {post.author.lastName?.[0] ?? ""}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-[var(--petto-ink)]">
                    {post.author.firstName} {post.author.lastName}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-[var(--petto-muted)]">
                    <MapPin size={11} />
                    {post.author.cityLabel}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(post.id)}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-500 transition-colors hover:bg-red-100 disabled:opacity-50"
                  title="Delete post"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-3 text-xs text-[var(--petto-muted)]">
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {formatTime(post.createdAt)}
              </span>
              <span className="flex items-center gap-1">
                <Heart size={11} />
                {post.likeCount} likes
              </span>
              <span className="text-[10px] font-mono opacity-50">
                {post.id}
              </span>
            </div>

            {post.imageUrl ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-[var(--petto-border)]">
                <img
                  src={post.imageUrl}
                  alt="Post"
                  className="h-52 w-full object-cover"
                />
              </div>
            ) : (
              <div className="mt-3 flex h-24 items-center justify-center rounded-lg border border-dashed border-[var(--petto-border)] text-xs text-[var(--petto-muted)]">
                <ImageIcon size={14} className="mr-1.5 opacity-50" />
                No image
              </div>
            )}

            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--petto-ink)]">
              {post.body}
            </p>

            {post.taggedPets.length ? (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--petto-muted)]">
                  Tagged pets
                </p>
                <div className="flex flex-wrap gap-2">
                  {post.taggedPets.map((pet) => (
                    <div
                      key={pet.id}
                      className="flex items-center gap-2 rounded-full border border-[var(--petto-border)] bg-[var(--petto-surface)] px-2.5 py-1"
                    >
                      {pet.photos[0]?.url ? (
                        <img
                          src={pet.photos[0].url}
                          alt={pet.name}
                          className="h-5 w-5 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--petto-primary-soft)] text-[9px] font-bold text-[var(--petto-primary)]">
                          {pet.name[0]}
                        </div>
                      )}
                      <div>
                        <span className="text-xs font-semibold text-[var(--petto-ink)]">
                          {pet.name}
                        </span>
                        <span className="ml-1 text-[10px] text-[var(--petto-muted)]">
                          {pet.breedLabel} &middot; {pet.speciesLabel} &middot;{" "}
                          {pet.ageYears}y
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
