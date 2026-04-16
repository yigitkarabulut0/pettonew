"use client";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Briefcase } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" description="Console-wide configuration. Superadmin only." />
      <EmptyState
        icon={Briefcase}
        title="No global settings yet"
        description="Integrations, SSO, and branding will surface here in a future release."
      />
    </div>
  );
}
