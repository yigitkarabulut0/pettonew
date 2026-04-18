import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";

import { performInlineReply, REPLY_ACTION_ID } from "./notification-actions";

// ─────────────────────────────────────────────────────────────────────────────
// Background notification task — runs when the OS launches (or wakes) the JS
// runtime to handle a notification action delivered while the app is NOT in
// the foreground.
//
// `TaskManager.defineTask` MUST be called at module scope — before React
// mounts — so the OS can locate the task when it fires. The only safe way
// to achieve that is to import this file for its side-effect from the very
// top of `app/_layout.tsx` (outside of any component / hook).
//
// When the user is in the app, the foreground listener in `_layout.tsx`
// receives the action directly; this task never runs. Both paths funnel
// through the same `performInlineReply(...)` in `notification-actions.ts`
// to keep the send logic in exactly one place.
// ─────────────────────────────────────────────────────────────────────────────

export const BACKGROUND_NOTIFICATION_TASK = "PETTO_BACKGROUND_NOTIFICATION_TASK";

// The task body. Signature matches the type exposed by expo-notifications'
// background task handler — we unpack flexibly because the shape has varied
// slightly across SDK minor versions.
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn("[inline-reply] background task error:", error);
    return;
  }

  // Accept both shapes:
  //   { actionIdentifier, userText, notification: { request: {...} } }  (current)
  //   { notification: { response: { ... } } }                            (legacy guard)
  const d = data as any;
  const response = d?.actionIdentifier ? d : d?.notification?.response;
  if (!response || response.actionIdentifier !== REPLY_ACTION_ID) {
    return;
  }

  const req = response.notification?.request ?? d?.notification?.request;
  if (!req) return;

  const content = req.content ?? {};
  const pushData = (content.data ?? {}) as Record<string, string>;
  const userText: string = ((response as any).userText ?? "").toString().trim();

  if (!userText || !pushData.conversationId || !pushData.messageId) {
    return;
  }

  await performInlineReply({
    conversationId: pushData.conversationId,
    messageId: pushData.messageId,
    userText,
    notificationRequestId: req.identifier
  });
});

// Registering the task with expo-notifications wires it up to fire on
// notification responses. Safe to call multiple times — duplicate
// registration throws, which we swallow.
export async function registerBackgroundNotificationTask() {
  try {
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
  } catch (err) {
    // already registered, or TaskManager unavailable in Expo Go.
  }
}
