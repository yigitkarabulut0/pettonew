"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Conversation, Message } from "@petto/types";
import { Avatar, AvatarFallback, AvatarImage } from "@petto/ui";
import { Input } from "@petto/ui";
import { Button } from "@petto/ui";
import { ScrollArea } from "@petto/ui";
import { ArrowLeft, Send, Loader2 } from "lucide-react";

export default function ChatConversationPage() {
  const router = useRouter();
  const params = useParams();
  const conversationId = params.id as string;
  const { user } = useAuth();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    Promise.all([
      api.get<Conversation>(`/chat/conversations/${conversationId}`),
      api.get<Message[]>(`/chat/conversations/${conversationId}/messages`),
    ])
      .then(([conv, msgs]) => {
        setConversation(conv);
        setMessages(msgs);
      })
      .catch(() => setError("Failed to load conversation"))
      .finally(() => {
        setLoading(false);
        setTimeout(scrollToBottom, 100);
      });
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getOtherMember = () => {
    if (!conversation) return null;
    return conversation.members.find((m) => m.userId !== user?.id);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    const content = newMessage.trim();
    setNewMessage("");
    setSending(true);

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      conversationId,
      senderId: user!.id,
      sender: user!,
      type: "text",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const msg = await api.post<Message>(
        `/chat/conversations/${conversationId}/messages`,
        { content }
      );
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m.id.startsWith("temp") ? msg : m)));
      setMessages((prev) => {
        const filtered = prev.filter((m) => !m.id.startsWith("temp"));
        return [...filtered, msg];
      });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setError("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const formatMessageTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const other = getOtherMember();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <button
          onClick={() => router.push("/chat")}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar className="h-9 w-9">
          <AvatarImage
            src={other?.user?.avatarUrl || other?.pet?.avatarUrl || undefined}
          />
          <AvatarFallback>
            {other?.user?.firstName?.[0] || other?.pet?.name?.[0] || "?"}
          </AvatarFallback>
        </Avatar>
        <div>
          <span className="text-sm font-semibold">
            {other?.pet?.name || other?.user?.firstName || "Unknown"}
          </span>
        </div>
      </header>

      {error && (
        <p className="px-4 py-2 text-center text-xs text-destructive">{error}</p>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          {messages.map((msg) => {
            const isOwn = msg.senderId === user?.id;
            return (
              <div
                key={msg.id}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div className="flex max-w-[75%] gap-2">
                  {!isOwn && (
                    <Avatar className="mt-auto h-7 w-7 shrink-0">
                      <AvatarImage src={msg.sender?.avatarUrl || undefined} />
                      <AvatarFallback className="text-xs">
                        {msg.sender?.firstName?.[0] || "?"}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`rounded-2xl px-3 py-2 ${
                      isOwn
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md bg-muted"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                    <p
                      className={`mt-1 text-right text-[10px] ${
                        isOwn
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formatMessageTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
            disabled={sending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!newMessage.trim() || sending}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
