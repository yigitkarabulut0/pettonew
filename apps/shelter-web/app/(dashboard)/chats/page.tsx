"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";

import { Card } from "@/components/ui/card";
import { listShelterApplications } from "@/lib/api";

export default function ChatsPage() {
  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["shelter-applications", "chat_open"],
    queryFn: () => listShelterApplications("chat_open")
  });

  return (
    <div className="space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Chats</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Conversations opened after you approved an application.
        </p>
      </header>

      {isLoading ? (
        <div className="text-sm text-[var(--muted-foreground)]">Loading…</div>
      ) : apps.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <MessageSquare className="size-6 text-[var(--muted-foreground)]" />
          <p className="text-sm text-[var(--muted-foreground)]">
            No active chats yet. When you approve an application a chat opens
            here automatically.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {apps.map((app) => (
            <Link key={app.id} href={`/applications/${app.id}`}>
              <Card className="flex items-center gap-3 p-3 transition-colors hover:bg-[var(--muted)]">
                {app.petPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={app.petPhoto}
                    alt=""
                    className="size-12 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-lg bg-[var(--muted)]">
                    <MessageSquare className="size-4 text-[var(--muted-foreground)]" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {app.userName}
                  </div>
                  <div className="truncate text-xs text-[var(--muted-foreground)]">
                    Re: {app.petName}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        The full chat UI with real-time messaging is built into the Petto
        Shelter mobile app. Use the app to reply on the go — messages sync
        between web and mobile.
      </p>
    </div>
  );
}
