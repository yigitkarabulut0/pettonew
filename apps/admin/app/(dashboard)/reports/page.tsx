"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, MessageSquare, ImageIcon, PawPrint } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getReports } from "@/lib/admin-api";
import type { ReportSummary } from "@petto/contracts";

const TYPE_ICON: Record<string, typeof MessageSquare> = {
  chat: MessageSquare,
  pet: PawPrint,
  post: ImageIcon
};

const TYPE_LABEL: Record<string, string> = {
  chat: "Chat",
  pet: "Pet",
  post: "Post"
};

type FilterStatus = "all" | "open" | "in_review" | "resolved";

export default function ReportsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterStatus>("all");
  const { data: reports = [] } = useQuery({
    queryKey: ["admin-reports"],
    queryFn: getReports
  });

  const filtered =
    filter === "all" ? reports : reports.filter((r) => r.status === filter);

  return (
    <Card>
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">
        Reports
      </p>
      <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">
        Moderation inbox
      </h1>

      <div className="mt-6 flex flex-wrap gap-2">
        {(["all", "open", "in_review", "resolved"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              filter === status
                ? "bg-[var(--petto-primary)] text-white"
                : "bg-[var(--petto-background)] text-[var(--petto-ink)] hover:bg-gray-200"
            }`}
          >
            {status === "all" ? "All" : status.replace("_", " ")}
            <span className="ml-1.5 opacity-70">
              (
              {status === "all"
                ? reports.length
                : reports.filter((r) => r.status === status).length}
              )
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {filtered.length === 0 && (
          <p className="py-12 text-center text-[var(--petto-muted)]">
            No reports found.
          </p>
        )}
        {filtered.map((report) => {
          const Icon = TYPE_ICON[report.targetType] ?? ImageIcon;
          return (
            <button
              key={report.id}
              onClick={() => router.push(`/reports/${report.id}`)}
              className="group flex items-center gap-4 rounded-[20px] border border-[var(--petto-border)] bg-white/70 p-4 text-left transition-all hover:border-[var(--petto-primary)] hover:shadow-md md:p-5"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--petto-background)]">
                <Icon className="h-5 w-5 text-[var(--petto-secondary)]" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      report.targetType === "chat"
                        ? "neutral"
                        : report.targetType === "pet"
                          ? "warning"
                          : "success"
                    }
                  >
                    {TYPE_LABEL[report.targetType] ?? report.targetType}
                  </Badge>
                  <span className="text-sm text-[var(--petto-muted)]">
                    {report.reason}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--petto-muted)] truncate">
                  {report.targetLabel} &middot; reported by{" "}
                  {report.reporterName}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Badge
                  tone={
                    report.status === "open"
                      ? "warning"
                      : report.status === "in_review"
                        ? "neutral"
                        : "success"
                  }
                >
                  {report.status.replace("_", " ")}
                </Badge>
                <ChevronRight className="h-4 w-4 text-[var(--petto-muted)] group-hover:text-[var(--petto-primary)] transition-colors" />
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
