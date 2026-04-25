"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Heart, Info, Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { RowActions } from "@/components/data-table/columns";
import { useDataTable } from "@/components/data-table/useDataTable";
import {
  AdminFirstAidTopic,
  createAdminFirstAidTopic,
  deleteAdminFirstAidTopic,
  getAdminFirstAidTopics,
  updateAdminFirstAidTopic
} from "@/lib/admin-api";

type Severity = AdminFirstAidTopic["severity"];

type FormState = {
  id: string;
  title: string;
  severity: Severity;
  summary: string;
  body: string;
  displayOrder: string;
  slug: string;
};

const EMPTY_FORM: FormState = {
  id: "",
  title: "",
  severity: "info",
  summary: "",
  body: "",
  displayOrder: "0",
  slug: ""
};

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

const SEVERITY_TONE: Record<Severity, string> = {
  emergency:
    "bg-[var(--destructive-soft)] text-[var(--destructive)] ring-red-200",
  urgent:
    "bg-[var(--warning-soft)] text-[var(--warning)] ring-amber-200",
  info: "bg-[var(--info-soft)] text-[var(--info)] ring-blue-200"
};

const SEVERITY_LABEL: Record<Severity, string> = {
  emergency: "Emergency",
  urgent: "Urgent",
  info: "Good to know"
};

const severityIcon = (sev: Severity) =>
  sev === "emergency" ? AlertTriangle : sev === "urgent" ? Heart : Info;

export default function FirstAidTopicsPage() {
  const qc = useQueryClient();
  const { state, setState, selection, setSelection } = useDataTable();
  const { confirm, node: confirmNode } = useConfirm();

  const [severityFilter, setSeverityFilter] = React.useState<"" | Severity>("");
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);

  const topicsQuery = useQuery({
    queryKey: ["admin-first-aid-topics"],
    queryFn: getAdminFirstAidTopics
  });

  const all = topicsQuery.data ?? [];
  const filtered = React.useMemo(() => {
    const q = state.search.trim().toLowerCase();
    return all.filter((t) => {
      if (severityFilter && t.severity !== severityFilter) return false;
      if (!q) return true;
      return [t.title, t.slug, t.summary].some((v) =>
        v?.toLowerCase().includes(q)
      );
    });
  }, [all, state.search, severityFilter]);

  const paged = React.useMemo(() => {
    const start = (state.page - 1) * state.pageSize;
    return filtered.slice(start, start + state.pageSize);
  }, [filtered, state.page, state.pageSize]);

  const upsertMutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: form.title.trim(),
        severity: form.severity,
        summary: form.summary.trim() || undefined,
        body: form.body,
        displayOrder: parseInt(form.displayOrder, 10) || 0,
        slug: form.slug.trim() || undefined
      };
      return form.id
        ? updateAdminFirstAidTopic(form.id, payload)
        : createAdminFirstAidTopic(payload);
    },
    onSuccess: () => {
      toast.success(form.id ? "Topic updated" : "Topic created");
      qc.invalidateQueries({ queryKey: ["admin-first-aid-topics"] });
      setSheetOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminFirstAidTopic(id),
    onSuccess: () => {
      toast.success("Topic deleted");
      qc.invalidateQueries({ queryKey: ["admin-first-aid-topics"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  };

  const openEdit = (t: AdminFirstAidTopic) => {
    setForm({
      id: t.id,
      title: t.title,
      severity: t.severity,
      summary: t.summary ?? "",
      body: t.body,
      displayOrder: String(t.displayOrder ?? 0),
      slug: t.slug
    });
    setSheetOpen(true);
  };

  const askDelete = (t: AdminFirstAidTopic) => {
    confirm({
      title: `Delete "${t.title}"?`,
      description:
        "Mobile users will lose offline access to this topic on their next refresh.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await deleteMutation.mutateAsync(t.id);
      }
    });
  };

  const columns = React.useMemo<ColumnDef<AdminFirstAidTopic, unknown>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Topic",
        cell: ({ row }) => {
          const Icon = severityIcon(row.original.severity);
          return (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]">
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-medium text-[var(--foreground)]">
                  {row.original.title}
                </div>
                {row.original.summary ? (
                  <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                    {row.original.summary}
                  </div>
                ) : null}
              </div>
            </div>
          );
        }
      },
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ row }) => {
          const sev = row.original.severity;
          const Icon = severityIcon(sev);
          return (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${SEVERITY_TONE[sev]}`}
            >
              <Icon className="h-3 w-3" />
              {SEVERITY_LABEL[sev]}
            </span>
          );
        }
      },
      {
        accessorKey: "displayOrder",
        header: () => <div className="text-right">Order</div>,
        cell: ({ row }) => (
          <div className="text-right font-mono text-xs text-[var(--muted-foreground)]">
            {row.original.displayOrder}
          </div>
        )
      },
      {
        accessorKey: "slug",
        header: "Slug",
        cell: ({ row }) => (
          <code className="rounded bg-[var(--muted)] px-1 py-0.5 font-mono text-[11px] text-[var(--muted-foreground)]">
            {row.original.slug}
          </code>
        )
      },
      {
        id: "_actions",
        header: "",
        cell: ({ row }) => (
          <RowActions
            items={[
              { label: "Edit", onSelect: () => openEdit(row.original) },
              {
                label: "Delete",
                destructive: true,
                onSelect: () => askDelete(row.original)
              }
            ]}
          />
        )
      }
    ],
    []
  );

  const canSubmit =
    form.title.trim().length > 0 && form.body.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="First-Aid Topics"
        description="Offline-readable emergency handbook. Mobile downloads the full set on first open and caches it for offline use. Order by severity first; mobile shows them by Display Order ascending."
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            New topic
          </Button>
        }
      />

      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
        searchPlaceholder="Search by title or slug"
        trailing={
          <select
            className={SELECT_CLASS + " w-40"}
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as "" | Severity)}
          >
            <option value="">All severities</option>
            <option value="emergency">Emergency</option>
            <option value="urgent">Urgent</option>
            <option value="info">Good to know</option>
          </select>
        }
      />

      {!topicsQuery.isLoading && all.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="No topics yet"
          description="Start with the basics: choking, poisoning, heatstroke, bleeding control. Mark them all Emergency."
          action={
            <Button onClick={openCreate} size="sm">
              <Plus className="mr-1 h-4 w-4" />
              New topic
            </Button>
          }
        />
      ) : (
        <DataTable<AdminFirstAidTopic>
          data={paged}
          columns={columns}
          rowId={(row) => row.id}
          total={filtered.length}
          state={state}
          onStateChange={setState}
          loading={topicsQuery.isLoading}
          selection={selection}
          onSelectionChange={setSelection}
          onRowClick={(row) => openEdit(row)}
        />
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
        >
          <SheetHeader className="shrink-0 border-b border-[var(--border)] px-6 py-4">
            <SheetTitle>{form.id ? "Edit topic" : "New topic"}</SheetTitle>
            <SheetDescription>
              Body supports plain paragraphs separated by blank lines.
              Number the steps if it helps (1. … 2. …).
            </SheetDescription>
          </SheetHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) upsertMutation.mutate();
            }}
          >
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="fa-title">Title</Label>
              <Input
                id="fa-title"
                placeholder="Choking — what to do right now"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="fa-severity">Severity</Label>
                <select
                  id="fa-severity"
                  className={SELECT_CLASS}
                  value={form.severity}
                  onChange={(e) =>
                    setForm({ ...form, severity: e.target.value as Severity })
                  }
                >
                  <option value="emergency">Emergency</option>
                  <option value="urgent">Urgent</option>
                  <option value="info">Good to know</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="fa-order">Display order</Label>
                <Input
                  id="fa-order"
                  type="number"
                  placeholder="0"
                  value={form.displayOrder}
                  onChange={(e) =>
                    setForm({ ...form, displayOrder: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="fa-slug">Slug</Label>
                <Input
                  id="fa-slug"
                  placeholder="auto-from-title"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="fa-summary">Summary (optional)</Label>
              <Input
                id="fa-summary"
                placeholder="Shown collapsed in the mobile list"
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="fa-body">Body</Label>
              <Textarea
                id="fa-body"
                placeholder="Step-by-step instructions. Use blank lines between paragraphs. This is what users will read in an emergency — be direct."
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={14}
                className="font-mono text-xs"
              />
            </div>

            </div>

            <SheetFooter className="shrink-0 border-t border-[var(--border)] bg-[var(--petto-surface)] px-6 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit || upsertMutation.isPending}
              >
                {upsertMutation.isPending
                  ? "Saving…"
                  : form.id
                  ? "Save changes"
                  : "Create topic"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {confirmNode}
    </div>
  );
}
