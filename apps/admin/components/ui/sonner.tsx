"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster(props: React.ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] shadow-md rounded-md",
          description: "text-[var(--muted-foreground)]",
          actionButton:
            "bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-xs",
          cancelButton: "bg-[var(--muted)] text-[var(--foreground)] rounded-md text-xs"
        }
      }}
      {...props}
    />
  );
}
