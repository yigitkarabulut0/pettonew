"use client";

import type { ListingState } from "@petto/contracts";
import { STATE_LABELS } from "@/lib/api/listings-moderation";
import { cn } from "@/lib/utils";

// Tone → class map. Mirrors the Petto brand palette surfaced via
// globals.css: warm tones (success/warning) lean into the orange/gold
// accent; `muted` stays neutral. Keep the dark-mode suffixes so the
// pill reads the same in both themes.
const TONE_CLASS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700",
  pending_review: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
  published: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900",
  paused: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-900",
  adopted: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-200 dark:border-teal-900",
  archived: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-900/60 dark:text-zinc-300 dark:border-zinc-800",
  rejected: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900"
};

export function StateBadge({ state, className }: { state: ListingState | string; className?: string }) {
  const label = STATE_LABELS[state as ListingState] ?? state;
  const tone = TONE_CLASS[state] ?? TONE_CLASS.draft;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        tone,
        className
      )}
    >
      {label}
    </span>
  );
}
