"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  HeartHandshake,
  Home,
  MessageSquare,
  PawPrint,
  Users,
  X
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  approveApplication,
  completeAdoption,
  getShelterApplication,
  rejectApplication
} from "@/lib/api";

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const queryClient = useQueryClient();

  const { data: app, isLoading } = useQuery({
    queryKey: ["shelter-application", id],
    queryFn: () => getShelterApplication(id as string),
    enabled: Boolean(id)
  });

  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const approveMut = useMutation({
    mutationFn: () => approveApplication(id as string),
    onSuccess: () => {
      toast.success("Applicant approved — chat opened");
      queryClient.invalidateQueries({ queryKey: ["shelter-application", id] });
      queryClient.invalidateQueries({ queryKey: ["shelter-applications"] });
      queryClient.invalidateQueries({ queryKey: ["shelter-stats"] });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const rejectMut = useMutation({
    mutationFn: (reason: string) => rejectApplication(id as string, reason),
    onSuccess: () => {
      toast.success("Application rejected");
      setShowReject(false);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["shelter-application", id] });
      queryClient.invalidateQueries({ queryKey: ["shelter-applications"] });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const completeMut = useMutation({
    mutationFn: () => completeAdoption(id as string),
    onSuccess: () => {
      toast.success("Adoption complete 🎉");
      queryClient.invalidateQueries({ queryKey: ["shelter-application", id] });
      queryClient.invalidateQueries({ queryKey: ["shelter-applications"] });
      queryClient.invalidateQueries({ queryKey: ["shelter-stats"] });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  if (isLoading || !app) {
    return (
      <div className="p-12 text-[var(--muted-foreground)]">Loading application…</div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <Button asChild variant="ghost" size="sm" className="gap-1">
        <Link href="/applications">
          <ArrowLeft className="size-4" /> Back
        </Link>
      </Button>

      {/* Pet summary */}
      <Card className="flex items-center gap-4 p-5">
        {app.petPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={app.petPhoto}
            alt={app.petName ?? ""}
            className="size-20 rounded-lg object-cover"
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-lg bg-[var(--muted)]">
            <PawPrint className="size-7 text-[var(--muted-foreground)]" />
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{app.petName ?? "—"}</h1>
            <Badge tone={appTone(app.status)}>{labelFor(app.status)}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            Application by <strong>{app.userName}</strong> ·{" "}
            {new Date(app.createdAt).toLocaleDateString()}
          </p>
        </div>
      </Card>

      {/* Applicant details */}
      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">Applicant profile</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field icon={<Home className="size-3.5" />} label="Housing">
            {app.housingType || "—"}
          </Field>
          <Field icon={<Users className="size-3.5" />} label="Other pets">
            {app.hasOtherPets ? app.otherPetsDetail || "Yes" : "None"}
          </Field>
          <Field icon={<HeartHandshake className="size-3.5" />} label="Experience" span>
            {app.experience || "—"}
          </Field>
          <Field icon={<MessageSquare className="size-3.5" />} label="Message" span>
            {app.message || "—"}
          </Field>
        </div>
      </Card>

      {/* Actions */}
      {app.status === "pending" ? (
        <Card className="flex flex-wrap items-center gap-2 p-5">
          <Button onClick={() => approveMut.mutate()} disabled={approveMut.isPending} className="gap-1">
            <Check className="size-4" /> Approve & open chat
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowReject((v) => !v)}
            className="gap-1"
          >
            <X className="size-4" /> Reject
          </Button>
          {showReject ? (
            <div className="mt-3 flex w-full gap-2">
              <input
                className="h-9 flex-1 rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                placeholder="Reason shown to the applicant (optional)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <Button
                variant="destructive"
                onClick={() => rejectMut.mutate(rejectReason.trim())}
                disabled={rejectMut.isPending}
              >
                Confirm reject
              </Button>
            </div>
          ) : null}
        </Card>
      ) : app.status === "chat_open" ? (
        <Card className="flex flex-wrap items-center gap-3 p-5">
          <div className="flex-1 text-sm">
            Chat is open with <strong>{app.userName}</strong>. Continue the
            conversation and mark adoption complete when finalised.
          </div>
          <Button asChild variant="outline" className="gap-1">
            <Link href="/chats">
              <MessageSquare className="size-4" /> Open chats
            </Link>
          </Button>
          <Button
            onClick={() => completeMut.mutate()}
            disabled={completeMut.isPending}
            className="gap-1"
          >
            <CheckCircle2 className="size-4" /> Mark adopted
          </Button>
        </Card>
      ) : app.status === "rejected" && app.rejectionReason ? (
        <Card className="p-5 text-sm">
          <div className="font-semibold">Rejection reason</div>
          <p className="mt-1 text-[var(--muted-foreground)]">
            {app.rejectionReason}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function Field({
  icon,
  label,
  children,
  span
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  span?: boolean;
}) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function appTone(
  status: string
): "neutral" | "success" | "warning" | "danger" | "info" {
  switch (status) {
    case "pending":
      return "warning";
    case "approved":
    case "chat_open":
      return "info";
    case "adopted":
      return "success";
    case "rejected":
    case "withdrawn":
      return "danger";
    default:
      return "neutral";
  }
}

function labelFor(status: string) {
  return (
    {
      pending: "Pending",
      approved: "Approved",
      chat_open: "In chat",
      adopted: "Adopted",
      rejected: "Rejected",
      withdrawn: "Withdrawn"
    } as Record<string, string>
  )[status] ?? status;
}
