"use client";

import { Eye, Loader2, PawPrint, RefreshCw, Trash2, WifiOff } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { RelativeTime } from "@/components/common/RelativeTime";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type AdminConversationMessage,
  deleteAdminConversationMessage,
  getAdminConversationMessages,
  getAdminConversationWsTicket
} from "@/lib/admin-api";
import { fmtInitials } from "@/lib/format";

type Props = {
  conversationId: string;
  organizerId?: string;
  hostName?: string;
  // When the conversation is a 1:1 DM, pass the two participant IDs so the
  // pane splits messages left/right (like a real messenger) instead of
  // stacking every bubble on the left like a group chat. The first ID is
  // pinned to the left column, the second to the right. Setting this also
  // switches the header title and system-event copy to DM-appropriate
  // wording ("joined the chat" → no group context).
  dmParticipants?: [string, string];
  // Drives header copy + system-event phrasing. Defaults to "group" so the
  // existing community-group consumer keeps its current strings.
  mode?: "group" | "playdate" | "dm";
  className?: string;
};

type Status = "connecting" | "live" | "offline";

// Build a wss:// URL for the read-only admin chat stream. The browser cannot
// send a Bearer header on a WS upgrade, so the server authenticates via the
// short-lived HMAC ticket minted from inside the admin auth proxy.
function buildWsUrl(ticket: string, conversationId: string): string {
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
  if (!apiBase) {
    if (typeof window === "undefined") return "";
    // SSR-safe fallback: same origin, ws scheme matched to https.
    return "";
  }
  const wsBase = apiBase.replace(/^http/, "ws");
  const sp = new URLSearchParams();
  sp.set("ticket", ticket);
  sp.set("conversationId", conversationId);
  return `${wsBase}/v1/admin/ws-stream?${sp.toString()}`;
}

export function PlaydateChatPane({
  conversationId,
  organizerId,
  hostName,
  dmParticipants,
  mode,
  className
}: Props) {
  const resolvedMode: "group" | "playdate" | "dm" =
    mode ?? (dmParticipants ? "dm" : "group");
  const [messages, setMessages] = React.useState<AdminConversationMessage[]>([]);
  const [status, setStatus] = React.useState<Status>("connecting");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = React.useRef(true);

  const refreshHistory = React.useCallback(async () => {
    if (!conversationId) return;
    try {
      setLoading(true);
      const rows = await getAdminConversationMessages(conversationId, { limit: 200 });
      // Backend returns ASC. Defensive sort + dedupe by id.
      const sorted = [...(rows ?? [])].sort(
        (a, b) => new Date(a.createdAt).valueOf() - new Date(b.createdAt).valueOf()
      );
      setMessages(sorted);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chat");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Initial paint + refresh on focus regain so the gap during a brief WS
  // disconnect is filled by an authoritative REST fetch.
  React.useEffect(() => {
    refreshHistory();
    const onFocus = () => refreshHistory();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshHistory]);

  // WebSocket lifecycle — exponential reconnect, ticket per connection.
  React.useEffect(() => {
    if (!conversationId) return;
    let socket: WebSocket | null = null;
    let cancelled = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      if (cancelled) return;
      setStatus("connecting");
      try {
        const { ticket } = await getAdminConversationWsTicket(conversationId);
        const url = buildWsUrl(ticket, conversationId);
        if (!url) {
          setStatus("offline");
          return;
        }
        socket = new WebSocket(url);
      } catch (err) {
        scheduleReconnect();
        return;
      }
      if (!socket) return;

      socket.onopen = () => {
        attempt = 0;
        setStatus("live");
        // Sync once on connect to catch anything posted between REST snapshot
        // and WS handshake.
        refreshHistory();
      };
      socket.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          // Mobile/server hub broadcasts wrap the message: `{type:"message.created", data:<Message>}`
          // for chat events, and `{type:"typing", userId}` for typing. Pull the inner Message
          // out before merging; ignore everything else (typing, presence, etc).
          const payload =
            raw && raw.type === "message.created" && raw.data
              ? raw.data
              : raw && raw.id
                ? raw
                : null;
          if (payload && payload.id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.id)) return prev;
              return [
                ...prev,
                {
                  id: payload.id,
                  conversationId: payload.conversationId ?? conversationId,
                  senderUserId:
                    payload.senderProfileId ?? payload.senderUserId ?? payload.senderId ?? "",
                  senderName: payload.senderName ?? "",
                  senderAvatarUrl: payload.senderAvatarUrl ?? "",
                  body: payload.body ?? "",
                  type: payload.type ?? "text",
                  imageUrl: payload.imageUrl ?? "",
                  metadata: payload.metadata ?? undefined,
                  createdAt: payload.createdAt ?? new Date().toISOString()
                }
              ];
            });
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onerror = () => {
        // Let onclose handle reconnect — onerror is informational only.
      };
      socket.onclose = () => {
        if (cancelled) return;
        setStatus("offline");
        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      attempt += 1;
      const delay = Math.min(30_000, 500 * 2 ** Math.min(attempt, 6));
      reconnectTimer = setTimeout(() => {
        connect();
      }, delay);
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
          socket.close();
        } catch {
          /* noop */
        }
      }
    };
  }, [conversationId, refreshHistory]);

  // Auto-scroll to bottom on new messages, but only if the user was already
  // pinned to the bottom — otherwise we'd snatch their scroll position.
  React.useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (stickToBottomRef.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages.length]);

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  }

  async function onDelete(message: AdminConversationMessage) {
    if (!conversationId || !message.id) return;
    if (deletingId) return;
    setDeletingId(message.id);
    try {
      await deleteAdminConversationMessage(conversationId, message.id);
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, deletedAt: new Date().toISOString() } : m))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div
      className={
        "flex h-full flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] " +
        (className ?? "")
      }
    >
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            {resolvedMode === "dm"
              ? "Direct messages"
              : resolvedMode === "playdate"
                ? "Playdate chat"
                : "Group chat"}
          </h3>
          <ConnectionPill status={status} />
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone="info" className="uppercase">
            <Eye className="h-3 w-3" /> read-only
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => refreshHistory()}
            aria-label="Refresh chat history"
            title="Refresh"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{ minHeight: 0 }}
      >
        {error ? (
          <div className="mb-2 rounded-md border border-[var(--border)] bg-[var(--destructive-soft)] px-3 py-2 text-xs text-[var(--destructive)]">
            {error}
          </div>
        ) : null}

        {!loading && messages.length === 0 ? (
          <div className="flex h-full min-h-[180px] items-center justify-center rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)] p-6 text-center text-xs text-[var(--muted-foreground)]">
            {dmParticipants
              ? "No messages yet — when either user writes, it'll show up here live."
              : "No messages yet — when someone writes, it'll show up here live."}
          </div>
        ) : null}

        <ul className="flex flex-col gap-2">
          {messages.map((message) =>
            message.type === "system" ? (
              <SystemEventRow
                key={message.id}
                message={message}
                mode={resolvedMode}
              />
            ) : (
              <MessageRow
                key={message.id}
                message={message}
                isOrganizer={!!organizerId && message.senderUserId === organizerId}
                hostName={hostName}
                align={
                  dmParticipants
                    ? message.senderUserId === dmParticipants[1]
                      ? "right"
                      : "left"
                    : "left"
                }
                deleting={deletingId === message.id}
                onDelete={() => onDelete(message)}
              />
            )
          )}
        </ul>
      </div>

      <footer className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted-foreground)]">
        Read-only — the admin viewer cannot send messages or typing indicators.
      </footer>
    </div>
  );
}

function ConnectionPill({ status }: { status: Status }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--success)]">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--success)] opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
        </span>
        Live
      </span>
    );
  }
  if (status === "connecting") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
        <Loader2 className="h-3 w-3 animate-spin" /> connecting
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--warning)]">
      <WifiOff className="h-3 w-3" /> reconnecting
    </span>
  );
}

function MessageRow({
  message,
  isOrganizer,
  hostName,
  align = "left",
  deleting,
  onDelete
}: {
  message: AdminConversationMessage;
  isOrganizer: boolean;
  hostName?: string;
  align?: "left" | "right";
  deleting: boolean;
  onDelete: () => void;
}) {
  const deleted = !!message.deletedAt;
  const displayName = message.senderName || (isOrganizer ? hostName : "") || "Unknown";
  const isRight = align === "right";

  // Bubble color logic:
  // - DM right-side: coral tint (the second participant in a DM gets the
  //   "outgoing" treatment so the two columns are visually distinct)
  // - DM left-side: forest tint (slate/forest distinguishes from the right)
  // - Group: organizer gets coral, everyone else neutral card surface
  const bubbleClass = isRight
    ? "border-[#E6694A]/30 bg-[#E6694A]/5"
    : align === "left" && !isOrganizer && message.senderUserId
      ? "border-[#21433C]/20 bg-[#21433C]/5"
      : isOrganizer
        ? "border-[#E6694A]/30 bg-[#E6694A]/5"
        : "border-[var(--border)] bg-[var(--card)]";

  return (
    <li className={"flex " + (isRight ? "justify-end" : "justify-start")}>
    <div
      className={
        "group flex max-w-[88%] items-start gap-2 rounded-md border px-3 py-2 transition-colors " +
        (isRight ? "flex-row-reverse text-right " : "") +
        bubbleClass
      }
    >
      <Avatar className="mt-0.5 h-8 w-8 shrink-0">
        {message.senderAvatarUrl ? (
          <AvatarImage src={message.senderAvatarUrl} alt={displayName} />
        ) : null}
        <AvatarFallback>{fmtInitials(displayName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="truncate text-xs font-semibold text-[var(--foreground)]">
            {displayName}
          </span>
          {isOrganizer ? (
            <span className="rounded-sm bg-[#E6694A]/15 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-[#E6694A]">
              Host
            </span>
          ) : null}
          <span className="text-[10px] text-[var(--muted-foreground)]">
            <RelativeTime value={message.createdAt} />
          </span>
        </div>
        {deleted ? (
          <p className="mt-1 text-xs italic text-[var(--muted-foreground)]">
            This message was removed.
          </p>
        ) : (
          <MessageContent message={message} />
        )}
      </div>
      {!deleted ? (
        <Button
          size="icon"
          variant="ghost"
          aria-label="Delete message"
          title="Delete message"
          disabled={deleting}
          onClick={onDelete}
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5 text-[var(--destructive)]" />
          )}
        </Button>
      ) : null}
      </div>
    </li>
  );
}

// Renders the body of a regular (non-system, non-deleted) message. Handles
// the four content shapes the backend produces:
//   - text:      `body` is the message text
//   - image:     `imageUrl` is required, `body` is an optional caption
//   - pet_share: `metadata` holds the pet card; `body` is an optional caption
//   - other:     fall back to a quiet "(no content)" so the row never renders
//                visually empty — that was the bug you were seeing.
function MessageContent({ message }: { message: AdminConversationMessage }) {
  const meta = (message.metadata ?? {}) as {
    petId?: string;
    petName?: string;
    petPhotoUrl?: string;
    speciesLabel?: string;
    breedLabel?: string;
  };

  const isPetShare = message.type === "pet_share" || !!meta.petName;
  const isImage = message.type === "image" || (!!message.imageUrl && !isPetShare);
  const hasBody = !!(message.body && message.body.trim());

  return (
    <div className="mt-0.5 flex flex-col gap-1.5">
      {isImage && message.imageUrl ? (
        <a
          href={message.imageUrl}
          target="_blank"
          rel="noreferrer"
          className="block max-w-[280px] overflow-hidden rounded-md border border-[var(--border)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={message.imageUrl}
            alt="attachment"
            className="block h-auto w-full object-cover"
          />
        </a>
      ) : null}

      {isPetShare ? (
        <PetShareCard
          petId={meta.petId}
          petName={meta.petName}
          petPhotoUrl={meta.petPhotoUrl}
          speciesLabel={meta.speciesLabel}
          breedLabel={meta.breedLabel}
        />
      ) : null}

      {hasBody ? (
        <p className="whitespace-pre-wrap break-words text-sm text-[var(--foreground)]">
          {message.body}
        </p>
      ) : !isImage && !isPetShare ? (
        <p className="text-xs italic text-[var(--muted-foreground)]">
          (no content · {message.type || "unknown"})
        </p>
      ) : null}
    </div>
  );
}

// Renders a shared-pet card. Tappable when the metadata included a petId so
// the admin can jump straight to the pet's moderation page from chat — the
// fastest path from "this pet was shared in a flagged chat" to the actions
// screen (hide / suspend owner / delete).
function PetShareCard({
  petId,
  petName,
  petPhotoUrl,
  speciesLabel,
  breedLabel
}: {
  petId?: string;
  petName?: string;
  petPhotoUrl?: string;
  speciesLabel?: string;
  breedLabel?: string;
}) {
  const inner = (
    <>
      {petPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={petPhotoUrl}
          alt={petName ?? "pet"}
          className="h-10 w-10 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--card)] text-[var(--muted-foreground)]">
          <PawPrint className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--foreground)]">
          {petName ?? "Shared pet"}
        </div>
        <div className="truncate text-[11px] text-[var(--muted-foreground)]">
          {[speciesLabel, breedLabel].filter(Boolean).join(" · ") || "pet card"}
        </div>
      </div>
    </>
  );

  const baseClass =
    "flex max-w-[320px] items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)] p-2";

  if (!petId) {
    return <div className={baseClass}>{inner}</div>;
  }

  return (
    <Link
      href={`/pets/${encodeURIComponent(petId)}`}
      onClick={(event) => event.stopPropagation()}
      className={`${baseClass} transition-colors hover:bg-[var(--secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]`}
      title="Open pet profile"
    >
      {inner}
    </Link>
  );
}

// System events (member_joined / member_left / member_kicked / member_muted /
// admin_promoted / host_changed) get a centered, subtle one-liner — they're
// not chat messages, so showing them as bubbles ("Unknown · 5d ago · member_joined")
// reads like a glitch. Body is the event code; the metadata jsonb carries
// who it was about.
function SystemEventRow({
  message,
  mode
}: {
  message: AdminConversationMessage;
  mode: "group" | "playdate" | "dm";
}) {
  const phrase = formatSystemEvent(message, mode);
  if (!phrase) return null;
  return (
    <li className="flex items-center justify-center py-1">
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2.5 py-0.5 text-[11px] text-[var(--muted-foreground)]">
        {phrase}
        <span className="text-[10px] opacity-70">
          · <RelativeTime value={message.createdAt} />
        </span>
      </span>
    </li>
  );
}

function formatSystemEvent(
  message: AdminConversationMessage,
  mode: "group" | "playdate" | "dm"
): string | null {
  const meta = (message.metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.firstName === "string" && meta.firstName) ||
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.userName === "string" && meta.userName) ||
    "Someone";
  const code = (typeof meta.kind === "string" && meta.kind) || message.body || "event";
  // DMs are 1:1 conversations created by a match — group/admin events
  // shouldn't appear there. If the backend ever leaks one, drop it
  // entirely rather than showing nonsense like "joined the group".
  if (mode === "dm") {
    if (code === "match_created" || code === "matched") {
      return `${name} matched`;
    }
    return null;
  }
  // "the group" vs "the playdate" — same event codes (insertSystemMessage is
  // shared between both surfaces), so we vary the noun here per consumer.
  const surface = mode === "playdate" ? "playdate" : "group";
  switch (code) {
    case "member_joined":
      return `${name} joined the ${surface}`;
    case "member_left":
      return `${name} left the ${surface}`;
    case "member_kicked":
      return `${name} was removed by an admin`;
    case "member_muted":
      return `${name} was muted by an admin`;
    case "admin_promoted":
      return `${name} was promoted to admin`;
    case "admin_demoted":
      return `${name} was removed as admin`;
    case "host_changed":
      return `Host changed to ${name}`;
    default:
      return code.replace(/_/g, " ");
  }
}
