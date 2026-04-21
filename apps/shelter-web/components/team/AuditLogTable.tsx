"use client";

import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import type { ShelterAuditEntry } from "@petto/contracts";

import { Card } from "@/components/ui/card";
import { auditActionLabels, fetchAuditLog } from "@/lib/team-api";

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function actionLabel(action: string): string {
  return auditActionLabels[action] ?? action.replace(/[._]/g, " ");
}

type Props = {
  /** Viewers cannot see the audit log per spec — parent decides
   * whether to render this component at all, but we keep a fallback
   * UI for robustness. */
  accessible?: boolean;
};

export function AuditLogTable({ accessible = true }: Props) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["shelter-audit-log"],
    queryFn: () => fetchAuditLog(100, 0),
    staleTime: 60_000,
    enabled: accessible
  });

  if (!accessible) {
    return (
      <Card className="p-6 text-center text-sm text-[var(--muted-foreground)]">
        <ScrollText className="mx-auto mb-2 size-5" />
        Audit log is available to Admins and Editors.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <header className="border-b border-[var(--border)] bg-[var(--muted)] px-6 py-3">
        <div className="flex items-center gap-2">
          <ScrollText className="size-4 text-[var(--muted-foreground)]" />
          <h2 className="text-sm font-semibold">Audit log</h2>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
          Append-only record of team and listing actions. Not editable.
        </p>
      </header>
      {isLoading ? (
        <p className="px-6 py-4 text-sm text-[var(--muted-foreground)]">
          Loading…
        </p>
      ) : entries.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-[var(--muted-foreground)]">
          No activity yet.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {entries.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function AuditRow({ entry }: { entry: ShelterAuditEntry }) {
  const actor = entry.actorName?.trim() || entry.actorEmail || "—";
  const metadata = entry.metadata ?? {};
  const metaSnippet = summariseMetadata(entry.action, metadata);
  return (
    <li className="flex items-start gap-3 px-6 py-3">
      <span
        className="mt-0.5 text-[11px] text-[var(--muted-foreground)] whitespace-nowrap"
        title={new Date(entry.createdAt).toLocaleString()}
      >
        {relativeTime(entry.createdAt)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--foreground)]">
          <strong>{actor}</strong>{" "}
          <span className="text-[var(--muted-foreground)]">
            {actionLabel(entry.action)}
          </span>
          {metaSnippet && (
            <span className="text-[var(--foreground)]"> — {metaSnippet}</span>
          )}
        </p>
      </div>
    </li>
  );
}

// Compose a short "— Editor Jane" or "— pitbull listing" suffix so the
// row renders meaningfully without a modal.
function summariseMetadata(action: string, meta: Record<string, unknown>): string {
  const asString = (key: string) => {
    const v = meta[key];
    return typeof v === "string" ? v : "";
  };
  switch (action) {
    case "member.invite":
    case "member.invite_resend":
    case "member.invite_revoke":
      return [asString("email"), asString("role")].filter(Boolean).join(" · ");
    case "member.role_change":
      return `${asString("email")}: ${asString("beforeRole")} → ${asString("afterRole")}`;
    case "member.revoke":
      return asString("email");
    case "pet.create":
    case "pet.update":
    case "pet.delete":
    case "pet.status_change":
      return [asString("name"), asString("petName"), asString("status")]
        .filter(Boolean)
        .join(" · ");
    case "application.approve":
    case "application.reject":
    case "application.complete":
      return [asString("petName"), asString("userName")]
        .filter(Boolean)
        .join(" · ");
    case "profile.update":
      return asString("name");
    default:
      return "";
  }
}
