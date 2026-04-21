"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  PawPrint,
  ShieldCheck
} from "lucide-react";
import type { ShelterInviteInfo } from "@petto/contracts";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleChip } from "@/components/team/RoleChip";
import {
  acceptInvite,
  fetchInviteInfo
} from "@/lib/team-api";
import {
  acceptSchema,
  type AcceptFormValues,
  roleLabels
} from "@/lib/team-schema";

// Public accept page: someone with the invite URL resolves the token,
// sets a password, and gets signed in as the new ShelterMember. No
// session required to reach this page — middleware whitelists /invite.

export default function InviteAcceptPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [info, setInfo] = useState<ShelterInviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<AcceptFormValues>({
    resolver: zodResolver(acceptSchema),
    defaultValues: { name: "", password: "", confirmPassword: "" }
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchInviteInfo(token)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Invite not found"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      // The accept endpoint returns a full ShelterSession, but the
      // browser sees a cross-origin API. We still need to turn that
      // into the same cookies the /api/auth/login route would set — so
      // we round-trip the resulting access token through a dedicated
      // Next handler below, /api/auth/invite-login.
      const session = await acceptInvite(token, {
        name: values.name,
        password: values.password
      });
      const res = await fetch("/api/auth/invite-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session)
      });
      if (!res.ok) {
        throw new Error("Could not complete sign-in after accepting");
      }
      toast.success("Welcome to the team!");
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not accept invite");
    } finally {
      setSubmitting(false);
    }
  });

  if (loading) {
    return (
      <AcceptShell>
        <Card className="p-10 flex items-center justify-center">
          <Loader2 className="size-5 animate-spin text-[var(--primary)]" />
        </Card>
      </AcceptShell>
    );
  }

  if (loadError || !info) {
    return (
      <AcceptShell>
        <Card className="p-8 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--destructive-soft)] text-[var(--destructive)]">
            <AlertTriangle className="size-5" />
          </div>
          <h1 className="mt-4 text-lg font-semibold">Invite not found</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {loadError ?? "The link may have expired or been revoked."}
          </p>
          <div className="mt-5">
            <Button asChild variant="outline">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        </Card>
      </AcceptShell>
    );
  }

  if (info.status !== "active") {
    return (
      <AcceptShell>
        <Card className="p-8 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--warning-soft)] text-[var(--warning)]">
            <Clock className="size-5" />
          </div>
          <h1 className="mt-4 text-lg font-semibold">
            {info.status === "expired" && "This invite has expired"}
            {info.status === "accepted" && "This invite was already used"}
            {info.status === "revoked" && "This invite was revoked"}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Ask an admin at {info.shelterName} to send a fresh link.
          </p>
          <div className="mt-5">
            <Button asChild variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </Card>
      </AcceptShell>
    );
  }

  return (
    <AcceptShell>
      <Card className="overflow-hidden">
        <div className="bg-[var(--primary-soft)] px-6 py-6 md:px-8 md:py-8">
          <p className="eyebrow">You've been invited</p>
          <h1 className="mt-2 text-xl font-semibold md:text-2xl">
            Join {info.shelterName} on Fetcht Shelter
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <span>Your role:</span>
            <RoleChip role={info.role} />
            <span className="text-[var(--muted-foreground)]">
              · Expires {new Date(info.expiresAt).toLocaleString()}
            </span>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6 md:px-8">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={info.email} readOnly disabled />
            <p className="text-[11px] text-[var(--muted-foreground)]">
              This is the email your admin invited. Contact them if it's wrong.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accept-name">Your name</Label>
            <Input
              id="accept-name"
              autoComplete="name"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-[11px] text-[var(--destructive)]">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accept-password">New password</Label>
            <Input
              id="accept-password"
              type="password"
              autoComplete="new-password"
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="text-[11px] text-[var(--destructive)]">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accept-confirm">Confirm password</Label>
            <Input
              id="accept-confirm"
              type="password"
              autoComplete="new-password"
              {...form.register("confirmPassword")}
            />
            {form.formState.errors.confirmPassword && (
              <p className="text-[11px] text-[var(--destructive)]">
                {form.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Joining…
              </>
            ) : (
              <>
                <ShieldCheck className="size-4" />
                Accept invite &amp; join as {roleLabels[info.role]}
              </>
            )}
          </Button>
        </form>
      </Card>
    </AcceptShell>
  );
}

// Local layout wrapper — /invite/[token]/layout.tsx could take over,
// but co-locating keeps this page self-contained and lets the folder
// stay a minimal route. The outer /invite/layout.tsx already provides
// the header chrome for all /invite/* pages.
function AcceptShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="min-h-screen bg-[var(--background)] py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-md flex-col px-4">
        <Link
          href="/login"
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"
        >
          <span className="grid size-8 place-items-center rounded-xl bg-[var(--primary)] text-white">
            <PawPrint className="size-4" />
          </span>
          Fetcht for Shelters
        </Link>
        {children}
      </div>
    </section>
  );
}
