"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  XCircle
} from "lucide-react";
import type { ShelterApplication } from "@petto/contracts";

import { fetchApplicationStatus } from "@/lib/apply-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Public status viewer — no auth. The token the applicant saved is the
// only credential needed. We never expose PII beyond what they already
// submitted; rejection text is shown verbatim so they know exactly what
// to fix next time.

const REASON_LABELS: Record<string, string> = {
  invalid_registration: "Registration number couldn't be verified",
  documents_unclear: "Documents unclear or incomplete",
  jurisdiction_mismatch: "Jurisdiction mismatch with your registration",
  duplicate: "Duplicate of an existing application or shelter",
  out_of_scope: "Outside our current scope",
  other: "Other — see note"
};

export default function ApplicationStatusPage() {
  const params = useSearchParams();
  const token = params?.get("token") ?? "";
  const [app, setApp] = useState<ShelterApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useMemo(
    () => async () => {
      if (!token) {
        setError("Missing status token.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await fetchApplicationStatus(token);
        setApp(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load this application."
        );
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-[24px] bg-[color:var(--card)] shadow-[var(--shadow-card)] border border-[color:var(--border)] p-8 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[color:var(--primary)]" />
      </div>
    );
  }
  if (error || !app) {
    return (
      <div className="rounded-[24px] bg-[color:var(--card)] shadow-[var(--shadow-card)] border border-[color:var(--border)] overflow-hidden">
        <div className="p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[color:var(--destructive-soft)] text-[color:var(--destructive)]">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-[20px] font-semibold text-[color:var(--foreground)]">
            We couldn't find that application
          </h1>
          <p className="mt-2 text-[14px] text-[color:var(--muted-foreground)] max-w-md mx-auto">
            {error ?? "The link may have expired."}
          </p>
          <div className="mt-5">
            <Button asChild>
              <Link href="/apply">Start a new application</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Application status</p>
        <h1 className="mt-2 text-[26px] md:text-[30px] font-semibold tracking-tight text-[color:var(--foreground)]">
          {app.orgName}
        </h1>
      </div>

      <StatusHero app={app} onRefresh={load} />

      {app.status === "rejected" && (
        <div className="rounded-[20px] border border-[color:var(--destructive)]/30 bg-[color:var(--destructive-soft)] p-5">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-[color:var(--destructive)]" />
            <h2 className="text-sm font-semibold text-[color:var(--destructive)]">
              Reason for this decision
            </h2>
          </div>
          <p className="mt-2 text-[14px] font-medium text-[color:var(--foreground)]">
            {(app.rejectionReasonCode && REASON_LABELS[app.rejectionReasonCode]) ||
              "Other"}
          </p>
          {app.rejectionReasonNote && (
            <p className="mt-2 text-[14px] text-[color:var(--foreground)] whitespace-pre-wrap leading-[1.55]">
              {app.rejectionReasonNote}
            </p>
          )}
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link href="/apply">Start a new application</Link>
            </Button>
          </div>
        </div>
      )}

      {app.status === "approved" && (
        <div className="rounded-[20px] border border-[color:var(--success)]/30 bg-[color:var(--success-soft)] p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[color:var(--success)]" />
            <h2 className="text-sm font-semibold text-[color:var(--success)]">
              You're in!
            </h2>
          </div>
          <p className="mt-2 text-[14px] text-[color:var(--foreground)] leading-[1.55]">
            Our team created your shelter account. Check the email address
            you submitted ({app.primaryContactEmail}) — we've sent a
            temporary password. You'll be asked to set a permanent one on
            first sign in.
          </p>
          <div className="mt-4">
            <Button asChild>
              <Link href="/login">Sign in to your account</Link>
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-[20px] border border-[color:var(--border)] bg-white p-5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[color:var(--muted-foreground)]" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
            Submitted
          </h3>
        </div>
        <p className="mt-1 text-[14px] text-[color:var(--foreground)]">
          {new Date(app.submittedAt).toLocaleString()} · review deadline{" "}
          {new Date(app.slaDeadline).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function StatusHero({
  app,
  onRefresh
}: {
  app: ShelterApplication;
  onRefresh: () => void;
}) {
  const config = {
    submitted: {
      icon: Clock,
      title: "We're reviewing your application",
      description:
        "Our team reviews every application manually. You'll hear back within 48 hours.",
      tone: "primary" as const
    },
    under_review: {
      icon: Clock,
      title: "A reviewer has picked up your application",
      description:
        "You'll hear back soon. No action needed on your side.",
      tone: "primary" as const
    },
    approved: {
      icon: CheckCircle2,
      title: "Approved",
      description:
        "Your shelter account is verified and ready.",
      tone: "success" as const
    },
    rejected: {
      icon: XCircle,
      title: "Application not approved",
      description:
        "See the details below for what to address if you'd like to try again.",
      tone: "destructive" as const
    }
  }[app.status];
  if (!config) return null;

  const toneBg =
    config.tone === "success"
      ? "bg-[color:var(--success-soft)] border-[color:var(--success)]/30"
      : config.tone === "destructive"
        ? "bg-[color:var(--destructive-soft)] border-[color:var(--destructive)]/30"
        : "bg-[color:var(--primary-soft)] border-[color:var(--primary)]/30";
  const toneIconColor =
    config.tone === "success"
      ? "text-[color:var(--success)]"
      : config.tone === "destructive"
        ? "text-[color:var(--destructive)]"
        : "text-[color:var(--primary)]";
  const Icon = config.icon;

  return (
    <div
      className={[
        "rounded-[24px] border p-6 md:p-8",
        toneBg
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white ${toneIconColor}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[20px] md:text-[24px] font-semibold tracking-tight text-[color:var(--foreground)]">
              {config.title}
            </h2>
            <Badge
              tone={
                config.tone === "success"
                  ? "success"
                  : config.tone === "destructive"
                    ? "danger"
                    : "warning"
              }
            >
              {app.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="mt-1 text-[14px] text-[color:var(--muted-foreground)] leading-[1.55]">
            {config.description}
          </p>
          <div className="mt-4">
            <Button size="sm" variant="outline" onClick={onRefresh}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
