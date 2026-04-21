"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  KeyRound,
  Loader2,
  XCircle
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { SlaCountdown } from "@/components/shelter-applications/SlaCountdown";
import { RejectDialog } from "@/components/shelter-applications/RejectDialog";
import {
  approveShelterApplication,
  getShelterApplication,
  rejectShelterApplication,
  type AdminShelterApplication,
  type ShelterApplicationRejectionCode
} from "@/lib/admin-api";

const REJECTION_LABEL: Record<string, string> = {
  invalid_registration: "Invalid registration",
  documents_unclear: "Documents unclear",
  jurisdiction_mismatch: "Jurisdiction mismatch",
  duplicate: "Duplicate",
  out_of_scope: "Out of scope",
  other: "Other"
};

const SPECIES_LABEL: Record<string, string> = {
  dog: "Dogs",
  cat: "Cats",
  rabbit: "Rabbits",
  ferret: "Ferrets",
  small_mammal: "Small mammals"
};

type CredentialsState = {
  email: string;
  tempPassword: string;
  notice: string;
} | null;

export default function ShelterApplicationDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();

  const { data: app, isLoading } = useQuery({
    queryKey: ["shelter-application", id],
    queryFn: () => getShelterApplication(id)
  });

  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [credentials, setCredentials] = useState<CredentialsState>(null);

  const approve = useMutation({
    mutationFn: () => approveShelterApplication(id),
    onSuccess: (res) => {
      setCredentials({
        email: res.shelter.email,
        tempPassword: res.tempPassword,
        notice: res.passwordNotice
      });
      setApproveOpen(false);
      qc.invalidateQueries({ queryKey: ["shelter-application", id] });
      qc.invalidateQueries({ queryKey: ["shelter-applications"] });
      qc.invalidateQueries({ queryKey: ["admin-shelters"] });
      toast.success(`${res.shelter.name} approved`);
    },
    onError: (err: Error) =>
      toast.error(err.message || "Could not approve application")
  });

  const reject = useMutation({
    mutationFn: (vars: {
      code: ShelterApplicationRejectionCode;
      note: string;
    }) => rejectShelterApplication(id, vars.code, vars.note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shelter-application", id] });
      qc.invalidateQueries({ queryKey: ["shelter-applications"] });
      toast.success("Application rejected");
      setRejectOpen(false);
    },
    onError: (err: Error) =>
      toast.error(err.message || "Could not reject application")
  });

  const decided = app?.status === "approved" || app?.status === "rejected";

  const content = useMemo(() => {
    if (isLoading || !app) {
      return (
        <Card className="flex items-center justify-center p-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </Card>
      );
    }
    return (
      <div className="space-y-5">
        <HeaderCard app={app} />
        {app.status === "rejected" && <RejectionCard app={app} />}
        <SubmissionCard app={app} />
        {!decided && (
          <DecisionCard
            onApprove={() => setApproveOpen(true)}
            onReject={() => setRejectOpen(true)}
          />
        )}
      </div>
    );
  }, [app, decided, isLoading]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="mb-4 text-muted-foreground"
      >
        <Link href="/shelter-applications">
          <ArrowLeft className="h-4 w-4" />
          Back to queue
        </Link>
      </Button>

      {content}

      {app && (
        <RejectDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          pending={reject.isPending}
          applicantName={app.orgName}
          onConfirm={async (code, note) => {
            await reject.mutateAsync({ code, note });
          }}
        />
      )}

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve this application?</DialogTitle>
            <DialogDescription>
              A verified shelter account will be created for{" "}
              <strong>{app?.orgName}</strong> and a one-time temporary
              password will be generated. The applicant will see a success
              note on their status page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setApproveOpen(false)}
              disabled={approve.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => approve.mutate()}
              disabled={approve.isPending}
            >
              {approve.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Approving…
                </>
              ) : (
                <>Approve &amp; mint account</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {credentials && (
        <CredentialsDialog
          email={credentials.email}
          password={credentials.tempPassword}
          notice={credentials.notice}
          onClose={() => {
            setCredentials(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function HeaderCard({ app }: { app: AdminShelterApplication }) {
  const badge = (() => {
    switch (app.status) {
      case "submitted":
        return { label: "Pending review", tone: "warning" as const };
      case "under_review":
        return { label: "In review", tone: "warning" as const };
      case "approved":
        return { label: "Approved", tone: "success" as const };
      case "rejected":
        return { label: "Rejected", tone: "danger" as const };
    }
  })();
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Application · {app.id}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {app.orgName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={badge.tone}>{badge.label}</Badge>
            <span className="text-[12px] text-muted-foreground">
              {app.country.toUpperCase()} · {app.entityType}
            </span>
          </div>
        </div>
        {(app.status === "submitted" || app.status === "under_review") && (
          <SlaCountdown deadline={app.slaDeadline} variant="hero" />
        )}
      </div>
    </Card>
  );
}

function RejectionCard({ app }: { app: AdminShelterApplication }) {
  return (
    <Card className="border-red-200 bg-red-50 p-5">
      <div className="flex items-center gap-2 text-red-800">
        <XCircle className="h-4 w-4" />
        <h2 className="text-sm font-semibold">Rejection reason</h2>
      </div>
      <p className="mt-1 text-sm font-medium text-red-900">
        {(app.rejectionReasonCode && REJECTION_LABEL[app.rejectionReasonCode]) ||
          "Other"}
      </p>
      {app.rejectionReasonNote && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-red-900">
          {app.rejectionReasonNote}
        </p>
      )}
      {app.reviewedAt && (
        <p className="mt-3 text-[11px] text-red-700">
          Decided {new Date(app.reviewedAt).toLocaleString()}
          {app.reviewedBy ? ` · by ${app.reviewedBy}` : ""}
        </p>
      )}
    </Card>
  );
}

function SubmissionCard({ app }: { app: AdminShelterApplication }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--border)] bg-muted/50 px-6 py-3">
        <h2 className="text-sm font-semibold">Submission</h2>
      </div>
      <dl className="grid grid-cols-1 divide-y divide-[var(--border)] md:grid-cols-2 md:divide-x md:divide-y-0">
        <Section title="Entity & registration">
          <Row label="Country" value={app.country.toUpperCase()} />
          <Row label="Entity type" value={app.entityType} />
          <Row label="Registration #" value={app.registrationNumber} />
          <Row
            label="Certificate"
            value={
              <a
                href={app.registrationCertificateUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[var(--primary)] underline underline-offset-2"
              >
                <FileText className="h-3 w-3" />
                Open file
                <ExternalLink className="h-3 w-3" />
              </a>
            }
          />
        </Section>
        <Section title="Organisation & contact">
          <Row label="Address" value={app.orgAddress || "—"} />
          <Row
            label="Operating region"
            value={`${app.operatingRegionCountry} · ${app.operatingRegionCity}`}
          />
          <Row
            label="Species focus"
            value={
              app.speciesFocus
                .map((s) => SPECIES_LABEL[s] ?? s)
                .join(", ") || "—"
            }
          />
          <Row
            label="Donation URL"
            value={
              app.donationUrl ? (
                <a
                  href={app.donationUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="truncate text-[var(--primary)] underline underline-offset-2"
                >
                  {app.donationUrl}
                </a>
              ) : (
                "—"
              )
            }
          />
          <Row label="Primary contact" value={app.primaryContactName} />
          <Row
            label="Email"
            value={
              <a
                href={`mailto:${app.primaryContactEmail}`}
                className="text-[var(--primary)] underline underline-offset-2"
              >
                {app.primaryContactEmail}
              </a>
            }
          />
          <Row label="Phone" value={app.primaryContactPhone || "—"} />
        </Section>
      </dl>
      <div className="border-t border-[var(--border)] bg-muted/30 px-6 py-3 text-[11px] text-muted-foreground">
        Submitted {new Date(app.submittedAt).toLocaleString()} · SLA due{" "}
        {new Date(app.slaDeadline).toLocaleString()}
      </div>
    </Card>
  );
}

function Section({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-6">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm">{value}</dd>
    </div>
  );
}

function DecisionCard({
  onApprove,
  onReject
}: {
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold">Decision</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Approval mints a shelter account and shows a one-time temporary
        password; rejection records a reason the applicant will see.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button onClick={onApprove} size="lg" className="bg-emerald-600 hover:bg-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Approve &amp; mint account
        </Button>
        <Button variant="outline" onClick={onReject} size="lg">
          <XCircle className="h-4 w-4" />
          Reject with reason
        </Button>
      </div>
    </Card>
  );
}

function CredentialsDialog({
  email,
  password,
  notice,
  onClose
}: {
  email: string;
  password: string;
  notice: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[var(--primary)]" />
            Shelter created
          </DialogTitle>
          <DialogDescription>{notice}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-md bg-muted p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Email
          </div>
          <div className="text-sm font-medium">{email}</div>
          <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            Temporary password
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-background px-2 py-1 text-sm font-mono">
              {password}
            </code>
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="h-3 w-3" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
