"use client";

import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendBroadcast } from "@/lib/api/system";

export default function BroadcastPage() {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [deepLink, setDeepLink] = React.useState("");

  const mut = useMutation({
    mutationFn: sendBroadcast,
    onSuccess: (result) => {
      toast.success(`Queued (${result?.deliveredCount ?? 0} recipients)`);
      router.push("/notifications");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Broadcast"
        description="Send a push to a segmented cohort. Respects per-user notification preferences."
      />
      <Card className="max-w-2xl p-6">
        <div className="grid gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short, punchy" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Body</Label>
            <Textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Context for the user"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Deep link (optional)</Label>
            <Input
              value={deepLink}
              onChange={(e) => setDeepLink(e.target.value)}
              placeholder="petto://playdates/abc"
            />
          </div>
          <div className="rounded-xl border border-dashed border-[var(--petto-border)] bg-[var(--petto-card)]/40 p-3 text-xs text-[var(--petto-muted)]">
            Segment builder (country, cohort, hasPets, activeWithinDays) arrives in the next
            release. Current broadcasts go to <strong>all opted-in users</strong>.
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button
              disabled={!title || !body || mut.isPending}
              onClick={() => mut.mutate({ title, body, deepLink: deepLink || undefined })}
            >
              <Send className="h-4 w-4" /> {mut.isPending ? "Sending…" : "Send broadcast"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
