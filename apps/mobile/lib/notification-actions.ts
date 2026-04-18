import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp-style inline reply on message push notifications.
//
// This module owns:
//   1. `registerReplyCategory()` — idempotent startup registration of the
//      "message_reply" UNNotificationCategory (iOS) + "messages" channel
//      (Android) with a text-input action.
//   2. `performInlineReply(input)` — single send path shared by the
//      foreground response listener (in app/_layout.tsx) and the background
//      TaskManager task (in lib/notification-background.ts).
//   3. A silent retry queue in AsyncStorage so replies that fail (network
//      hiccup, token expired + refresh failed) flush automatically when the
//      app next becomes active — no visible "reply failed" toast.
//
// The persisted session blob written by zustand/persist in store/session.ts
// is keyed "petto-session" and shaped `{ state: { session, ... }, version }`.
// We read/write it directly here instead of importing the zustand store to
// keep the background bundle small and avoid hydrating React-side state.
// ─────────────────────────────────────────────────────────────────────────────

export const REPLY_ACTION_ID = "REPLY";
export const MESSAGE_REPLY_CATEGORY = "message_reply";
export const MESSAGES_CHANNEL_ID = "messages";

const SESSION_KEY = "petto-session";
const PENDING_KEY = "petto-inline-reply-pending";
const HANDLED_KEY = "petto-inline-reply-handled";

// Caps protect AsyncStorage from unbounded growth if the user fires an
// unusual volume of replies or the queue never drains (eg permanent offline).
const PENDING_CAP = 50;
const HANDLED_CAP = 50;
const MAX_QUEUE_ATTEMPTS = 5;
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000; // 24h

type TokenBundle = { accessToken: string; refreshToken: string };

function apiBase(): string | null {
  const url =
    (process.env as Record<string, string | undefined>).EXPO_PUBLIC_API_BASE_URL ??
    (process.env as Record<string, string | undefined>).API_BASE_URL;
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

// ─── Category registration ───────────────────────────────────────────────────

export async function registerReplyCategory() {
  try {
    await Notifications.setNotificationCategoryAsync(MESSAGE_REPLY_CATEGORY, [
      {
        identifier: REPLY_ACTION_ID,
        buttonTitle: "Reply",
        textInput: {
          submitButtonTitle: "Send",
          placeholder: "Type a reply…"
        },
        options: {
          // Keep the user on the lock screen / in the previous app — the
          // whole point of inline reply is not opening Petto.
          opensAppToForeground: false
        }
      }
    ]);
  } catch (err) {
    // Re-registration of the same category throws on some SDKs; safe to ignore.
    console.warn("[inline-reply] category register failed:", err);
  }

  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync(MESSAGES_CHANNEL_ID, {
        name: "Messages",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#E6694A"
      });
    } catch (err) {
      console.warn("[inline-reply] channel register failed:", err);
    }
  }
}

// ─── Session token helpers ───────────────────────────────────────────────────

type PersistedSessionBlob = {
  state?: {
    session?: {
      tokens?: TokenBundle;
      user?: unknown;
    } | null;
    [k: string]: unknown;
  };
  version?: number;
};

async function readSessionTokens(): Promise<TokenBundle | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSessionBlob;
    const tokens = parsed?.state?.session?.tokens;
    if (!tokens?.accessToken || !tokens?.refreshToken) return null;
    return tokens;
  } catch {
    return null;
  }
}

async function writeSessionTokens(next: TokenBundle): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PersistedSessionBlob;
    if (!parsed.state?.session) return;
    parsed.state.session.tokens = next;
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
  } catch (err) {
    console.warn("[inline-reply] token write failed:", err);
  }
}

async function refreshTokens(current: TokenBundle): Promise<TokenBundle | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken })
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as {
      data?: { tokens?: TokenBundle; accessToken?: string; refreshToken?: string };
    };
    // Backend returns either `{ data: { tokens } }` or `{ data: { accessToken, refreshToken } }`
    // depending on endpoint shape — support both.
    const next: TokenBundle | null = payload?.data?.tokens ??
      (payload?.data?.accessToken && payload?.data?.refreshToken
        ? { accessToken: payload.data.accessToken, refreshToken: payload.data.refreshToken }
        : null);
    if (!next) return null;
    await writeSessionTokens(next);
    return next;
  } catch {
    return null;
  }
}

// ─── Dedup set ───────────────────────────────────────────────────────────────

async function readList(key: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

async function writeList(key: string, list: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(list));
  } catch {
    // ignore
  }
}

async function alreadyHandled(messageId: string): Promise<boolean> {
  const list = await readList(HANDLED_KEY);
  return list.includes(messageId);
}

async function markHandled(messageId: string): Promise<void> {
  const list = await readList(HANDLED_KEY);
  if (list.includes(messageId)) return;
  list.push(messageId);
  while (list.length > HANDLED_CAP) list.shift();
  await writeList(HANDLED_KEY, list);
}

// ─── Pending queue ───────────────────────────────────────────────────────────

export type PendingReply = {
  conversationId: string;
  messageId: string;
  userText: string;
  notificationRequestId: string;
  enqueuedAt: number;
  attempts: number;
};

async function readPending(): Promise<PendingReply[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingReply[]) : [];
  } catch {
    return [];
  }
}

async function writePending(list: PendingReply[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

async function enqueuePending(entry: Omit<PendingReply, "enqueuedAt" | "attempts">) {
  const list = await readPending();
  // Dedupe by messageId so rapid retries don't stack.
  const filtered = list.filter((e) => e.messageId !== entry.messageId);
  filtered.push({ ...entry, enqueuedAt: Date.now(), attempts: 0 });
  while (filtered.length > PENDING_CAP) filtered.shift();
  await writePending(filtered);
}

// ─── Send path ───────────────────────────────────────────────────────────────

type PostOutcome = "ok" | "unauthorized" | "error";

async function postReply(
  accessToken: string,
  conversationId: string,
  body: string
): Promise<PostOutcome> {
  const base = apiBase();
  if (!base) return "error";
  try {
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ conversationId, type: "text", body })
    });
    if (res.ok) return "ok";
    if (res.status === 401) return "unauthorized";
    return "error";
  } catch {
    return "error";
  }
}

export type InlineReplyInput = {
  conversationId: string;
  messageId: string;
  userText: string;
  notificationRequestId: string;
};

// Same-runtime concurrent-call guard. iOS sometimes fires a REPLY response
// to BOTH the foreground response listener AND the TaskManager background
// task (e.g. when the user replies from the lock screen while the app is
// still resident in memory — both paths wake up). The two enter
// performInlineReply concurrently, both pre-checks see "not handled"
// because `markHandled` only runs after a successful POST, so both POST
// and the recipient gets the same message twice.
//
// This in-memory Set runs inside the shared JS bundle so the foreground
// and background callers synchronize on it immediately, BEFORE any async
// AsyncStorage round-trip. Cross-runtime duplicates (app truly killed,
// bg runtime spun up) still fall through to the AsyncStorage `handled`
// set on any subsequent retry.
const inflightMessageIds = new Set<string>();

export async function performInlineReply(input: InlineReplyInput): Promise<"sent" | "queued"> {
  const text = (input.userText ?? "").trim();
  if (!text) return "sent"; // nothing to do; pretend we sent

  // Same-runtime concurrent call — the other path is already sending it.
  if (inflightMessageIds.has(input.messageId)) {
    return "sent";
  }

  if (await alreadyHandled(input.messageId)) {
    await dismiss(input.notificationRequestId);
    return "sent";
  }

  inflightMessageIds.add(input.messageId);
  try {
    const tokens = await readSessionTokens();
    if (!tokens) {
      await enqueuePending({ ...input, userText: text });
      return "queued";
    }

    let outcome = await postReply(tokens.accessToken, input.conversationId, text);
    if (outcome === "unauthorized") {
      const refreshed = await refreshTokens(tokens);
      if (refreshed) {
        outcome = await postReply(refreshed.accessToken, input.conversationId, text);
      }
    }

    if (outcome === "ok") {
      await markHandled(input.messageId);
      await dismiss(input.notificationRequestId);
      return "sent";
    }

    await enqueuePending({ ...input, userText: text });
    return "queued";
  } finally {
    inflightMessageIds.delete(input.messageId);
  }
}

async function dismiss(requestId: string) {
  try {
    await Notifications.dismissNotificationAsync(requestId);
  } catch {
    // iOS sometimes rejects dismissing a notification that's already been
    // cleared by the system; harmless.
  }
}

// ─── Queue flush ─────────────────────────────────────────────────────────────

// Called on AppState → active (and once at mount) so pending replies
// eventually post themselves without any user-visible retry UI.
export async function flushPendingReplies(): Promise<void> {
  const list = await readPending();
  if (list.length === 0) return;

  const survivors: PendingReply[] = [];
  for (const entry of list) {
    const age = Date.now() - (entry.enqueuedAt ?? 0);
    if (entry.attempts >= MAX_QUEUE_ATTEMPTS || age > MAX_QUEUE_AGE_MS) {
      // Silently drop — user can retype inside the app if they care enough.
      continue;
    }
    // Another reply for the same messageId is already in flight (e.g. the
    // user re-opened the app mid-post). Keep the entry and let the next
    // flush try again — don't double-post.
    if (inflightMessageIds.has(entry.messageId)) {
      survivors.push(entry);
      continue;
    }
    if (await alreadyHandled(entry.messageId)) continue;

    const tokens = await readSessionTokens();
    if (!tokens) {
      survivors.push({ ...entry, attempts: entry.attempts + 1 });
      continue;
    }

    inflightMessageIds.add(entry.messageId);
    try {
      let outcome = await postReply(tokens.accessToken, entry.conversationId, entry.userText);
      if (outcome === "unauthorized") {
        const refreshed = await refreshTokens(tokens);
        if (refreshed) {
          outcome = await postReply(refreshed.accessToken, entry.conversationId, entry.userText);
        }
      }

      if (outcome === "ok") {
        await markHandled(entry.messageId);
        await dismiss(entry.notificationRequestId);
      } else {
        survivors.push({ ...entry, attempts: entry.attempts + 1 });
      }
    } finally {
      inflightMessageIds.delete(entry.messageId);
    }
  }

  await writePending(survivors);
}
