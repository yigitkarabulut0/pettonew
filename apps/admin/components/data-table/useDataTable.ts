"use client";

import * as React from "react";

import { type DataTableState } from "@/components/data-table/DataTable";
import { useUrlState } from "@/lib/hooks/useUrlState";

export function useDataTable(defaults?: Partial<DataTableState>) {
  const [urlState, setUrl] = useUrlState<{
    page?: string;
    pageSize?: string;
    q?: string;
    sort?: string;
    [key: string]: string | string[] | undefined;
  }>({
    page: String(defaults?.page ?? 1),
    pageSize: String(defaults?.pageSize ?? 20),
    q: defaults?.search ?? "",
    sort: defaults?.sort ?? ""
  });

  const [selection, setSelection] = React.useState<string[]>([]);

  const { page, pageSize, q, sort, ...rest } = urlState;
  const filters: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value == null) continue;
    filters[key] = value as string | string[];
  }

  const state: DataTableState = {
    page: Number(page) || 1,
    pageSize: Number(pageSize) || 20,
    search: (q as string) ?? "",
    sort: (sort as string) ?? "",
    filters
  };

  const setState = React.useCallback(
    (patch: Partial<DataTableState>) => {
      setUrl({
        ...(patch.page != null ? { page: String(patch.page) } : {}),
        ...(patch.pageSize != null ? { pageSize: String(patch.pageSize) } : {}),
        ...(patch.search != null ? { q: patch.search } : {}),
        ...(patch.sort != null ? { sort: patch.sort } : {}),
        ...(patch.filters ?? {})
      });
    },
    [setUrl]
  );

  return { state, setState, selection, setSelection };
}
