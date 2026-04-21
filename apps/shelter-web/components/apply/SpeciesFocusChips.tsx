"use client";

import type { ApplySpecies } from "@/lib/apply-schema";
import { speciesLabels } from "@/lib/apply-schema";
import { Check } from "lucide-react";

const ORDER: ApplySpecies[] = ["dog", "cat", "rabbit", "ferret", "small_mammal"];

type Props = {
  value: ApplySpecies[];
  onChange: (next: ApplySpecies[]) => void;
  error?: string;
};

// Multi-select pill chips — each click toggles one species. Chosen chips
// flip to solid orange with a check icon; the rest stay neutral. Keeps
// touch targets wide (px-4 h-10) so it doubles as a mobile layout.

export function SpeciesFocusChips({ value, onChange, error }: Props) {
  const selected = new Set(value);
  const toggle = (species: ApplySpecies) => {
    const next = new Set(selected);
    if (next.has(species)) next.delete(species);
    else next.add(species);
    onChange(ORDER.filter((s) => next.has(s)));
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {ORDER.map((species) => {
          const active = selected.has(species);
          return (
            <button
              key={species}
              type="button"
              onClick={() => toggle(species)}
              aria-pressed={active}
              className={[
                "inline-flex items-center gap-1.5 rounded-full px-4 h-10 text-sm font-medium transition",
                active
                  ? "bg-[color:var(--primary)] text-white shadow-[var(--shadow-orange)]"
                  : "bg-white border border-[color:var(--border)] text-[color:var(--foreground)] hover:border-[color:var(--primary)]/50"
              ].join(" ")}
            >
              {active && <Check className="h-3.5 w-3.5" />}
              {speciesLabels[species]}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="text-[12px] text-[color:var(--destructive)]">{error}</p>
      )}
    </div>
  );
}
