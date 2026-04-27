import type { Playdate } from "@petto/contracts";

/**
 * The full vocabulary of "where does the caller stand on this playdate"
 * states. Every UI surface (list card, detail CTA, my-playdates card) should
 * derive from this instead of recomputing booleans inline — otherwise badges
 * and CTAs drift and the user is left guessing whether their tap will work.
 *
 * Priority order, highest first:
 *   cancelled → ended → host → joined → waitlisted → invited → full → open
 *
 * "full" is only set for users who haven't joined yet AND aren't waitlisted
 * AND aren't invited, so the detail page can show "Join waitlist" without
 * conflicting with any of the more specific states above.
 */
export type PlaydateState =
  | "cancelled"
  | "ended"
  | "host"
  | "joined"
  | "waitlisted"
  | "invited"
  | "full"
  | "open";

export type PlaydateStateTone =
  | "primary"
  | "secondary"
  | "accent"
  | "danger"
  | "neutral";

export type PlaydateStateInfo = {
  state: PlaydateState;
  /** Pill label for discovery/my-playdates cards. null means "show nothing". */
  badgeLabel: string | null;
  badgeTone: PlaydateStateTone | null;
  /** Primary sticky-CTA label for the detail page. */
  primaryCtaLabel: string;
  /** Is the caller allowed to open the join flow from this state? */
  canJoin: boolean;
  /** Is the caller allowed to leave right now? */
  canLeave: boolean;
  /** Is the chat thread reachable? (requires membership + a conversation id) */
  canChat: boolean;
  /** Only organizers get cancel/edit/announce affordances. */
  canCancel: boolean;
  /** Computed pet-level slot usage with the legacy user-level fallback. */
  slotsUsed: number;
  /** Convenience role flag — `isHost` ≡ state === "host". */
  isHost: boolean;
  /** "All seats taken" — independent of the user's own state. */
  isFull: boolean;
  /** Client-derived "this event has already happened". */
  isEnded: boolean;
  /** Server-derived "host cancelled". */
  isCancelled: boolean;
};

/**
 * Compute the playdate state for the current viewer.
 *
 * Accepts `now` so tests and UI tickers can pass a fixed moment instead of
 * racing wall-clock time. Production callers omit it.
 */
export function computePlaydateState(
  playdate: Playdate,
  now: Date = new Date()
): PlaydateStateInfo {
  const slotsUsed = playdate.slotsUsed ?? playdate.attendees?.length ?? 0;
  const maxPets = playdate.maxPets ?? 0;
  const isFull = maxPets > 0 && slotsUsed >= maxPets;
  const isCancelled = playdate.status === "cancelled";
  const when = playdate.date ? new Date(playdate.date) : null;
  const isEnded = Boolean(
    when && !isNaN(when.getTime()) && when.getTime() < now.getTime()
  );

  const isHost = Boolean(playdate.isOrganizer);
  const isAttending = Boolean(playdate.isAttending);
  const isWaitlisted = Boolean(playdate.isWaitlisted);
  const hasPendingInvite = playdate.myInviteStatus === "pending";
  const hasConversation = Boolean(playdate.conversationId);

  // Priority order matters — cancelled/ended must win over host/joined so the
  // sticky CTA on the detail page doesn't offer "View chat" on a dead event.
  let state: PlaydateState;
  if (isCancelled) state = "cancelled";
  else if (isEnded) state = "ended";
  else if (isHost) state = "host";
  else if (isAttending) state = "joined";
  else if (isWaitlisted) state = "waitlisted";
  else if (hasPendingInvite) state = "invited";
  else if (isFull) state = "full";
  else state = "open";

  let badgeLabel: string | null = null;
  let badgeTone: PlaydateStateTone | null = null;
  let primaryCtaLabel = "playdates.detail.joinNow";
  switch (state) {
    case "cancelled":
      badgeLabel = "playdates.detail.cancelled";
      badgeTone = "danger";
      primaryCtaLabel = "playdates.detail.cancelled";
      break;
    case "ended":
      badgeLabel = "playdates.detail.ended";
      badgeTone = "neutral";
      primaryCtaLabel = "playdates.detail.ended";
      break;
    case "host":
      badgeLabel = "playdates.myPlaydates.roleHost";
      badgeTone = "primary";
      primaryCtaLabel = "playdates.detail.edit";
      break;
    case "joined":
      badgeLabel = "playdates.myPlaydates.roleJoined";
      badgeTone = "secondary";
      primaryCtaLabel = "playdates.detail.viewChat";
      break;
    case "waitlisted":
      badgeLabel = "playdates.detail.onWaitlist";
      badgeTone = "accent";
      primaryCtaLabel = "playdates.detail.onWaitlist";
      break;
    case "invited":
      badgeLabel = "playdates.state.invited";
      badgeTone = "accent";
      primaryCtaLabel = "playdates.detail.acceptInvite";
      break;
    case "full":
      badgeLabel = "playdates.detail.full";
      badgeTone = "neutral";
      primaryCtaLabel = "playdates.detail.joinWaitlist";
      break;
    case "open":
      badgeLabel = null;
      badgeTone = null;
      primaryCtaLabel = "playdates.detail.joinNow";
      break;
  }

  return {
    state,
    badgeLabel,
    badgeTone,
    primaryCtaLabel,
    canJoin:
      !isCancelled &&
      !isEnded &&
      !isHost &&
      !isAttending,
    canLeave: !isCancelled && !isEnded && (isAttending || isWaitlisted) && !isHost,
    canChat: hasConversation && (isHost || isAttending || isWaitlisted) && !isCancelled,
    canCancel: isHost && !isCancelled && !isEnded,
    slotsUsed,
    isHost,
    isFull,
    isEnded,
    isCancelled
  };
}
