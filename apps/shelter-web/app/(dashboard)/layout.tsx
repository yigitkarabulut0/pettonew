import { cookies } from "next/headers";
import { AlertTriangle } from "lucide-react";
import { Sidebar } from "@/components/shell/Sidebar";

type SessionPayload = {
  name?: string;
  verifiedAt?: string | null;
};

async function readSession(): Promise<SessionPayload> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("shelter_session")?.value;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SessionPayload;
  } catch {
    return {};
  }
}

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  const shelterName = session.name ?? "";
  const verified = Boolean(session.verifiedAt);
  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      {/* Sticky sidebar — stays fixed while the main area scrolls. */}
      <aside className="sticky top-0 h-screen shrink-0">
        <Sidebar shelterName={shelterName} verified={verified} />
      </aside>
      <main className="min-h-screen flex-1">
        {!verified && <UnverifiedBanner />}
        {children}
      </main>
    </div>
  );
}

// Persistent banner shown across the dashboard until the shelter is
// verified. Non-dismissible on purpose — clearing it would let shelters
// forget they're still gated and wonder why listing controls are locked.
function UnverifiedBanner() {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--warning-soft)]">
      <div className="mx-auto flex max-w-5xl items-start gap-3 px-4 py-3 md:px-6">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-[var(--foreground)]">
            Your account is pending verification.
          </p>
          <p className="text-[var(--muted-foreground)]">
            Listing pets and handling applications unlock once our team
            completes review (within 48 hours of submission).
          </p>
        </div>
      </div>
    </div>
  );
}
