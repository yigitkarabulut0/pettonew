"use client";

import { ShieldCheck, PenLine, Eye, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ShelterMemberRole } from "@petto/contracts";

type Props = {
  role: ShelterMemberRole;
  pending?: boolean;
};

// Colour coding for the three roles — admin (orange, matches brand),
// editor (info blue), viewer (neutral). Pending invites get a fourth
// "warning" treatment so they stand out while awaiting acceptance.
export function RoleChip({ role, pending }: Props) {
  if (pending) {
    return (
      <Badge tone="warning" className="gap-1">
        <Clock className="size-3" />
        Pending · {labelFor(role)}
      </Badge>
    );
  }
  switch (role) {
    case "admin":
      return (
        <Badge tone="danger" className="gap-1">
          <ShieldCheck className="size-3" />
          Admin
        </Badge>
      );
    case "editor":
      return (
        <Badge tone="info" className="gap-1">
          <PenLine className="size-3" />
          Editor
        </Badge>
      );
    case "viewer":
      return (
        <Badge tone="neutral" className="gap-1">
          <Eye className="size-3" />
          Viewer
        </Badge>
      );
    default:
      return <Badge tone="neutral">{role}</Badge>;
  }
}

function labelFor(role: ShelterMemberRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
