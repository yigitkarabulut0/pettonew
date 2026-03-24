"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Conversation } from "@petto/types";
import { Avatar, AvatarFallback, AvatarImage } from "@petto/ui";
import { Badge } from "@petto/ui";
import { ScrollArea } from "@petto/ui";
import { MessageCircle, Loader2 } from "lucide-react";

export default function ChatPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<Conversation[]>("/chat/conversations")
      .then(setConversations)
      .catch(() => setError("Failed to load conversations"))
      .finally(() => setLoading(false));
  }, []);

  const getOtherMember = (conversation: Conversation) => {
    return conversation.members.find((m) => m.userId !== user?.id);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 86400000) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diff < 604800000) {
      return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      <h1 className="mb-4 text-xl font-bold">Messages</h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="py-12 text-center text-sm text-destructive">{error}</div>
      ) : conversations.length === 0 ? (
        <div className="flex h-[calc(100vh-180px)] items-center justify-center rounded-lg border-2 border-dashed bg-muted/30">
          <div className="text-center text-muted-foreground">
            <MessageCircle className="mx-auto mb-2 h-8 w-8" />
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs">Match with pets to start chatting</p>
          </div>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="space-y-1">
            {conversations.map((conversation) => {
              const other = getOtherMember(conversation);
              return (
                <Link
                  key={conversation.id}
                  href={`/chat/${conversation.id}`}
                  className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted"
                >
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarImage
                      src={
                        other?.user?.avatarUrl ||
                        other?.pet?.avatarUrl ||
                        undefined
                      }
                    />
                    <AvatarFallback>
                      {other?.user?.firstName?.[0] ||
                        other?.pet?.name?.[0] ||
                        "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-sm font-semibold">
                        {other?.pet?.name || other?.user?.firstName || "Unknown"}
                      </span>
                      {conversation.lastMessage && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatTime(conversation.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {conversation.lastMessage?.content || "No messages yet"}
                    </p>
                  </div>
                  {conversation.unreadCount > 0 && (
                    <Badge className="shrink-0 rounded-full px-2">
                      {conversation.unreadCount}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
