"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getNotifications, sendNotification } from "@/lib/admin-api";

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetMode, setTargetMode] = useState<"all" | "user">("all");
  const [userId, setUserId] = useState("");

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: getNotifications
  });

  const mutation = useMutation({
    mutationFn: () =>
      sendNotification(title, body, targetMode === "all" ? "all" : userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      setTitle("");
      setBody("");
      setUserId("");
    }
  });

  const canSend =
    title.trim() !== "" &&
    body.trim() !== "" &&
    (targetMode === "all" || userId.trim() !== "");

  return (
    <div className="space-y-5">
      {/* Send Notification Form */}
      <Card>
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          Notifications
        </p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-[var(--foreground)]">
          Push Notifications
        </h1>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--petto-ink)]">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title"
              className="w-full rounded-xl border border-[var(--petto-border)] bg-white px-4 py-2.5 text-sm text-[var(--petto-ink)] outline-none transition-colors focus:border-[var(--petto-primary)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--petto-ink)]">
              Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Notification body text"
              rows={3}
              className="w-full rounded-xl border border-[var(--petto-border)] bg-white px-4 py-2.5 text-sm text-[var(--petto-ink)] outline-none transition-colors focus:border-[var(--petto-primary)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--petto-ink)]">
              Target
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setTargetMode("all")}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  targetMode === "all"
                    ? "bg-[var(--petto-primary)] text-white"
                    : "bg-[var(--petto-background)] text-[var(--petto-ink)] hover:bg-gray-200"
                }`}
              >
                All Users
              </button>
              <button
                onClick={() => setTargetMode("user")}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  targetMode === "user"
                    ? "bg-[var(--petto-primary)] text-white"
                    : "bg-[var(--petto-background)] text-[var(--petto-ink)] hover:bg-gray-200"
                }`}
              >
                Specific User
              </button>
            </div>
            {targetMode === "user" && (
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="User ID"
                className="mt-2 w-full rounded-xl border border-[var(--petto-border)] bg-white px-4 py-2.5 text-sm text-[var(--petto-ink)] outline-none transition-colors focus:border-[var(--petto-primary)]"
              />
            )}
          </div>

          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSend || mutation.isPending}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {mutation.isPending ? "Sending..." : "Send Notification"}
          </Button>

          {mutation.isError && (
            <p className="text-sm text-red-500">
              Failed to send: {(mutation.error as Error).message}
            </p>
          )}
          {mutation.isSuccess && (
            <p className="text-sm text-green-600">Notification sent successfully.</p>
          )}
        </div>
      </Card>

      {/* Notification History */}
      <Card>
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          History
        </p>
        <h2 className="mt-2 text-base font-semibold text-[var(--foreground)]">
          Sent Notifications
        </h2>

        <div className="mt-6 space-y-3">
          {isLoading && (
            <p className="py-12 text-center text-[var(--petto-muted)]">
              Loading...
            </p>
          )}
          {!isLoading && notifications.length === 0 && (
            <p className="py-12 text-center text-[var(--petto-muted)]">
              No notifications sent yet.
            </p>
          )}
          {notifications.map((n) => (
            <div
              key={n.id}
              className="rounded-[20px] border border-[var(--petto-border)] bg-white/70 p-4 md:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--petto-background)]">
                    <Bell className="h-5 w-5 text-[var(--petto-secondary)]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--petto-ink)]">{n.title}</p>
                    <p className="mt-0.5 text-sm text-[var(--petto-muted)]">{n.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone={n.target === "all" ? "success" : "neutral"}>
                        {n.target === "all" ? "All Users" : `User: ${n.target}`}
                      </Badge>
                      <Badge tone={n.sentBy === "system" ? "warning" : "neutral"}>
                        {n.sentBy}
                      </Badge>
                    </div>
                  </div>
                </div>
                <p className="shrink-0 text-xs text-[var(--petto-muted)]">
                  {new Date(n.sentAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
