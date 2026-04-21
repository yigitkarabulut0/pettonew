"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle2,
  ChevronRight,
  HeartHandshake,
  Inbox,
  MessageSquare,
  PawPrint
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getMyShelter,
  getShelterStats,
  listShelterApplications,
  listShelterPets
} from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  chat_open: "Chat open",
  adopted: "Adopted",
  rejected: "Rejected",
  withdrawn: "Withdrawn"
};

export default function ShelterDashboardPage() {
  const { data: shelter } = useQuery({
    queryKey: ["shelter-me"],
    queryFn: getMyShelter
  });
  const { data: stats } = useQuery({
    queryKey: ["shelter-stats"],
    queryFn: getShelterStats
  });
  const { data: pendingApps = [] } = useQuery({
    queryKey: ["shelter-applications", "pending"],
    queryFn: () => listShelterApplications("pending")
  });
  const { data: recentPets = [] } = useQuery({
    queryKey: ["shelter-recent-pets"],
    queryFn: () => listShelterPets()
  });

  return (
    <div className="space-y-8 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{shelter?.name ? `, ${shelter.name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Your adoption workflow at a glance.
        </p>
      </header>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<PawPrint className="size-5" />}
          label="Available pets"
          value={stats?.availablePets ?? 0}
          hint={`${stats?.totalPets ?? 0} total`}
        />
        <StatCard
          icon={<Inbox className="size-5" />}
          label="Pending applications"
          value={stats?.pendingApplications ?? 0}
          hint="Awaiting review"
          highlight
        />
        <StatCard
          icon={<MessageSquare className="size-5" />}
          label="Active chats"
          value={stats?.activeChats ?? 0}
          hint="Approved applicants"
        />
        <StatCard
          icon={<HeartHandshake className="size-5" />}
          label="Adopted"
          value={stats?.adoptedPets ?? 0}
          hint="All-time"
        />
      </div>

      {/* Pending applications */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Pending applications</h2>
          <Link
            href="/applications"
            className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
          >
            View all <ChevronRight className="size-3" />
          </Link>
        </div>
        {pendingApps.length === 0 ? (
          <EmptyCard
            icon={<CheckCircle2 className="size-5" />}
            title="Inbox zero"
            hint="You don't have any applications waiting."
          />
        ) : (
          <div className="space-y-2">
            {pendingApps.slice(0, 5).map((app) => (
              <Link key={app.id} href={`/applications/${app.id}`}>
                <Card className="flex items-center gap-3 p-3 transition-colors hover:bg-[var(--muted)]">
                  {app.petPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={app.petPhoto}
                      alt={app.petName ?? ""}
                      className="size-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex size-12 items-center justify-center rounded-lg bg-[var(--muted)]">
                      <PawPrint className="size-5 text-[var(--muted-foreground)]" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{app.petName ?? "—"}</span>
                      <Badge tone="warning">{STATUS_LABEL[app.status]}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                      {app.userName} ·{" "}
                      {formatDistanceToNow(new Date(app.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-[var(--muted-foreground)]" />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent pets */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent pets</h2>
          <Link
            href="/pets"
            className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
          >
            View all <ChevronRight className="size-3" />
          </Link>
        </div>
        {recentPets.length === 0 ? (
          <EmptyCard
            icon={<PawPrint className="size-5" />}
            title="No pets yet"
            hint="Add your first adoptable pet from the Pets section."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentPets.slice(0, 6).map((pet) => (
              <Link key={pet.id} href={`/pets/${pet.id}`}>
                <Card className="overflow-hidden transition-transform hover:-translate-y-0.5">
                  <div className="aspect-[16/10] w-full bg-[var(--muted)]">
                    {pet.photos?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pet.photos[0]}
                        alt={pet.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-[var(--muted-foreground)]">
                        <PawPrint className="size-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{pet.name}</div>
                      <div className="truncate text-xs text-[var(--muted-foreground)]">
                        {[pet.breed, pet.sex].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <Badge tone={statusTone(pet.status)}>{pet.status}</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  highlight
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Card
      className={`flex flex-col gap-2 p-5 ${
        highlight ? "ring-1 ring-[var(--primary-soft)]" : ""
      }`}
    >
      <div className="flex items-center justify-between text-[var(--muted-foreground)]">
        <span className="text-xs uppercase tracking-wide">{label}</span>
        <span
          className={
            highlight ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"
          }
        >
          {icon}
        </span>
      </div>
      <div className="text-3xl font-semibold">{value}</div>
      {hint ? (
        <div className="text-xs text-[var(--muted-foreground)]">{hint}</div>
      ) : null}
    </Card>
  );
}

function EmptyCard({
  icon,
  title,
  hint
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="text-[var(--muted-foreground)]">{icon}</div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="max-w-sm text-xs text-[var(--muted-foreground)]">{hint}</div>
    </Card>
  );
}

function statusTone(
  status: string
): "neutral" | "success" | "warning" | "danger" | "info" {
  switch (status) {
    case "available":
      return "success";
    case "reserved":
      return "warning";
    case "adopted":
      return "info";
    case "hidden":
      return "danger";
    default:
      return "neutral";
  }
}
