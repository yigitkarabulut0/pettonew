"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Newspaper, Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { RowActions } from "@/components/data-table/columns";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTable } from "@/components/data-table/useDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  type Announcement,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements
} from "@/lib/api/system";

export default function AnnouncementsPage() {
  const { state, setState } = useDataTable();
  const qc = useQueryClient();
  const { confirm, node: confirmNode } = useConfirm();
  const [composeOpen, setComposeOpen] = React.useState(false);

  const query = useQuery({
    queryKey: ["announcements", state],
    queryFn: () => listAnnouncements(state)
  });

  const createMut = useMutation({
    mutationFn: createAnnouncement,
    onSuccess: () => {
      toast.success("Announcement scheduled");
      setComposeOpen(false);
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const deleteMut = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["announcements"] });
    }
  });

  const columns = React.useMemo<ColumnDef<Announcement, unknown>[]>(
    () => [
      { accessorKey: "title", header: "Title" },
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ row }) => {
          const s = row.original.severity;
          return <Badge tone={s === "critical" ? "danger" : s === "warn" ? "warning" : "info"}>{s}</Badge>;
        }
      },
      {
        accessorKey: "startsAt",
        header: "Starts",
        cell: ({ row }) => <RelativeTime value={row.original.startsAt} />
      },
      {
        accessorKey: "endsAt",
        header: "Ends",
        cell: ({ row }) => <RelativeTime value={row.original.endsAt} />
      },
      {
        id: "_actions",
        header: "",
        cell: ({ row }) => (
          <RowActions
            items={[
              {
                label: "Delete",
                destructive: true,
                onSelect: async () => {
                  await confirm({
                    title: "Delete announcement?",
                    destructive: true,
                    requireReason: true,
                    onConfirm: async () => deleteMut.mutateAsync(row.original.id)
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
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Announcements"
        description="Publish in-app banners or bulletins to users segmented by cohort."
        actions={
          <Button onClick={() => setComposeOpen(true)}>
            <Plus className="h-4 w-4" /> New announcement
          </Button>
        }
      />
      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
      />
      <DataTable
        data={query.data?.data ?? []}
        columns={columns}
        rowId={(row) => row.id}
        total={query.data?.total}
        state={state}
        onStateChange={setState}
        loading={query.isLoading}
        selectable={false}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-6 text-sm text-[var(--petto-muted)]">
            <Newspaper className="h-5 w-5" />
            <div>No announcements scheduled.</div>
          </div>
        }
      />
      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        pending={createMut.isPending}
        onSubmit={(values) => createMut.mutate(values)}
      />
      {confirmNode}
    </div>
  );
}

function ComposeDialog({
  open,
  onOpenChange,
  onSubmit,
  pending
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Omit<Announcement, "id" | "createdAt">) => void;
  pending: boolean;
}) {
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [severity, setSeverity] = React.useState<"info" | "warn" | "critical">("info");

  React.useEffect(() => {
    if (!open) {
      setTitle("");
      setBody("");
      setSeverity("info");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New announcement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Body</Label>
            <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Severity</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                title,
                body,
                severity,
                startsAt: new Date().toISOString()
              })
            }
            disabled={pending || !title || !body}
          >
            {pending ? "Saving…" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
