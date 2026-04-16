import { Badge } from "@/components/ui/badge";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const STATUS_TONES: Record<string, Tone> = {
  active: "success",
  verified: "success",
  published: "success",
  approved: "success",
  resolved: "success",
  adopted: "success",
  found: "success",
  available: "info",
  pending: "warning",
  open: "warning",
  unresolved: "warning",
  upcoming: "info",
  past: "neutral",
  hidden: "neutral",
  inactive: "neutral",
  banned: "danger",
  suspended: "danger",
  cancelled: "danger",
  dismissed: "neutral",
  reported: "warning",
  lost: "warning",
  draft: "neutral"
};

export function StatusBadge({ status }: { status?: string | null }) {
  const key = (status ?? "unknown").toLowerCase();
  const tone = STATUS_TONES[key] ?? "neutral";
  return <Badge tone={tone}>{status ?? "—"}</Badge>;
}
