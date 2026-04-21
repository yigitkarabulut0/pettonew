"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreHorizontal, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import type {
  ShelterMember,
  ShelterMemberInvite,
  ShelterMemberRole
} from "@petto/contracts";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  fetchTeam,
  resendInvite,
  revokeInvite,
  revokeMember,
  updateMemberRole,
  type TeamSnapshot
} from "@/lib/team-api";
import { RoleChip } from "@/components/team/RoleChip";
import { InviteMemberDialog } from "@/components/team/InviteMemberDialog";

type Props = {
  /** The viewer's role — disables write UI for non-admins. */
  viewerRole: ShelterMemberRole | null;
  viewerMemberId: string | null;
};

function initials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/[\s@._-]/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function timeLeft(expiresAt: string): string {
  const target = new Date(expiresAt).getTime();
  const diff = target - Date.now();
  if (Number.isNaN(target)) return "";
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) {
    const mins = Math.max(1, Math.floor(diff / 60_000));
    return `${mins}m left`;
  }
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

export function TeamMembersCard({ viewerRole, viewerMemberId }: Props) {
  const qc = useQueryClient();
  const isAdmin = viewerRole === "admin";
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["shelter-team"],
    queryFn: fetchTeam,
    staleTime: 30_000
  });
  const snapshot: TeamSnapshot = data ?? { members: [], pendingInvites: [] };
  const activeMembers = useMemo(
    () => snapshot.members.filter((m) => m.status === "active"),
    [snapshot.members]
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["shelter-team"] });

  const roleMutation = useMutation({
    mutationFn: ({
      memberId,
      role
    }: {
      memberId: string;
      role: ShelterMemberRole;
    }) => updateMemberRole(memberId, role),
    onSuccess: () => {
      invalidate();
      toast.success("Role updated");
    },
    onError: (err: Error) =>
      toast.error(err.message || "Could not update role")
  });

  const revokeMemberMutation = useMutation({
    mutationFn: (memberId: string) => revokeMember(memberId),
    onSuccess: () => {
      invalidate();
      toast.success("Member revoked");
    },
    onError: (err: Error) => toast.error(err.message || "Could not revoke")
  });

  const resendMutation = useMutation({
    mutationFn: (inviteId: string) => resendInvite(inviteId),
    onSuccess: (res) => {
      invalidate();
      navigator.clipboard?.writeText(res.inviteUrl).catch(() => {});
      toast.success("New invite link copied to clipboard");
    },
    onError: (err: Error) => toast.error(err.message || "Could not resend")
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId: string) => revokeInvite(inviteId),
    onSuccess: () => {
      invalidate();
      toast.success("Invite revoked");
    },
    onError: (err: Error) => toast.error(err.message || "Could not revoke")
  });

  return (
    <Card className="p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="size-4 text-[var(--muted-foreground)]" />
            Team members
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">
            {activeMembers.length} active ·{" "}
            {snapshot.pendingInvites.length} pending · 20 max
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setInviteOpen(true)}
            disabled={!isAdmin}
            title={isAdmin ? undefined : "Only admins can invite members"}
          >
            <Plus className="size-4" />
            Invite member
          </Button>
        </div>
      </header>

      {isLoading ? (
        <p className="text-sm text-[var(--muted-foreground)]">Loading team…</p>
      ) : (
        <>
          <ul className="divide-y divide-[var(--border)]">
            {activeMembers.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                isAdminViewing={isAdmin}
                isSelf={m.id === viewerMemberId}
                onRoleChange={(role) =>
                  roleMutation.mutate({ memberId: m.id, role })
                }
                onRevoke={() => revokeMemberMutation.mutate(m.id)}
                roleMutationPending={roleMutation.isPending}
              />
            ))}
          </ul>

          {snapshot.pendingInvites.length > 0 && (
            <section className="mt-6 space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                Pending invites
              </h3>
              <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--muted)]">
                {snapshot.pendingInvites.map((inv) => (
                  <InviteRow
                    key={inv.id}
                    invite={inv}
                    isAdminViewing={isAdmin}
                    onResend={() => resendMutation.mutate(inv.id)}
                    onRevoke={() => revokeInviteMutation.mutate(inv.id)}
                    pending={
                      resendMutation.isPending ||
                      revokeInviteMutation.isPending
                    }
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={invalidate}
      />
    </Card>
  );
}

function MemberRow({
  member,
  isAdminViewing,
  isSelf,
  onRoleChange,
  onRevoke,
  roleMutationPending
}: {
  member: ShelterMember;
  isAdminViewing: boolean;
  isSelf: boolean;
  onRoleChange: (role: ShelterMemberRole) => void;
  onRevoke: () => void;
  roleMutationPending: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = member.name?.trim() || member.email;
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--primary-soft)] text-[12px] font-semibold text-[var(--primary)]">
        {initials(displayName, member.email)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">
            {displayName}
          </span>
          {isSelf && (
            <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
              You
            </span>
          )}
          <RoleChip role={member.role} />
        </div>
        <p className="truncate text-[12px] text-[var(--muted-foreground)]">
          {member.email}
          {member.lastLoginAt && (
            <>
              {" · "}Last signed in{" "}
              {new Date(member.lastLoginAt).toLocaleDateString()}
            </>
          )}
        </p>
      </div>
      {isAdminViewing && !isSelf && (
        <div className="flex items-center gap-2">
          <Select
            value={member.role}
            onValueChange={(v) => onRoleChange(v as ShelterMemberRole)}
            disabled={roleMutationPending}
          >
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRevoke}
            aria-label="Revoke member"
          >
            <Trash2 className="size-4 text-[var(--destructive)]" />
          </Button>
        </div>
      )}
      {!isAdminViewing && !isSelf && (
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          aria-label="Member actions (admin only)"
          title="Only admins can change roles"
        >
          <MoreHorizontal className="size-4" />
        </button>
      )}
    </li>
  );
}

function InviteRow({
  invite,
  isAdminViewing,
  onResend,
  onRevoke,
  pending
}: {
  invite: ShelterMemberInvite;
  isAdminViewing: boolean;
  onResend: () => void;
  onRevoke: () => void;
  pending: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm">{invite.email}</span>
          <RoleChip role={invite.role} pending />
          <span className="text-[11px] text-[var(--muted-foreground)]">
            {timeLeft(invite.expiresAt)}
          </span>
        </div>
      </div>
      {isAdminViewing && (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={onResend}
            disabled={pending}
            title="Generate a fresh link"
          >
            <RefreshCw className="size-3" /> Resend
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRevoke}
            disabled={pending}
            aria-label="Revoke invite"
          >
            <Trash2 className="size-4 text-[var(--destructive)]" />
          </Button>
        </div>
      )}
    </li>
  );
}
