"use client";

import { useEffect, useState } from "react";

// Live 48-hour countdown for the admin review queue. Ticks every 30s
// (no need for second-level precision — reviewers don't stare at this).
// Colour tiers give a quick visual read across the queue.

type Props = {
  deadline: string; // ISO-8601
  /** Compact pill mode (for table rows) vs. full hero (detail page). */
  variant?: "pill" | "hero";
};

function diffMs(target: Date): number {
  return target.getTime() - Date.now();
}

function format(ms: number): string {
  const absMs = Math.abs(ms);
  const hours = Math.floor(absMs / 3_600_000);
  const minutes = Math.floor((absMs % 3_600_000) / 60_000);
  if (hours >= 1) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes}m`;
}

export function SlaCountdown({ deadline, variant = "pill" }: Props) {
  const target = new Date(deadline);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // `tick` is read only to trigger re-render; we recompute from Date.now()
  // to stay accurate even if the page is left open for hours.
  void tick;

  const ms = diffMs(target);
  const breached = ms <= 0;

  // Colour tiers mirror a traffic light:
  //   >24h   — green, plenty of time
  //   12–24h — amber, keep an eye on it
  //   <12h   — orange, act soon
  //   <=0    — red, SLA breached
  const tone = breached
    ? "destructive"
    : ms > 24 * 3_600_000
      ? "success"
      : ms > 12 * 3_600_000
        ? "warning"
        : "orange";

  if (variant === "hero") {
    return (
      <div
        className={[
          "rounded-xl border px-4 py-3 text-sm font-medium",
          toneHeroClasses[tone]
        ].join(" ")}
      >
        {breached ? (
          <>
            <span className="block text-xs font-semibold uppercase tracking-wide opacity-80">
              SLA breached
            </span>
            <span>{format(ms)} overdue</span>
          </>
        ) : (
          <>
            <span className="block text-xs font-semibold uppercase tracking-wide opacity-80">
              Review deadline
            </span>
            <span>{format(ms)} remaining</span>
          </>
        )}
      </div>
    );
  }

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tonePillClasses[tone]
      ].join(" ")}
    >
      {breached ? `SLA +${format(ms)}` : format(ms)}
    </span>
  );
}

const tonePillClasses = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  destructive: "bg-red-50 text-red-700 ring-red-200"
} as const;

const toneHeroClasses = {
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  orange: "bg-orange-50 text-orange-800 border-orange-200",
  destructive: "bg-red-50 text-red-800 border-red-200"
} as const;
