"use client";

import { Search, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { cn } from "@/lib/utils";

interface DataTableToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  children?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}

export function DataTableToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  children,
  trailing,
  className
}: DataTableToolbarProps) {
  const [local, setLocal] = React.useState(searchValue);
  const debounced = useDebounce(local, 300);

  React.useEffect(() => {
    setLocal(searchValue);
  }, [searchValue]);

  React.useEffect(() => {
    if (debounced !== searchValue) onSearchChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] p-2 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            value={local}
            onChange={(event) => setLocal(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-8 pr-7 text-sm"
          />
          {local ? (
            <button
              type="button"
              onClick={() => setLocal("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {children}
      </div>
      {trailing ? <div className="flex items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

interface FacetFilterProps<T extends string> {
  label: string;
  value?: T;
  options: { value: T; label: string }[];
  onChange: (value?: T) => void;
}

export function FacetFilter<T extends string>({
  label,
  value,
  options,
  onChange
}: FacetFilterProps<T>) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{label}</span>
      <div className="flex flex-wrap gap-1">
        <Button
          variant={value == null ? "soft" : "outline"}
          size="sm"
          onClick={() => onChange(undefined)}
          type="button"
        >
          All
        </Button>
        {options.map((opt) => (
          <Button
            key={opt.value}
            variant={value === opt.value ? "soft" : "outline"}
            size="sm"
            onClick={() => onChange(opt.value)}
            type="button"
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
