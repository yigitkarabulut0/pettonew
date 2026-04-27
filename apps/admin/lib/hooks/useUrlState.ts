"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

export type UrlStateShape = Record<string, string | string[] | undefined>;

export function useUrlState<T extends UrlStateShape>(defaults: T) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const current = React.useMemo(() => {
    const out: UrlStateShape = { ...defaults };
    searchParams.forEach((value, key) => {
      if (value === "") return;
      if (key in out && Array.isArray(out[key])) {
        out[key] = value.split(",").filter(Boolean);
      } else {
        out[key] = value;
      }
    });
    return out as T;
  }, [searchParams, defaults]);

  const setState = React.useCallback(
    (patch: Partial<T>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
          sp.delete(key);
        } else if (Array.isArray(value)) {
          sp.set(key, value.join(","));
        } else {
          sp.set(key, String(value));
        }
      }
      // Wrap in startTransition: tanstack-table can fire onSortingChange
      // synchronously inside its own render (during initial settling), and
      // Next.js' router.replace dispatches a state update on the Router
      // component. Calling that inside another component's render throws
      // "Cannot update Router while rendering DataTable". Marking the URL
      // change as a transition tells React it's a non-urgent update —
      // legal to schedule from within render.
      React.startTransition(() => {
        router.replace(`?${sp.toString()}`, { scroll: false });
      });
    },
    [router, searchParams]
  );

  return [current, setState] as const;
}
