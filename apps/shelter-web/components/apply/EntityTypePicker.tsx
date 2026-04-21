"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ShelterEntityType } from "@petto/contracts";

import { fetchEntityTypes } from "@/lib/apply-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

type Props = {
  country: string;
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
};

// Entity-type dropdown, scoped to the wizard's selected country. We refetch
// whenever the country changes so "Registered charity (Scotland)" only
// appears when the applicant said GB.

export function EntityTypePicker({
  country,
  value,
  onChange,
  disabled
}: Props) {
  const [items, setItems] = useState<ShelterEntityType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!country) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchEntityTypes(country)
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        // If the previously-picked slug no longer belongs to this country,
        // clear it so step validation catches it.
        if (value && !list.some((e) => e.slug === value)) {
          onChange("");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load entity types"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally omit `value`/`onChange` — only country change should
    // refetch; stale selection is reconciled inside the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  return (
    <div className="space-y-1.5">
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled || loading || items.length === 0}
      >
        <SelectTrigger className="h-11 rounded-xl border-[color:var(--border)] bg-white">
          <SelectValue
            placeholder={
              loading ? "Loading…" : "Select the legal entity type"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {items.map((et) => (
            <SelectItem key={et.slug} value={et.slug}>
              {et.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {loading && (
        <p className="flex items-center gap-1.5 text-[12px] text-[color:var(--muted-foreground)]">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading options for this country…
        </p>
      )}
      {error && (
        <p className="text-[12px] text-[color:var(--destructive)]">{error}</p>
      )}
    </div>
  );
}
