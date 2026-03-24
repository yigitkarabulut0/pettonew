"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getReports, resolveReport } from "@/lib/admin-api";

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const { data: reports = [] } = useQuery({
    queryKey: ["admin-reports"],
    queryFn: getReports
  });
  const mutation = useMutation({
    mutationFn: resolveReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    }
  });

  return (
    <Card>
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Reports</p>
      <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">Moderation inbox</h1>
      <div className="mt-6 space-y-4">
        {reports.map((report) => (
          <div key={report.id} className="rounded-[28px] border border-[var(--petto-border)] bg-white/70 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl text-[var(--petto-ink)]">{report.reason}</h2>
                <p className="mt-1 text-sm text-[var(--petto-muted)]">
                  {report.targetType} • {report.targetLabel} • reported by {report.reporterName}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={report.status === "open" ? "warning" : report.status === "resolved" ? "success" : "neutral"}>
                  {report.status}
                </Badge>
                {report.status !== "resolved" ? (
                  <Button variant="ghost" onClick={() => mutation.mutate(report.id)}>
                    Resolve
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

