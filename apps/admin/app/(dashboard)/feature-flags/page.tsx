"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  type FeatureFlag,
  listFeatureFlags,
  updateFeatureFlag
} from "@/lib/api/system";

export default function FeatureFlagsPage() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["feature-flags"], queryFn: () => listFeatureFlags() });

  const toggleMut = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      updateFeatureFlag(key, { enabled }),
    onSuccess: () => {
      toast.success("Flag updated");
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const flags = query.data?.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Feature flags"
        description="Runtime toggles consumed by the mobile app. Changes take effect on next config fetch."
      />
      {query.isLoading ? (
        <div className="text-sm text-[var(--petto-muted)]">Loading…</div>
      ) : flags.length === 0 ? (
        <EmptyState
          icon={Flame}
          title="No feature flags yet"
          description="Define flags via the API or migration, then toggle them here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {flags.map((flag) => (
            <FeatureFlagCard
              key={flag.key}
              flag={flag}
              onToggle={(enabled) => toggleMut.mutate({ key: flag.key, enabled })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FeatureFlagCard({ flag, onToggle }: { flag: FeatureFlag; onToggle: (enabled: boolean) => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div className="flex-1">
          <CardTitle className="text-sm">{flag.key}</CardTitle>
          <p className="text-xs text-[var(--petto-muted)]">{flag.description ?? "No description"}</p>
        </div>
        <Switch checked={flag.enabled} onCheckedChange={onToggle} />
      </CardHeader>
      <CardContent className="text-xs text-[var(--petto-muted)]">
        {flag.payload ? (
          <pre className="max-h-24 overflow-auto rounded bg-[var(--petto-card)]/60 p-2 text-[11px]">
            {JSON.stringify(flag.payload, null, 2)}
          </pre>
        ) : (
          <span>No payload</span>
        )}
        <div className="mt-2">
          Updated <RelativeTime value={flag.updatedAt} />
        </div>
      </CardContent>
    </Card>
  );
}
