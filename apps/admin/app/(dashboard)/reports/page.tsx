"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Flag, Image as ImageIcon, MessageSquare, PawPrint, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar, FacetFilter } from "@/components/data-table/DataTableToolbar";
import { useDataTable } from "@/components/data-table/useDataTable";
import { Badge } from "@/components/ui/badge";
import type { ReportSummary } from "@petto/contracts";
import { getReports } from "@/lib/admin-api";

const TYPE_ICON = {
  chat: MessageSquare,
  post: ImageIcon,
  pet: PawPrint,
  user: Shield
} as const;

export default function ReportsPage() {
  const router = useRouter();
  const { state, setState, selection, setSelection } = useDataTable();

  const query = useQuery({
    queryKey: ["admin-reports"],
    queryFn: getReports
  });

  const all = query.data ?? [];
  const status = (state.filters.status as string | undefined) ?? undefined;
  const targetType = (state.filters.targetType as string | undefined) ?? undefined;

  const filtered = React.useMemo(() => {
    const q = state.search.trim().toLowerCase();
    return all.filter((r) => {
      if (status && r.status !== status) return false;
      if (targetType && r.targetType !== targetType) return false;
      if (q && ![r.reason, r.reporterName, r.targetLabel].some((v) => v?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [all, state.search, status, targetType]);

  const paged = React.useMemo(() => {
    const start = (state.page - 1) * state.pageSize;
    return filtered.slice(start, start + state.pageSize);
  }, [filtered, state.page, state.pageSize]);

  const openCount = all.filter((r) => r.status === "open").length;
  const resolvedCount = all.filter((r) => r.status === "resolved").length;
  const dismissedCount = all.filter((r) => (r.status as string) === "dismissed").length;

  const columns = React.useMemo<ColumnDef<ReportSummary, unknown>[]>(
    () => [
      {
        accessorKey: "targetType",
        header: "Type",
        cell: ({ row }) => {
          const Icon = TYPE_ICON[row.original.targetType as keyof typeof TYPE_ICON] ?? Flag;
          return (
            <Badge tone="neutral">
              <Icon className="h-3 w-3" /> {row.original.targetType}
            </Badge>
          );
        }
      },
      {
        accessorKey: "reason",
        header: "Reason",
        cell: ({ row }) => (
          <div className="max-w-[400px] truncate text-sm">{row.original.reason}</div>
        )
      },
      {
        accessorKey: "targetLabel",
        header: "Target",
        cell: ({ row }) => (
          <span className="text-xs text-[var(--muted-foreground)]">{row.original.targetLabel || "—"}</span>
        )
      },
      {
        accessorKey: "reporterName",
        header: "Reporter",
        cell: ({ row }) => (
          <span className="text-xs text-[var(--muted-foreground)]">{row.original.reporterName}</span>
        )
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />
      },
      {
        accessorKey: "createdAt",
        header: "Reported",
        cell: ({ row }) => <RelativeTime value={row.original.createdAt} />
      }
    ],
    []
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reports"
        description="Everything flagged by users. Open any report to see the full context and resolve with notes."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Open" value={openCount} icon={Flag} tone={openCount > 0 ? "warning" : "neutral"} />
        <StatCard label="Resolved" value={resolvedCount} icon={Shield} tone="success" />
        <StatCard label="Dismissed" value={dismissedCount} />
        <StatCard label="Total" value={all.length} />
      </div>

      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
        searchPlaceholder="Search by reason, target, reporter"
      >
        <FacetFilter
          label="Status"
          value={status}
          onChange={(value) => setState({ filters: { ...state.filters, status: value ?? "" }, page: 1 })}
          options={[
            { value: "open", label: "Open" },
            { value: "resolved", label: "Resolved" },
            { value: "dismissed", label: "Dismissed" }
          ]}
        />
        <FacetFilter
          label="Type"
          value={targetType}
          onChange={(value) => setState({ filters: { ...state.filters, targetType: value ?? "" }, page: 1 })}
          options={[
            { value: "chat", label: "Chat" },
            { value: "post", label: "Post" },
            { value: "pet", label: "Pet" },
            { value: "user", label: "User" }
          ]}
        />
      </DataTableToolbar>

      <DataTable<ReportSummary>
        data={paged}
        columns={columns}
        rowId={(r) => r.id}
        total={filtered.length}
        state={state}
        onStateChange={setState}
        loading={query.isLoading}
        selection={selection}
        onSelectionChange={setSelection}
        onRowClick={(r) => router.push(`/reports/${r.id}`)}
      />
    </div>
  );
}
