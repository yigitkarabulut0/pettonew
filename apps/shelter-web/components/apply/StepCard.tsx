"use client";

import type { ReactNode } from "react";

// Consistent card wrapper for every wizard step. Applies the warm cream
// surface, soft shadow, and generous padding the Fetcht design language
// uses elsewhere. The `footer` slot sits below a subtle divider so the
// back/next buttons feel anchored rather than floating.

type StepCardProps = {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function StepCard({
  eyebrow,
  title,
  description,
  children,
  footer
}: StepCardProps) {
  return (
    <section
      className="rounded-[24px] bg-[color:var(--card)] shadow-[var(--shadow-card)] border border-[color:var(--border)] overflow-hidden"
    >
      <header className="px-6 md:px-8 pt-7 md:pt-9 pb-5">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-2 text-[22px] md:text-[26px] font-semibold tracking-tight text-[color:var(--foreground)] leading-tight">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-[14px] text-[color:var(--muted-foreground)] max-w-2xl leading-[1.55]">
            {description}
          </p>
        )}
      </header>
      <div className="px-6 md:px-8 pb-8 space-y-5">{children}</div>
      {footer && (
        <div className="border-t border-[color:var(--border)] bg-[color:var(--muted)]/50 px-6 md:px-8 py-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
          {footer}
        </div>
      )}
    </section>
  );
}
