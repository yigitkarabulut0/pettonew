import type { ReactNode } from "react";
import Link from "next/link";
import { PawPrint } from "lucide-react";

// Public layout for /apply and /apply/status. Independent of the
// dashboard shell — no sidebar, no shelter session required. Keeps the
// wizard surface calm and focused.

export default function ApplyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[color:var(--background)]">
      <header className="border-b border-[color:var(--border)] bg-[color:var(--card)]/70 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 md:px-6">
          <Link
            href="/apply"
            className="flex items-center gap-2 font-semibold tracking-tight text-[color:var(--foreground)]"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[color:var(--primary)] text-white">
              <PawPrint className="h-4 w-4" />
            </span>
            <span>Fetcht for Shelters</span>
          </Link>
          <Link
            href="/login"
            className="text-sm text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
          >
            Already have an account? Sign in →
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 md:px-6 py-8 md:py-12">
        {children}
      </main>
    </div>
  );
}
