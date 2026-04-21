"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, Copy, Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  inviteSchema,
  roleDescriptions,
  roleLabels,
  type ApplyRole,
  type InviteFormValues
} from "@/lib/team-schema";
import { createInvite, type CreateInviteResult } from "@/lib/team-api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited?: () => void; // parent reloads team snapshot
};

// Two-phase dialog:
//   1. Form — email + role → submit → call API
//   2. Result — show the invite URL with a copy button so the admin can
//      paste it into WhatsApp/email/etc. (No email infra.)
export function InviteMemberDialog({ open, onOpenChange, onInvited }: Props) {
  const [result, setResult] = useState<CreateInviteResult | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "viewer" }
  });
  const role = form.watch("role") ?? "viewer";

  const reset = () => {
    setResult(null);
    setCopied(false);
    form.reset({ email: "", role: "viewer" });
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    setPending(true);
    try {
      const res = await createInvite({
        email: values.email,
        role: values.role
      });
      setResult(res);
      onInvited?.();
      toast.success(`Invite sent to ${values.email}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create invite"
      );
    } finally {
      setPending(false);
    }
  });

  const copyUrl = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="size-4 text-[var(--primary)]" />
                Invite link ready
              </DialogTitle>
              <DialogDescription>
                Copy this link and send it to{" "}
                <strong>{result.invite.email}</strong>. It expires in 72
                hours — you can resend from the team list if needed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--muted)] p-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-[12px] text-[var(--foreground)]">
                  {result.inviteUrl}
                </code>
                <Button size="sm" variant="outline" onClick={copyUrl}>
                  {copied ? (
                    <>
                      <Check className="size-3" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Role: {roleLabels[result.invite.role as ApplyRole]} · Expires{" "}
                {new Date(result.invite.expiresAt).toLocaleString()}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
              <DialogDescription>
                They'll get a link (valid 72 hours) to set their own
                password and join with the role you pick.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  placeholder="volunteer@shelter.org"
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <p className="text-[11px] text-[var(--destructive)]">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) =>
                    form.setValue("role", v as ApplyRole, {
                      shouldValidate: true
                    })
                  }
                >
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  {roleDescriptions[role as ApplyRole]}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create invite"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
