"use client";

import { Check } from "lucide-react";

type StepperProps = {
  steps: string[];
  /** zero-indexed — the step currently being worked on */
  current: number;
  /** optional click handler — lets users jump back to a completed step */
  onJumpTo?: (index: number) => void;
};

// Horizontal numbered-circles stepper. The active step uses Fetcht orange,
// completed steps show a check, upcoming steps stay neutral. Connector
// lines between circles fill in as the user progresses — giving a cheap
// "progress bar" feel without a separate element.
export function Stepper({ steps, current, onJumpTo }: StepperProps) {
  return (
    <nav
      aria-label="Application progress"
      className="w-full"
    >
      <ol className="flex items-start gap-2">
        {steps.map((label, idx) => {
          const isComplete = idx < current;
          const isActive = idx === current;
          const clickable = isComplete && typeof onJumpTo === "function";
          return (
            <li key={label} className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={clickable ? () => onJumpTo?.(idx) : undefined}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`Step ${idx + 1}: ${label}${
                    isComplete ? " (completed)" : ""
                  }`}
                  className={[
                    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition",
                    isComplete
                      ? "bg-[color:var(--primary)] text-white shadow-[var(--shadow-orange)]"
                      : isActive
                        ? "ring-2 ring-[color:var(--primary)] bg-white text-[color:var(--primary)] shadow-[var(--shadow-soft)]"
                        : "bg-white text-[color:var(--muted-foreground)] border border-[color:var(--border)]",
                    clickable ? "cursor-pointer hover:scale-[1.03]" : ""
                  ].join(" ")}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : idx + 1}
                </button>
                {idx < steps.length - 1 && (
                  <div
                    aria-hidden
                    className="flex-1 h-[3px] rounded-full bg-[color:var(--border)] overflow-hidden"
                  >
                    <div
                      className="h-full bg-[color:var(--primary)] transition-all"
                      style={{ width: idx < current ? "100%" : "0%" }}
                    />
                  </div>
                )}
              </div>
              <p
                className={[
                  "mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] truncate",
                  isActive
                    ? "text-[color:var(--primary)]"
                    : isComplete
                      ? "text-[color:var(--foreground)]"
                      : "text-[color:var(--muted-foreground)]"
                ].join(" ")}
              >
                {label}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
