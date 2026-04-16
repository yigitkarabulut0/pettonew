"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiLogout } from "@/lib/api/client";
import { fmtInitials } from "@/lib/format";
import { useAdminSession } from "@/lib/permissions";

export default function AccountPage() {
  const { session, loading } = useAdminSession();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await apiLogout();
      toast.success("Signed out");
      router.replace("/login");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="My account"
        description="Your admin console session and role."
      />
      <Card className="max-w-xl p-6">
        {loading ? (
          <div className="text-sm text-[var(--petto-muted)]">Loading…</div>
        ) : session ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="text-base">
                  {fmtInitials(session.name ?? session.email)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="text-lg font-semibold text-[var(--petto-ink)]">
                  {session.name || session.email}
                </div>
                <div className="text-sm text-[var(--petto-muted)]">{session.email}</div>
                {session.role ? (
                  <div className="mt-1">
                    <Badge tone="brand">{session.role}</Badge>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--petto-border)] pt-4">
              <Button variant="destructive" onClick={handleLogout}>
                Sign out
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-[var(--petto-muted)]">Not signed in.</div>
        )}
      </Card>
    </div>
  );
}
