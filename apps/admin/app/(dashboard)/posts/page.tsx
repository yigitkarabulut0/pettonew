"use client";

import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPosts } from "@/lib/admin-api";

export default function PostsPage() {
  const { data: posts = [] } = useQuery({
    queryKey: ["admin-posts"],
    queryFn: getPosts
  });

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Posts</p>
        <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">Community publishing overview</h1>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {posts.map((post) => (
          <Card key={post.id}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-[var(--petto-ink)]">
                  {post.author.firstName} {post.author.lastName}
                </p>
                <p className="text-sm text-[var(--petto-muted)]">{post.author.cityLabel}</p>
              </div>
              <Badge tone="success">{post.likeCount} likes</Badge>
            </div>
            <p className="mt-4 text-sm leading-7 text-[var(--petto-muted)]">{post.body}</p>
            {post.taggedPets.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {post.taggedPets.map((pet) => (
                  <span
                    key={pet.id}
                    className="rounded-full bg-[var(--petto-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--petto-secondary)]"
                  >
                    {pet.name}
                  </span>
                ))}
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
