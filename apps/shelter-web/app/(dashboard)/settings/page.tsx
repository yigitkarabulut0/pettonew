"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2, ScrollText, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { changeMyPassword } from "@/lib/api";
import { TeamMembersCard } from "@/components/team/TeamMembersCard";
import { AuditLogTable } from "@/components/team/AuditLogTable";
import { useShelterSession, shelterRoleAllows } from "@/lib/use-session-role";

// Consolidated shelter settings surface. The three tabs live under a
// single route so navigation state + role gating can be colocated,
// and the existing /profile route keeps working (owner lands on
// Profile tab by default, matching the old home).
type Tab = "profile" | "team" | "audit-log";

export default function SettingsPage() {
  const session = useShelterSession();
  const role = session?.role ?? null;
  const canSeeAudit = shelterRoleAllows(role, "editor");

  const [tab, setTab] = useState<Tab>("profile");

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Manage your shelter profile, team, and activity.
        </p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="profile">
            <KeyRound className="size-3" /> Account
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="size-3" /> Team
          </TabsTrigger>
          <TabsTrigger value="audit-log" disabled={!canSeeAudit}>
            <ScrollText className="size-3" /> Audit log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-5">
          <AccountTab />
        </TabsContent>

        <TabsContent value="team" className="mt-5">
          <TeamMembersCard
            viewerRole={role}
            viewerMemberId={session?.memberId ?? null}
          />
        </TabsContent>

        <TabsContent value="audit-log" className="mt-5">
          <AuditLogTable accessible={canSeeAudit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Previous settings page contents — password change — extracted so the
// tabs layout stays readable.
function AccountTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const mutation = useMutation({
    mutationFn: (vals: { currentPassword: string; newPassword: string }) =>
      changeMyPassword(vals),
    onSuccess: () => {
      toast.success("Password updated");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (err: Error) => toast.error(err.message)
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8)
      return toast.error("Password must be at least 8 characters");
    if (next !== confirm) return toast.error("Passwords do not match");
    mutation.mutate({ currentPassword: current, newPassword: next });
  }

  return (
    <Card className="space-y-4 p-6 max-w-lg">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="size-4" /> Change password
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Current password</Label>
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>New password</Label>
          <Input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Confirm new password</Label>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <Button type="submit" disabled={mutation.isPending} className="gap-1">
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Update password"
          )}
        </Button>
      </form>
    </Card>
  );
}
