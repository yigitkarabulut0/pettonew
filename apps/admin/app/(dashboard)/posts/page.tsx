"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, Heart } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { UserCell } from "@/components/common/UserCell";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { RowActions } from "@/components/data-table/columns";
import { useDataTable } from "@/components/data-table/useDataTable";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { HomePost } from "@petto/contracts";
import { deletePost, getPosts } from "@/lib/admin-api";

export default function PostsPage() {
  const qc = useQueryClient();
  const { state, setState, selection, setSelection } = useDataTable();
  const { confirm, node: confirmNode } = useConfirm();

  const query = useQuery({ queryKey: ["admin-posts"], queryFn: getPosts });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePost(id),
    onSuccess: () => {
      toast.success("Post deleted");
      qc.invalidateQueries({ queryKey: ["admin-posts"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const all = query.data ?? [];
  const filtered = React.useMemo(() => {
    const q = state.search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) =>
      [p.body, p.author?.firstName, p.author?.lastName, p.venueName, p.eventName].some((v) =>
        v?.toLowerCase().includes(q)
      )
    );
  }, [all, state.search]);
  const paged = React.useMemo(() => {
    const start = (state.page - 1) * state.pageSize;
    return filtered.slice(start, start + state.pageSize);
  }, [filtered, state.page, state.pageSize]);

  const columns = React.useMemo<ColumnDef<HomePost, unknown>[]>(
    () => [
      {
        accessorKey: "author",
        header: "Author",
        cell: ({ row }) => {
          const a = row.original.author;
          return (
            <UserCell
              id={a.id}
              name={`${a.firstName ?? ""} ${a.lastName ?? ""}`.trim()}
              subtitle={a.cityLabel ?? undefined}
              avatarUrl={a.avatarUrl}
            />
          );
        }
      },
      {
        accessorKey: "body",
        header: "Content",
        cell: ({ row }) => (
          <div className="max-w-[340px] truncate text-sm text-[var(--foreground)]">
            {row.original.body || <em className="text-[var(--muted-foreground)]">(empty)</em>}
          </div>
        )
      },
      {
        id: "media",
        header: "Media",
        cell: ({ row }) =>
          row.original.imageUrl ? (
            <PostThumbnail src={row.original.imageUrl} alt={row.original.body || "post image"} />
          ) : (
            <span className="text-[11px] text-[var(--muted-foreground)]">—</span>
          )
      },
      {
        id: "venue",
        header: "Venue",
        cell: ({ row }) => (
          <span className="text-xs text-[var(--muted-foreground)]">{row.original.venueName || "—"}</span>
        )
      },
      {
        accessorKey: "likeCount",
        header: "Likes",
        cell: ({ row }) => (
          <Badge tone={row.original.likeCount > 0 ? "success" : "neutral"}>
            <Heart className="h-3 w-3" /> {row.original.likeCount}
          </Badge>
        )
      },
      {
        accessorKey: "createdAt",
        header: "Posted",
        cell: ({ row }) => <RelativeTime value={row.original.createdAt} />
      },
      {
        id: "_actions",
        header: "",
        cell: ({ row }) => (
          <RowActions
            items={[
              {
                label: "Delete post",
                destructive: true,
                onSelect: async () => {
                  await confirm({
                    title: "Delete this post?",
                    description: "The post will be removed for everyone.",
                    destructive: true,
                    requireReason: true,
                    confirmLabel: "Delete",
                    onConfirm: () => deleteMut.mutateAsync(row.original.id)
                  });
                }
              }
            ]}
          />
        )
      }
    ],
    [confirm, deleteMut]
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Posts"
        description="Moderate community posts — delete spam, bullying, or anything that breaks the rules."
      />
      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
        searchPlaceholder="Search body, author, venue"
      />
      <DataTable<HomePost>
        data={paged}
        columns={columns}
        rowId={(row) => row.id}
        total={filtered.length}
        state={state}
        onStateChange={setState}
        loading={query.isLoading}
        selection={selection}
        onSelectionChange={setSelection}
      />
      {confirmNode}
    </div>
  );
}

// Inline post-image thumbnail with a click-to-zoom lightbox. Lets the
// admin eyeball flagged content without leaving the table — important
// for fast moderation triage.
function PostThumbnail({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className="block h-12 w-12 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)] transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        aria-label="Preview image"
        title="Preview image"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="sr-only">Post image</DialogTitle>
          <div className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-[78vh] w-full rounded-md object-contain"
            />
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Open original
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
