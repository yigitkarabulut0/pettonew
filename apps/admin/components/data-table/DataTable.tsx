"use client";

import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import * as React from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface DataTableState {
  page: number;
  pageSize: number;
  search: string;
  sort: string;
  filters: Record<string, string | string[]>;
}

export interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  rowId: (row: TData) => string;
  total?: number;
  state: DataTableState;
  onStateChange: (patch: Partial<DataTableState>) => void;
  loading?: boolean;
  selectable?: boolean;
  selection?: string[];
  onSelectionChange?: (ids: string[]) => void;
  emptyState?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  className?: string;
}

export function DataTable<TData>({
  data,
  columns,
  rowId,
  total,
  state,
  onStateChange,
  loading,
  selectable = true,
  selection,
  onSelectionChange,
  emptyState,
  onRowClick,
  className
}: DataTableProps<TData>) {
  // Sorting is fully controlled by `state.sort`. Keeping it derived (instead
  // of a local useState mirrored to the URL) avoids the "Cannot update Router
  // while rendering DataTable" warning — tanstack-table can fire
  // onSortingChange during its initial settle pass, and a router.replace
  // dispatched from inside that pass updates the Router from within our
  // render. Deriving the value means the only writer to the URL is the
  // user-driven click handler below, which runs outside render.
  const sorting = React.useMemo<SortingState>(
    () =>
      state.sort
        ? [{ id: state.sort.replace(/^-/, ""), desc: state.sort.startsWith("-") }]
        : [],
    [state.sort]
  );

  const rowSelection: RowSelectionState = React.useMemo(() => {
    if (!selection) return {};
    return selection.reduce<RowSelectionState>((acc, id) => {
      acc[id] = true;
      return acc;
    }, {});
  }, [selection]);

  const finalColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!selectable) return columns;
    return [
      {
        id: "__select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all rows"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            onClick={(event) => event.stopPropagation()}
          />
        ),
        enableSorting: false,
        size: 32
      },
      ...columns
    ];
  }, [columns, selectable]);

  const table = useReactTable({
    data,
    columns: finalColumns,
    state: { sorting, rowSelection },
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: selectable,
    getRowId: rowId,
    manualPagination: true,
    manualSorting: true,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      const newSort = first ? `${first.desc ? "-" : ""}${first.id}` : "";
      if (newSort !== state.sort) onStateChange({ sort: newSort });
    },
    onRowSelectionChange: (updater) => {
      if (!onSelectionChange) return;
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      const ids = Object.keys(next).filter((id) => next[id]);
      onSelectionChange(ids);
    }
  });

  const totalPages = total ? Math.max(1, Math.ceil(total / state.pageSize)) : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)]">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-[var(--muted)]">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() === 150 ? undefined : header.getSize() }}
                    onClick={
                      header.column.getCanSort()
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                    className={cn(header.column.getCanSort() && "cursor-pointer select-none")}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" ? " ↑" : null}
                    {header.column.getIsSorted() === "desc" ? " ↓" : null}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={finalColumns.length} className="py-12 text-center">
                  <div className="inline-flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading…
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={finalColumns.length} className="py-10">
                  {emptyState ?? <EmptyState title="No results" description="Try adjusting filters." />}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 text-[11px] text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          {total != null
            ? `${(state.page - 1) * state.pageSize + 1}–${Math.min(
                state.page * state.pageSize,
                total
              )} of ${total}`
            : data.length === 0
              ? "0 rows"
              : `${data.length} rows`}
        </div>
        <div className="flex items-center gap-1.5">
          <span>Rows</span>
          <Select
            value={String(state.pageSize)}
            onValueChange={(value) => onStateChange({ pageSize: Number(value), page: 1 })}
          >
            <SelectTrigger className="h-7 w-[68px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            disabled={state.page <= 1 || loading}
            onClick={() => onStateChange({ page: Math.max(1, state.page - 1) })}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span>
            {state.page}
            {totalPages ? ` / ${totalPages}` : ""}
          </span>
          <Button
            variant="ghost"
            size="icon"
            disabled={(totalPages && state.page >= totalPages) || data.length < state.pageSize || loading}
            onClick={() => onStateChange({ page: state.page + 1 })}
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
