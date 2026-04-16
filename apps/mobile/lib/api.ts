import type {
  AdoptionListing,
  Badge,
  CommunityGroup,
  Conversation,
  DiaryEntry,
  DiscoveryCard,
  ExploreEvent,
  ExploreVenue,
  FeedingSchedule,
  HealthRecord,
  HomePost,
  InvitableUser,
  LostPetAlert,
  MatchPreview,
  Message,
  NotificationPreferences,
  Pet,
  PetSitter,
  Playdate,
  PlaydateInvite,
  SessionPayload,
  TaxonomyItem,
  TaxonomyKind,
  TrainingTip,
  UploadedAsset,
  UserProfile,
  VetClinic,
  VetContact,
  VenueReview,
  WeightEntry
} from "@petto/contracts";

import { useSessionStore } from "@/store/session";

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

function getApiBaseUrl() {
  if (!apiBaseUrl) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is not configured.");
  }

  return apiBaseUrl;
}

// v0.11.0 — notification preferences API.
export async function getNotificationPrefs(
  accessToken: string
): Promise<NotificationPreferences> {
  const prefs = await request<NotificationPreferences>(
    "/v1/me/notification-prefs",
    {
      headers: authHeaders(accessToken)
    }
  );
  return {
    matches: prefs?.matches ?? true,
    messages: prefs?.messages ?? true,
    playdates: prefs?.playdates ?? true,
    groups: prefs?.groups ?? true
  };
}

export async function updateNotificationPrefs(
  accessToken: string,
  prefs: NotificationPreferences
): Promise<NotificationPreferences> {
  return request<NotificationPreferences>("/v1/me/notification-prefs", {
    method: "PUT",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(prefs)
  });
}

/**
 * v0.11.0 — Build the public share landing URL for a playdate.
 * The Go API serves `GET /p/{id}` as a tiny HTML page that attempts to
 * deep-link into the app and falls back to store badges. This function
 * strips any trailing `/v1` from the configured base so the URL hits the
 * correct root-level route.
 */
export function buildPlaydateShareUrl(playdateId: string): string {
  const raw = getApiBaseUrl();
  const root = raw.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  return `${root}/p/${encodeURIComponent(playdateId)}`;
}

async function parseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return payload?.error ?? "Request failed";
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const session = useSessionStore.getState().session;
  if (!session?.tokens.refreshToken) return false;

  try {
    const response = await fetch(`${getApiBaseUrl()}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.tokens.refreshToken })
    });

    if (!response.ok) {
      useSessionStore.getState().clearSession();
      return false;
    }

    const payload = (await response.json()) as {
      data: {
        tokens: SessionPayload["tokens"];
      };
    };

    const currentSession = useSessionStore.getState().session;
    if (currentSession) {
      useSessionStore.getState().setSession({
        ...currentSession,
        tokens: payload.data.tokens
      });
    }

    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, init);

  if (response.status === 401 && init?.headers) {
    const headers = init.headers as Record<string, string>;
    const authHeader = headers["Authorization"] ?? headers["authorization"];
    if (authHeader) {
      if (!refreshPromise) {
        refreshPromise = tryRefreshToken().finally(() => {
          refreshPromise = null;
        });
      }

      const refreshed = await refreshPromise;
      if (refreshed) {
        const newSession = useSessionStore.getState().session;
        if (newSession) {
          const retryHeaders = {
            ...init.headers,
            Authorization: `Bearer ${newSession.tokens.accessToken}`
          };
          const retryResponse = await fetch(`${getApiBaseUrl()}${path}`, {
            ...init,
            headers: retryHeaders
          });
          if (!retryResponse.ok) {
            throw new Error(await parseError(retryResponse));
          }
          const retryPayload = (await retryResponse.json()) as { data: T };
          return retryPayload.data;
        }
      }
    }
  }

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = (await response.json()) as { data: T };
  return payload.data;
}

function authHeaders(accessToken: string, headers?: HeadersInit) {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(headers ?? {})
  };
}

function normalizeUser(
  user: Partial<UserProfile> | null | undefined
): UserProfile {
  return {
    id: user?.id ?? "",
    email: user?.email ?? "",
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    birthDate: user?.birthDate ?? "",
    gender: (user?.gender ?? "prefer-not-to-say") as UserProfile["gender"],
    cityId: user?.cityId ?? "",
    cityLabel: user?.cityLabel ?? "",
    avatarUrl: user?.avatarUrl,
    bio: user?.bio,
    status: (user?.status ?? "active") as UserProfile["status"],
    createdAt: user?.createdAt ?? new Date(0).toISOString()
  };
}

function normalizeSession(
  session: Partial<SessionPayload> | null | undefined
): SessionPayload {
  return {
    user: normalizeUser(session?.user),
    tokens: {
      accessToken: session?.tokens?.accessToken ?? "",
      refreshToken: session?.tokens?.refreshToken ?? "",
      expiresInSeconds:
        typeof session?.tokens?.expiresInSeconds === "number"
          ? session.tokens.expiresInSeconds
          : 0
    }
  };
}

function normalizePet(pet: Partial<Pet> | null | undefined): Pet {
  return {
    id: pet?.id ?? "",
    ownerId: pet?.ownerId ?? "",
    name: pet?.name ?? "",
    ageYears: typeof pet?.ageYears === "number" ? pet.ageYears : 0,
    gender: (pet?.gender === "male" || pet?.gender === "female") ? pet.gender : "male",
    speciesId: pet?.speciesId ?? "",
    speciesLabel: pet?.speciesLabel ?? "",
    breedId: pet?.breedId ?? "",
    breedLabel: pet?.breedLabel ?? "",
    activityLevel: ([1, 2, 3, 4, 5].includes(pet?.activityLevel as number)
      ? pet?.activityLevel
      : 3) as 1 | 2 | 3 | 4 | 5,
    hobbies: Array.isArray(pet?.hobbies)
      ? pet.hobbies.filter((item): item is string => typeof item === "string")
      : [],
    goodWith: Array.isArray(pet?.goodWith)
      ? pet.goodWith.filter((item): item is string => typeof item === "string")
      : [],
    characters: Array.isArray(pet?.characters)
      ? pet.characters.filter((item): item is string => typeof item === "string")
      : [],
    isNeutered: Boolean(pet?.isNeutered),
    bio: pet?.bio ?? "",
    photos: Array.isArray(pet?.photos)
      ? pet.photos
          .filter((photo): photo is NonNullable<Pet["photos"][number]> =>
            Boolean(photo && typeof photo === "object")
          )
          .map((photo, index) => ({
            id: photo.id ?? `photo-${index}`,
            url: photo.url ?? "",
            isPrimary: Boolean(photo.isPrimary)
          }))
      : [],
    cityLabel: pet?.cityLabel ?? "",
    isHidden: Boolean(pet?.isHidden)
  };
}

function normalizeExploreVenue(
  venue: Partial<ExploreVenue> | null | undefined
): ExploreVenue {
  return {
    id: venue?.id ?? "",
    name: venue?.name ?? "",
    category: (venue?.category ?? "other") as ExploreVenue["category"],
    description: venue?.description ?? "",
    cityLabel: venue?.cityLabel ?? "",
    address: venue?.address ?? "",
    latitude: Number.isFinite(venue?.latitude) ? Number(venue?.latitude) : 0,
    longitude: Number.isFinite(venue?.longitude) ? Number(venue?.longitude) : 0,
    imageUrl: venue?.imageUrl,
    currentCheckIns: Array.isArray(venue?.currentCheckIns)
      ? venue.currentCheckIns.map((checkIn) => ({
          userId: checkIn?.userId ?? "",
          userName: checkIn?.userName ?? "",
          avatarUrl: checkIn?.avatarUrl,
          petIds: Array.isArray(checkIn?.petIds)
            ? checkIn.petIds.filter(
                (item): item is string => typeof item === "string"
              )
            : [],
          petNames: Array.isArray(checkIn?.petNames)
            ? checkIn.petNames.filter(
                (item): item is string => typeof item === "string"
              )
            : [],
          petCount:
            typeof checkIn?.petCount === "number" ? checkIn.petCount : 0,
          checkedInAt: checkIn?.checkedInAt ?? ""
        }))
      : []
  };
}

function normalizeExploreEvent(
  event: Partial<ExploreEvent> | null | undefined
): ExploreEvent {
  return {
    id: event?.id ?? "",
    title: event?.title ?? "",
    description: event?.description ?? "",
    cityLabel: event?.cityLabel ?? "",
    venueId: event?.venueId,
    venueName: event?.venueName,
    startsAt: event?.startsAt ?? new Date(0).toISOString(),
    audience: (event?.audience ?? "everyone") as ExploreEvent["audience"],
    petFocus: (event?.petFocus ?? "all-pets") as ExploreEvent["petFocus"],
    attendeeCount:
      typeof event?.attendeeCount === "number" ? event.attendeeCount : 0,
    attendees: Array.isArray(event?.attendees)
      ? event.attendees.map((checkIn) => ({
          userId: checkIn?.userId ?? "",
          userName: checkIn?.userName ?? "",
          avatarUrl: checkIn?.avatarUrl,
          petIds: Array.isArray(checkIn?.petIds)
            ? checkIn.petIds.filter(
                (item): item is string => typeof item === "string"
              )
            : [],
          petNames: Array.isArray(checkIn?.petNames)
            ? checkIn.petNames.filter(
                (item): item is string => typeof item === "string"
              )
            : [],
          petCount:
            typeof checkIn?.petCount === "number" ? checkIn.petCount : 0,
          checkedInAt: checkIn?.checkedInAt ?? ""
        }))
      : []
  };
}

function normalizeHomePost(
  post: Partial<HomePost> | null | undefined
): HomePost {
  return {
    id: post?.id ?? "",
    author: {
      id: post?.author?.id ?? "",
      firstName: post?.author?.firstName ?? "",
      lastName: post?.author?.lastName ?? "",
      avatarUrl: post?.author?.avatarUrl,
      cityLabel: post?.author?.cityLabel ?? ""
    },
    body: post?.body ?? "",
    imageUrl: post?.imageUrl,
    taggedPets: Array.isArray(post?.taggedPets)
      ? post.taggedPets.map((pet) => normalizePet(pet))
      : [],
    venueId: post?.venueId,
    venueName: post?.venueName,
    eventId: post?.eventId,
    eventName: post?.eventName,
    likeCount: typeof post?.likeCount === "number" ? post.likeCount : 0,
    likedByMe: Boolean(post?.likedByMe),
    createdAt: post?.createdAt ?? new Date(0).toISOString()
  };
}

function normalizeMatch(
  match: Partial<MatchPreview> | null | undefined
): MatchPreview {
  return {
    id: match?.id ?? "",
    pet: normalizePet(match?.pet),
    matchedPet: normalizePet(match?.matchedPet),
    matchedOwnerName: match?.matchedOwnerName ?? "",
    matchedOwnerAvatarUrl: match?.matchedOwnerAvatarUrl,
    lastMessagePreview: match?.lastMessagePreview ?? "",
    unreadCount: typeof match?.unreadCount === "number" ? match.unreadCount : 0,
    createdAt: match?.createdAt ?? new Date(0).toISOString(),
    status: (match?.status ?? "active") as MatchPreview["status"],
    conversationId: match?.conversationId ?? ""
  };
}

export async function signIn(
  email: string,
  password: string
): Promise<SessionPayload> {
  const session = await request<SessionPayload>("/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  return normalizeSession(session);
}

export async function signUp(
  email: string,
  password: string
): Promise<SessionPayload> {
  const session = await request<SessionPayload>("/v1/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  return normalizeSession(session);
}

export async function getMe(accessToken: string): Promise<UserProfile> {
  const user = await request<UserProfile>("/v1/me", {
    headers: authHeaders(accessToken)
  });
  return normalizeUser(user);
}

export async function updateProfile(
  accessToken: string,
  profile: Partial<UserProfile>
): Promise<UserProfile> {
  const user = await request<UserProfile>("/v1/me/profile", {
    method: "PUT",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(profile)
  });
  return normalizeUser(user);
}

export async function listMyPets(accessToken: string): Promise<Pet[]> {
  const pets = await request<Pet[] | null>("/v1/me/pets", {
    headers: authHeaders(accessToken)
  });
  return Array.isArray(pets) ? pets.map((pet) => normalizePet(pet)) : [];
}

export async function getPet(accessToken: string, petId: string): Promise<Pet | null> {
  try {
    const pet = await request<Pet>(`/v1/pets/${petId}`, {
      headers: authHeaders(accessToken)
    });
    return pet ? normalizePet(pet) : null;
  } catch {
    return null;
  }
}

export async function savePet(
  accessToken: string,
  pet: Partial<Pet> & Pick<Pet, "name" | "ageYears">
): Promise<Pet> {
  const savedPet = await request<Pet>("/v1/me/pets", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(pet)
  });
  return normalizePet(savedPet);
}

export async function updatePet(
  accessToken: string,
  petId: string,
  pet: Partial<Pet> & Pick<Pet, "name" | "ageYears">
): Promise<Pet> {
  const updatedPet = await request<Pet>(`/v1/me/pets/${petId}`, {
    method: "PUT",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(pet)
  });
  return normalizePet(updatedPet);
}

export async function listTaxonomies(
  accessToken: string,
  kind: TaxonomyKind,
  lang?: string
): Promise<TaxonomyItem[]> {
  const params = lang ? `?lang=${lang}` : "";
  const items = await request<TaxonomyItem[] | null>(`/v1/taxonomies/${kind}${params}`, {
    headers: authHeaders(accessToken)
  });
  return items ?? [];
}

function normalizeDiscoveryCard(
  card: Partial<DiscoveryCard> | null | undefined
): DiscoveryCard {
  return {
    pet: normalizePet(card?.pet),
    owner: {
      firstName: card?.owner?.firstName ?? "",
      gender:
        (card?.owner?.gender as DiscoveryCard["owner"]["gender"]) ??
        "prefer-not-to-say"
    },
    distanceLabel: card?.distanceLabel ?? "",
    prompt: card?.prompt ?? ""
  };
}

export async function getDiscoveryFeed(
  accessToken: string,
  petId?: string
): Promise<DiscoveryCard[]> {
  const query = petId ? `?petId=${petId}` : "";
  const cards = await request<DiscoveryCard[] | null>(
    `/v1/discovery/feed${query}`,
    {
      headers: authHeaders(accessToken)
    }
  );
  return Array.isArray(cards)
    ? cards.map((card) => normalizeDiscoveryCard(card))
    : [];
}

export async function createSwipe(
  accessToken: string,
  actorPetId: string,
  targetPetId: string,
  direction: "like" | "pass" | "super-like"
): Promise<MatchPreview | null> {
  const response = await request<{ match: MatchPreview | null }>("/v1/swipes", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ actorPetId, targetPetId, direction })
  });
  return response.match;
}

export async function listMatches(
  accessToken: string
): Promise<MatchPreview[]> {
  const matches = await request<MatchPreview[] | null>("/v1/matches", {
    headers: authHeaders(accessToken)
  });
  return Array.isArray(matches)
    ? matches.map((match) => normalizeMatch(match))
    : [];
}

export async function listHomeFeed(accessToken: string): Promise<HomePost[]> {
  const posts = await request<HomePost[] | null>("/v1/home/feed", {
    headers: authHeaders(accessToken)
  });
  return Array.isArray(posts)
    ? posts.map((post) => normalizeHomePost(post))
    : [];
}

export async function createHomePost(
  accessToken: string,
  payload: { body: string; imageUrl?: string; taggedPetIds: string[]; venueId?: string }
): Promise<HomePost> {
  const post = await request<HomePost>("/v1/home/posts", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return normalizeHomePost(post);
}

export async function toggleHomePostLike(
  accessToken: string,
  postId: string
): Promise<HomePost> {
  const post = await request<HomePost>(`/v1/home/posts/${postId}/likes`, {
    method: "POST",
    headers: authHeaders(accessToken)
  });
  return normalizeHomePost(post);
}

export async function listExploreVenues(
  accessToken: string,
  lat?: number,
  lng?: number
): Promise<ExploreVenue[]> {
  const query = lat && lng ? `?lat=${lat}&lng=${lng}` : "";
  const venues = await request<ExploreVenue[] | null>(`/v1/explore/venues${query}`, {
    headers: authHeaders(accessToken)
  });
  return Array.isArray(venues)
    ? venues.map((venue) => normalizeExploreVenue(venue))
    : [];
}

export async function checkInVenue(
  accessToken: string,
  venueId: string,
  petIds: string[],
  latitude?: number,
  longitude?: number
): Promise<ExploreVenue> {
  const venue = await request<ExploreVenue>("/v1/explore/check-ins", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ venueId, petIds, latitude, longitude })
  });
  return normalizeExploreVenue(venue);
}

export async function listExploreEvents(
  accessToken: string
): Promise<ExploreEvent[]> {
  const events = await request<ExploreEvent[] | null>("/v1/explore/events", {
    headers: authHeaders(accessToken)
  });
  return Array.isArray(events)
    ? events.map((event) => normalizeExploreEvent(event))
    : [];
}

/**
 * v0.11.0 — unified Discover feed.
 * Returns admin events AND user-created playdates in a single request so the
 * Events tab can merge them into one date-sorted list.
 */
export async function listExploreFeed(
  accessToken: string,
  lat?: number,
  lng?: number
): Promise<{ events: ExploreEvent[]; playdates: Playdate[] }> {
  const params = new URLSearchParams();
  if (typeof lat === "number") params.set("lat", String(lat));
  if (typeof lng === "number") params.set("lng", String(lng));
  const qs = params.toString();
  const raw = await request<{
    events: ExploreEvent[] | null;
    playdates: Playdate[] | null;
  } | null>(`/v1/explore/feed${qs ? `?${qs}` : ""}`, {
    headers: authHeaders(accessToken)
  });
  return {
    events: Array.isArray(raw?.events)
      ? raw!.events.map((event) => normalizeExploreEvent(event))
      : [],
    playdates: Array.isArray(raw?.playdates) ? raw!.playdates : []
  };
}

export async function rsvpEvent(
  accessToken: string,
  eventId: string,
  petIds: string[]
): Promise<ExploreEvent> {
  const event = await request<ExploreEvent>(
    `/v1/explore/events/${eventId}/rsvps`,
    {
      method: "POST",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ petIds })
    }
  );
  return normalizeExploreEvent(event);
}

export async function listConversations(
  accessToken: string
): Promise<Conversation[]> {
  const conversations = await request<Conversation[] | null>(
    "/v1/conversations",
    {
      headers: authHeaders(accessToken)
    }
  );
  return conversations ?? [];
}

export async function createOrFindDMConversation(
  accessToken: string,
  targetUserId: string
): Promise<Conversation> {
  return request<Conversation>("/v1/conversations/dm", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ targetUserId })
  });
}

/**
 * v0.11.4 — paginated message list.
 * @param limit  max messages to return (default 50, server caps at 200)
 * @param before cursor: message ID; returns messages older than this one
 */
export async function listMessages(
  accessToken: string,
  conversationId: string,
  limit = 50,
  before?: string
): Promise<Message[]> {
  const params = new URLSearchParams({
    conversationId,
    limit: String(limit)
  });
  if (before) params.set("before", before);
  const messages = await request<Message[] | null>(
    `/v1/messages?${params.toString()}`,
    {
      headers: authHeaders(accessToken)
    }
  );
  return messages ?? [];
}

export async function sendMessage(
  accessToken: string,
  conversationId: string,
  body: string
): Promise<Message> {
  return request<Message>("/v1/messages", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ conversationId, type: "text", body })
  });
}

export type ChatMessageInput = {
  type: "text" | "image" | "pet_share";
  body?: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
};

export async function sendConversationMessage(
  accessToken: string,
  conversationId: string,
  input: ChatMessageInput
): Promise<Message> {
  return request<Message>("/v1/messages", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ conversationId, ...input })
  });
}

// ── Group chat moderation & preview helpers ──────────────────────────

export async function getGroupPreview(
  accessToken: string,
  groupId: string
): Promise<Message[]> {
  const data = await request<Message[] | null>(
    `/v1/groups/${groupId}/preview`,
    { headers: authHeaders(accessToken) }
  );
  return data ?? [];
}

export async function getGroupDetail(
  accessToken: string,
  groupId: string
): Promise<CommunityGroup | null> {
  const data = await request<CommunityGroup | null>(
    `/v1/groups/${groupId}`,
    { headers: authHeaders(accessToken) }
  );
  return data ?? null;
}

export async function listGroupPinned(
  accessToken: string,
  groupId: string
): Promise<Message[]> {
  const data = await request<Message[] | null>(
    `/v1/groups/${groupId}/pinned`,
    { headers: authHeaders(accessToken) }
  );
  return data ?? [];
}

export async function deleteGroupMessage(
  accessToken: string,
  groupId: string,
  messageId: string
): Promise<void> {
  await request(`/v1/groups/${groupId}/messages/${messageId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken)
  });
}

export async function pinGroupMessage(
  accessToken: string,
  groupId: string,
  messageId: string
): Promise<void> {
  await request(`/v1/groups/${groupId}/messages/${messageId}/pin`, {
    method: "POST",
    headers: authHeaders(accessToken)
  });
}

export async function unpinGroupMessage(
  accessToken: string,
  groupId: string,
  messageId: string
): Promise<void> {
  await request(`/v1/groups/${groupId}/messages/${messageId}/pin`, {
    method: "DELETE",
    headers: authHeaders(accessToken)
  });
}

export async function muteGroupMember(
  accessToken: string,
  groupId: string,
  userId: string,
  duration: "1h" | "24h" | "indefinite"
): Promise<void> {
  await request(`/v1/groups/${groupId}/mutes`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userId, duration })
  });
}

export async function unmuteGroupMember(
  accessToken: string,
  groupId: string,
  userId: string
): Promise<void> {
  await request(`/v1/groups/${groupId}/mutes/${userId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken)
  });
}

export async function kickGroupMember(
  accessToken: string,
  groupId: string,
  userId: string
): Promise<void> {
  await request(`/v1/groups/${groupId}/members/${userId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken)
  });
}

export async function promoteGroupAdmin(
  accessToken: string,
  groupId: string,
  userId: string
): Promise<void> {
  await request(`/v1/groups/${groupId}/admins/${userId}`, {
    method: "POST",
    headers: authHeaders(accessToken)
  });
}

export async function demoteGroupAdmin(
  accessToken: string,
  groupId: string,
  userId: string
): Promise<void> {
  await request(`/v1/groups/${groupId}/admins/${userId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken)
  });
}

export async function uploadMedia(
  accessToken: string,
  uri: string,
  fileName: string,
  // `mimeType` is accepted for call-site compatibility but the uploader
  // unconditionally re-encodes to JPEG before upload (see below), so every
  // object in R2 ends up with Content-Type: image/jpeg regardless of what
  // the caller guessed.
  _mimeType = "image/jpeg"
): Promise<UploadedAsset> {
  // HEIC fix (v0.9.1): iPhone 11+ defaults to HEIC capture, which
  // expo-image-picker returns unchanged. R2 then stored these with
  // Content-Type: image/heic, and Android clients (which can't decode HEIC)
  // saw broken images. We route every upload through expo-image-manipulator
  // with SaveFormat.JPEG first — this is the same re-encode path the crop
  // modal already uses for avatars, just lifted up so *every* caller gets it
  // for free. No-op on images already in JPEG (tiny quality/cost loss from
  // the re-encode is negligible compared to the cross-platform win).
  const ImageManipulator = await import("expo-image-manipulator");
  const converted = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG
  });
  const jpegUri = converted.uri;

  // Ensure the object key also ends in .jpg so R2's public URL and any
  // downstream extension sniffing line up with the actual bytes.
  const jpegFileName = /\.jpe?g$/i.test(fileName)
    ? fileName
    : fileName.replace(/\.[^.]+$/, "") + ".jpg";

  const presigned = await request<
    UploadedAsset & { uploadUrl: string; objectKey: string }
  >("/v1/media/presign", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fileName: jpegFileName,
      mimeType: "image/jpeg",
      folder: "mobile"
    })
  });

  const fileResponse = await fetch(jpegUri);
  const fileBlob = await fileResponse.blob();
  const uploadResponse = await fetch(presigned.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "image/jpeg"
    },
    body: fileBlob
  });

  if (!uploadResponse.ok) {
    throw new Error("Cloudflare R2 upload failed.");
  }

  return {
    id: presigned.id,
    url: presigned.url
  };
}

export async function getUserProfile(
  accessToken: string,
  userId: string
): Promise<{ user: any; pets: Pet[]; posts: any[] }> {
  const data = await request<{ user: any; pets: any[]; posts: any[] }>(`/v1/users/${userId}/profile`, {
    headers: authHeaders(accessToken)
  });
  return {
    user: data?.user ?? {},
    pets: Array.isArray(data?.pets) ? data.pets.map(normalizePet) : [],
    posts: Array.isArray(data?.posts) ? data.posts : []
  };
}

export async function submitReport(
  accessToken: string,
  reason: string,
  targetType: string,
  targetID: string,
  targetLabel: string
) {
  return request("/v1/reports", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ reason, targetType, targetID, targetLabel })
  });
}

export async function setPetVisibility(
  accessToken: string,
  petId: string,
  hidden: boolean
): Promise<void> {
  await request(`/v1/me/pets/${petId}/visibility`, {
    method: "PATCH",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ hidden })
  });
}

export async function markMessagesRead(
  accessToken: string,
  conversationId: string
): Promise<void> {
  await request("/v1/messages/read", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ conversationId })
  });
}

export async function listFavorites(
  accessToken: string
): Promise<Pet[]> {
  const pets = await request<Pet[] | null>("/v1/favorites", {
    headers: authHeaders(accessToken)
  });
  return (pets ?? []).map(normalizePet);
}

export async function addFavorite(
  accessToken: string,
  petId: string
): Promise<void> {
  await request("/v1/favorites", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ petId })
  });
}

export async function removeFavorite(
  accessToken: string,
  petId: string
): Promise<void> {
  await request(`/v1/favorites/${petId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken)
  });
}

export async function listDiary(
  accessToken: string,
  petId: string
): Promise<DiaryEntry[]> {
  const entries = await request<DiaryEntry[] | null>(
    `/v1/pets/${petId}/diary`,
    { headers: authHeaders(accessToken) }
  );
  return entries ?? [];
}

export async function createDiaryEntry(
  accessToken: string,
  petId: string,
  body: string,
  mood: string,
  imageUrl?: string
): Promise<DiaryEntry> {
  return request<DiaryEntry>(`/v1/pets/${petId}/diary`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ body, mood, imageUrl })
  });
}

// Health Records
export async function listHealthRecords(accessToken: string, petId: string): Promise<HealthRecord[]> {
  const data = await request<HealthRecord[] | null>(`/v1/pets/${petId}/health`, { headers: authHeaders(accessToken) });
  return data ?? [];
}
export async function createHealthRecord(accessToken: string, petId: string, record: Omit<HealthRecord, "id" | "petId" | "createdAt">): Promise<HealthRecord> {
  return request<HealthRecord>(`/v1/pets/${petId}/health`, { method: "POST", headers: { ...authHeaders(accessToken), "Content-Type": "application/json" }, body: JSON.stringify(record) });
}

// Weight
export async function listWeightEntries(accessToken: string, petId: string): Promise<WeightEntry[]> {
  const data = await request<WeightEntry[] | null>(`/v1/pets/${petId}/weight`, { headers: authHeaders(accessToken) });
  return data ?? [];
}
export async function createWeightEntry(accessToken: string, petId: string, weight: number, unit: string): Promise<WeightEntry> {
  return request<WeightEntry>(`/v1/pets/${petId}/weight`, { method: "POST", headers: { ...authHeaders(accessToken), "Content-Type": "application/json" }, body: JSON.stringify({ weight, unit, date: new Date().toISOString() }) });
}

// Vet Contacts
export async function listVetContacts(accessToken: string): Promise<VetContact[]> {
  const data = await request<VetContact[] | null>("/v1/vet-contacts", { headers: authHeaders(accessToken) });
  return data ?? [];
}
export async function createVetContact(accessToken: string, contact: Omit<VetContact, "id" | "userId">): Promise<VetContact> {
  return request<VetContact>("/v1/vet-contacts", { method: "POST", headers: { ...authHeaders(accessToken), "Content-Type": "application/json" }, body: JSON.stringify(contact) });
}

// Feeding
export async function listFeedingSchedules(accessToken: string, petId: string): Promise<FeedingSchedule[]> {
  const data = await request<FeedingSchedule[] | null>(`/v1/pets/${petId}/feeding`, { headers: authHeaders(accessToken) });
  return data ?? [];
}
export async function createFeedingSchedule(accessToken: string, petId: string, schedule: Omit<FeedingSchedule, "id" | "petId">): Promise<FeedingSchedule> {
  return request<FeedingSchedule>(`/v1/pets/${petId}/feeding`, { method: "POST", headers: { ...authHeaders(accessToken), "Content-Type": "application/json" }, body: JSON.stringify(schedule) });
}

// Playdates
export type ListPlaydatesParams = {
  lat?: number;
  lng?: number;
  search?: string;
  from?: string;
  to?: string;
  sort?: "distance" | "time";
};

export async function listPlaydates(
  accessToken: string,
  params: ListPlaydatesParams = {}
): Promise<Playdate[]> {
  const qs = new URLSearchParams();
  if (params.lat != null) qs.set("lat", String(params.lat));
  if (params.lng != null) qs.set("lng", String(params.lng));
  if (params.search) qs.set("search", params.search);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.sort) qs.set("sort", params.sort);
  const q = qs.toString();
  const data = await request<Playdate[] | null>(
    `/v1/playdates${q ? `?${q}` : ""}`,
    { headers: authHeaders(accessToken) }
  );
  return data ?? [];
}
export async function getPlaydate(
  accessToken: string,
  playdateId: string
): Promise<Playdate | null> {
  try {
    const data = await request<Playdate>(`/v1/playdates/${playdateId}`, {
      headers: authHeaders(accessToken)
    });
    return data ?? null;
  } catch {
    return null;
  }
}
export async function createPlaydate(accessToken: string, playdate: Omit<Playdate, "id" | "organizerId" | "attendees" | "createdAt">): Promise<Playdate> {
  return request<Playdate>("/v1/playdates", { method: "POST", headers: { ...authHeaders(accessToken), "Content-Type": "application/json" }, body: JSON.stringify(playdate) });
}

export type JoinPlaydateResult = { joined: boolean; waitlisted: boolean };

export type JoinPlaydatePayload = {
  petIds: string[];
  note?: string;
};

export async function joinPlaydate(
  accessToken: string,
  playdateId: string,
  payload?: JoinPlaydatePayload
): Promise<JoinPlaydateResult> {
  const body = payload ? JSON.stringify(payload) : undefined;
  const data = await request<JoinPlaydateResult>(
    `/v1/playdates/${playdateId}/join`,
    {
      method: "POST",
      headers: body
        ? { ...authHeaders(accessToken), "Content-Type": "application/json" }
        : authHeaders(accessToken),
      body
    }
  );
  return data ?? { joined: false, waitlisted: false };
}

export async function leavePlaydate(
  accessToken: string,
  playdateId: string,
  petIds?: string[]
): Promise<void> {
  const body = petIds && petIds.length > 0 ? JSON.stringify({ petIds }) : undefined;
  await request(`/v1/playdates/${playdateId}/leave`, {
    method: "POST",
    headers: body
      ? { ...authHeaders(accessToken), "Content-Type": "application/json" }
      : authHeaders(accessToken),
    body
  });
}

export async function updateAttendeePets(
  accessToken: string,
  playdateId: string,
  petIds: string[]
): Promise<Playdate> {
  return request<Playdate>(`/v1/playdates/${playdateId}/attendee-pets`, {
    method: "PATCH",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ petIds })
  });
}

export async function listInvitableUsers(
  accessToken: string,
  playdateId: string
): Promise<InvitableUser[]> {
  const data = await request<InvitableUser[] | null>(
    `/v1/playdates/${playdateId}/invitable-users`,
    { headers: authHeaders(accessToken) }
  );
  return data ?? [];
}

export async function createPlaydateInvites(
  accessToken: string,
  playdateId: string,
  userIds: string[]
): Promise<{ invites: PlaydateInvite[] }> {
  const data = await request<{ invites: PlaydateInvite[] }>(
    `/v1/playdates/${playdateId}/invites`,
    {
      method: "POST",
      headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ userIds })
    }
  );
  return data ?? { invites: [] };
}

export type MyPlaydatesFilter = {
  when: "upcoming" | "past";
  role?: "all" | "hosted";
};

export async function listMyPlaydates(
  accessToken: string,
  filter: MyPlaydatesFilter
): Promise<Playdate[]> {
  const qs = new URLSearchParams();
  qs.set("when", filter.when);
  if (filter.role) qs.set("role", filter.role);
  const data = await request<Playdate[] | null>(
    `/v1/me/playdates?${qs.toString()}`,
    { headers: authHeaders(accessToken) }
  );
  return data ?? [];
}

export async function listMyPlaydateInvites(
  accessToken: string
): Promise<PlaydateInvite[]> {
  const data = await request<PlaydateInvite[] | null>(
    `/v1/me/playdate-invites`,
    { headers: authHeaders(accessToken) }
  );
  return data ?? [];
}

export async function acceptPlaydateInvite(
  accessToken: string,
  inviteId: string
): Promise<{ playdateId: string }> {
  const data = await request<{ playdateId: string }>(
    `/v1/playdate-invites/${inviteId}/accept`,
    { method: "POST", headers: authHeaders(accessToken) }
  );
  return data ?? { playdateId: "" };
}

export async function declinePlaydateInvite(
  accessToken: string,
  inviteId: string
): Promise<void> {
  await request(`/v1/playdate-invites/${inviteId}/decline`, {
    method: "POST",
    headers: authHeaders(accessToken)
  });
}

// ── Playdate chat moderation (v0.14.0) ──────────────────────────────

export async function getPlaydateByConversation(
  accessToken: string,
  conversationId: string
): Promise<Playdate | null> {
  try {
    const data = await request<Playdate>(
      `/v1/conversations/${conversationId}/playdate`,
      { headers: authHeaders(accessToken) }
    );
    return data ?? null;
  } catch {
    return null;
  }
}

export async function deleteConversationMessage(
  accessToken: string,
  conversationId: string,
  messageId: string
): Promise<void> {
  await request(
    `/v1/conversations/${conversationId}/messages/${messageId}/delete`,
    { method: "POST", headers: authHeaders(accessToken) }
  );
}

export type PlaydateMuteDuration = "1h" | "24h" | "forever";

export async function mutePlaydateMember(
  accessToken: string,
  playdateId: string,
  userId: string,
  duration: PlaydateMuteDuration = "forever"
): Promise<void> {
  await request(`/v1/playdates/${playdateId}/chat-mutes`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userId, duration })
  });
}

export async function unmutePlaydateMember(
  accessToken: string,
  playdateId: string,
  userId: string
): Promise<void> {
  await request(`/v1/playdates/${playdateId}/chat-mutes/${userId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken)
  });
}

/**
 * v0.11.5 — timed mute support.
 * @param duration "1h" | "24h" | "7d" | "forever" (default)
 */
export async function muteConversation(
  accessToken: string,
  conversationId: string,
  duration: "1h" | "24h" | "7d" | "forever" = "forever"
): Promise<void> {
  await request(`/v1/conversations/${conversationId}/mute`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ duration })
  });
}

export async function unmuteConversation(
  accessToken: string,
  conversationId: string
): Promise<void> {
  await request(`/v1/conversations/${conversationId}/mute`, {
    method: "DELETE",
    headers: authHeaders(accessToken)
  });
}

// ── Host Tools panel (v0.16.0) ──────────────────────────────────────

export async function kickPlaydateAttendee(
  accessToken: string,
  playdateId: string,
  userId: string
): Promise<void> {
  await request(`/v1/playdates/${playdateId}/attendees/${userId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken)
  });
}

export async function setPlaydateLock(
  accessToken: string,
  playdateId: string,
  locked: boolean
): Promise<void> {
  await request(`/v1/playdates/${playdateId}/lock`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ locked })
  });
}

export async function transferPlaydateOwnership(
  accessToken: string,
  playdateId: string,
  newOwnerId: string
): Promise<void> {
  await request(`/v1/playdates/${playdateId}/transfer`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ newOwnerId })
  });
}

export async function pinConversationMessage(
  accessToken: string,
  conversationId: string,
  messageId: string
): Promise<void> {
  await request(
    `/v1/conversations/${conversationId}/messages/${messageId}/pin`,
    { method: "POST", headers: authHeaders(accessToken) }
  );
}

export async function unpinConversationMessage(
  accessToken: string,
  conversationId: string,
  messageId: string
): Promise<void> {
  await request(
    `/v1/conversations/${conversationId}/messages/${messageId}/unpin`,
    { method: "POST", headers: authHeaders(accessToken) }
  );
}

export async function listConversationPinned(
  accessToken: string,
  conversationId: string
): Promise<Message[]> {
  const data = await request<Message[] | null>(
    `/v1/conversations/${conversationId}/pinned`,
    { headers: authHeaders(accessToken) }
  );
  return data ?? [];
}

export async function cancelPlaydate(accessToken: string, playdateId: string): Promise<void> {
  await request(`/v1/playdates/${playdateId}/cancel`, {
    method: "POST",
    headers: authHeaders(accessToken)
  });
}

export async function updatePlaydate(
  accessToken: string,
  playdateId: string,
  patch: Partial<Playdate>
): Promise<Playdate> {
  return request<Playdate>(`/v1/playdates/${playdateId}`, {
    method: "PATCH",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
}

export async function announcePlaydate(
  accessToken: string,
  playdateId: string,
  body: string
): Promise<void> {
  await request(`/v1/playdates/${playdateId}/announce`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ body })
  });
}

// Community Groups
export async function listGroups(
  accessToken: string,
  params?: { lat?: number; lng?: number; search?: string; petType?: string }
): Promise<CommunityGroup[]> {
  const qs = new URLSearchParams();
  if (params?.lat) qs.set("lat", String(params.lat));
  if (params?.lng) qs.set("lng", String(params.lng));
  if (params?.search) qs.set("search", params.search);
  if (params?.petType && params.petType !== "all") qs.set("petType", params.petType);
  const query = qs.toString();
  const data = await request<CommunityGroup[] | null>(`/v1/groups${query ? `?${query}` : ""}`, { headers: authHeaders(accessToken) });
  return data ?? [];
}
export async function joinGroup(accessToken: string, groupId: string): Promise<void> {
  await request(`/v1/groups/${groupId}/join`, { method: "POST", headers: authHeaders(accessToken) });
}
export async function leaveGroup(
  accessToken: string,
  groupId: string
): Promise<{ left: boolean; deleted: boolean }> {
  const res = await request<{ left?: boolean; deleted?: boolean } | null>(
    `/v1/groups/${groupId}/leave`,
    { method: "POST", headers: authHeaders(accessToken) }
  );
  return { left: Boolean(res?.left), deleted: Boolean(res?.deleted) };
}
export async function joinGroupByCode(accessToken: string, code: string): Promise<CommunityGroup> {
  return request<CommunityGroup>("/v1/groups/join-by-code", {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
}
export async function createGroup(
  accessToken: string,
  payload: {
    name: string;
    description: string;
    petType: string;
    category?: string;
    cityLabel: string;
    latitude: number;
    longitude: number;
    isPrivate: boolean;
    imageUrl?: string;
    hashtags: string[];
    rules: string[];
  }
): Promise<CommunityGroup> {
  return request<CommunityGroup>("/v1/groups", {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
export async function getGroupByConversation(accessToken: string, conversationId: string): Promise<CommunityGroup | null> {
  const data = await request<CommunityGroup | null>(`/v1/groups/conversation/${conversationId}`, { headers: authHeaders(accessToken) });
  return data ?? null;
}

// Lost Pets
export async function listLostPets(accessToken: string): Promise<LostPetAlert[]> {
  const data = await request<LostPetAlert[] | null>("/v1/lost-pets", { headers: authHeaders(accessToken) });
  return data ?? [];
}
export async function createLostPetAlert(accessToken: string, alert: Omit<LostPetAlert, "id" | "userId" | "status" | "createdAt">): Promise<LostPetAlert> {
  return request<LostPetAlert>("/v1/lost-pets", { method: "POST", headers: { ...authHeaders(accessToken), "Content-Type": "application/json" }, body: JSON.stringify(alert) });
}

// Badges
export async function listBadges(accessToken: string): Promise<Badge[]> {
  const data = await request<Badge[] | null>("/v1/badges", { headers: authHeaders(accessToken) });
  return data ?? [];
}

// Training Tips
export async function listTrainingTips(accessToken: string, petType?: string): Promise<TrainingTip[]> {
  const query = petType ? `?petType=${petType}` : "";
  const data = await request<TrainingTip[] | null>(`/v1/training-tips${query}`, { headers: authHeaders(accessToken) });
  return data ?? [];
}

// Pet Sitters
export async function listPetSitters(accessToken: string, lat?: number, lng?: number): Promise<PetSitter[]> {
  const query = lat && lng ? `?lat=${lat}&lng=${lng}` : "";
  const data = await request<PetSitter[] | null>(`/v1/pet-sitters${query}`, { headers: authHeaders(accessToken) });
  return data ?? [];
}
export async function createPetSitter(accessToken: string, sitter: Omit<PetSitter, "id" | "userId" | "rating" | "reviewCount">): Promise<PetSitter> {
  return request<PetSitter>("/v1/pet-sitters", { method: "POST", headers: { ...authHeaders(accessToken), "Content-Type": "application/json" }, body: JSON.stringify(sitter) });
}

// Training Tip Detail
export async function getTrainingTip(accessToken: string, tipId: string): Promise<TrainingTip> {
  return request<TrainingTip>(`/v1/training-tips/${tipId}`, { headers: authHeaders(accessToken) });
}
export async function bookmarkTip(accessToken: string, tipId: string): Promise<void> {
  await request(`/v1/training-tips/${tipId}/bookmark`, { method: "POST", headers: authHeaders(accessToken) });
}
export async function unbookmarkTip(accessToken: string, tipId: string): Promise<void> {
  await request(`/v1/training-tips/${tipId}/bookmark`, { method: "DELETE", headers: authHeaders(accessToken) });
}
export async function completeTip(accessToken: string, tipId: string): Promise<void> {
  await request(`/v1/training-tips/${tipId}/complete`, { method: "POST", headers: authHeaders(accessToken) });
}

// Vet Clinics (location-based)
export async function listVetClinics(accessToken: string, lat: number, lng: number): Promise<VetClinic[]> {
  const data = await request<VetClinic[] | null>(`/v1/vet-clinics?lat=${lat}&lng=${lng}`, { headers: authHeaders(accessToken) });
  return data ?? [];
}

// Venue Reviews
export async function listVenueReviews(accessToken: string, venueId: string): Promise<VenueReview[]> {
  const data = await request<VenueReview[] | null>(`/v1/venues/${venueId}/reviews`, { headers: authHeaders(accessToken) });
  return data ?? [];
}
export async function createVenueReview(accessToken: string, venueId: string, rating: number, comment: string): Promise<VenueReview> {
  return request<VenueReview>(`/v1/venues/${venueId}/reviews`, { method: "POST", headers: { ...authHeaders(accessToken), "Content-Type": "application/json" }, body: JSON.stringify({ rating, comment }) });
}

export async function listAdoptions(accessToken: string): Promise<AdoptionListing[]> {
  const data = await request<AdoptionListing[] | null>("/v1/adoptions", { headers: authHeaders(accessToken) });
  return data ?? [];
}

export async function createAdoption(
  accessToken: string,
  listing: Omit<AdoptionListing, "id" | "status" | "userId" | "userName" | "createdAt">
): Promise<AdoptionListing> {
  return request<AdoptionListing>("/v1/adoptions", {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(listing)
  });
}

export async function updateAdoptionStatus(
  accessToken: string,
  listingId: string,
  status: string
): Promise<void> {
  await request(`/v1/adoptions/${listingId}`, {
    method: "PATCH",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
}

export async function deleteAdoption(
  accessToken: string,
  listingId: string
): Promise<void> {
  await request(`/v1/adoptions/${listingId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken)
  });
}
