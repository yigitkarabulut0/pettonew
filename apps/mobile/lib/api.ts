import type {
  AdoptablePetFilters,
  AdoptionApplication,
  AdoptionApplicationInput,
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
  BreedCareLookup,
  DailyMealSummary,
  FirstAidTopic,
  FoodItem,
  MealLog,
  Pet,
  PetDocument,
  PetHealthProfile,
  PetMedication,
  PetSitter,
  Playdate,
  PlaydateInvite,
  SessionPayload,
  SymptomLog,
  WeeklyHealthSummary,
  TaxonomyItem,
  TaxonomyKind,
  TrainingTip,
  UploadedAsset,
  Shelter,
  ShelterPet,
  UserProfile,
  VenueCheckIn,
  VenueDetail,
  VenuePhotoFeedItem,
  VenueStats,
  ReviewEligibility,
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
export function buildPlaydateShareUrl(
  playdateId: string,
  shareToken?: string | null
): string {
  const raw = getApiBaseUrl();
  const root = raw.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  const base = `${root}/p/${encodeURIComponent(playdateId)}`;
  // When the host shares a *private* playdate, appending the token to the
  // URL lets the recipient — who has no playdate_invites row yet — claim a
  // pending invite on first open. Public playdates pass the token too so
  // the backend can drop it into the deep link without extra logic.
  if (shareToken) {
    return `${base}?t=${encodeURIComponent(shareToken)}`;
  }
  return base;
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
    lastMessageAt: match?.lastMessageAt,
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

export type UploadMediaOptions = {
  onProgress?: (ratio: number) => void;
  folder?: string;
};

export async function uploadMedia(
  accessToken: string,
  uri: string,
  fileName: string,
  // `mimeType` is accepted for call-site compatibility — the uploader always
  // re-encodes to WebP (with JPEG fallback on legacy runtimes), so the final
  // Content-Type is decided by encodeToWebP, not by the caller's guess.
  _mimeType?: string,
  options: UploadMediaOptions = {}
): Promise<UploadedAsset> {
  const { encodeToWebP, putWithProgressAndRetry } = await import("./media");
  const encoded = await encodeToWebP(uri);

  const base = fileName.replace(/\.[^.]+$/, "") || "upload";
  const canonicalName = `${base}${encoded.extension}`;

  const presigned = await request<
    UploadedAsset & { uploadUrl: string; objectKey: string }
  >("/v1/media/presign", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fileName: canonicalName,
      mimeType: encoded.mimeType,
      folder: options.folder ?? "mobile"
    })
  });

  const fileResponse = await fetch(encoded.uri);
  const fileBlob = await fileResponse.blob();

  await putWithProgressAndRetry({
    uploadUrl: presigned.uploadUrl,
    publicUrl: presigned.url,
    body: fileBlob,
    contentType: encoded.mimeType,
    onProgress: options.onProgress
  });

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

// ── Adoption favorites ─────────────────────────────────────────────
// Scoped to shelter_pets (adoptable listings). Separate from the
// social-match favorites above because the target type differs.

export async function listAdoptionFavorites(
  accessToken: string
): Promise<ShelterPet[]> {
  const pets = await request<ShelterPet[] | null>("/v1/adoption/favorites", {
    headers: authHeaders(accessToken)
  });
  return pets ?? [];
}

export async function addAdoptionFavorite(
  accessToken: string,
  petId: string
): Promise<void> {
  await request("/v1/adoption/favorites", {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ petId })
  });
}

export async function removeAdoptionFavorite(
  accessToken: string,
  petId: string
): Promise<void> {
  await request(`/v1/adoption/favorites/${petId}`, {
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
export async function deleteHealthRecord(accessToken: string, petId: string, recordId: string): Promise<void> {
  await request(`/v1/pets/${petId}/health/${recordId}`, { method: "DELETE", headers: authHeaders(accessToken) });
}

// Health Profile (allergies + dietary restrictions + emergency notes).
// Backend returns a placeholder profile (empty arrays) for pets with no row,
// so callers don't need to handle 404.
export async function getHealthProfile(accessToken: string, petId: string): Promise<PetHealthProfile> {
  return request<PetHealthProfile>(`/v1/pets/${petId}/health-profile`, { headers: authHeaders(accessToken) });
}
export async function upsertHealthProfile(
  accessToken: string,
  petId: string,
  profile: Pick<PetHealthProfile, "allergies" | "dietaryRestrictions" | "emergencyNotes">
): Promise<PetHealthProfile> {
  return request<PetHealthProfile>(`/v1/pets/${petId}/health-profile`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(profile)
  });
}

// Symptom Logs
export async function listSymptomLogs(accessToken: string, petId: string): Promise<SymptomLog[]> {
  const data = await request<SymptomLog[] | null>(`/v1/pets/${petId}/symptoms`, { headers: authHeaders(accessToken) });
  return data ?? [];
}
export async function createSymptomLog(
  accessToken: string,
  petId: string,
  log: Omit<SymptomLog, "id" | "petId" | "createdAt">
): Promise<SymptomLog> {
  return request<SymptomLog>(`/v1/pets/${petId}/symptoms`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(log)
  });
}
export async function deleteSymptomLog(accessToken: string, petId: string, logId: string): Promise<void> {
  await request(`/v1/pets/${petId}/symptoms/${logId}`, { method: "DELETE", headers: authHeaders(accessToken) });
}

// Medications
export type MedicationDraft = {
  name: string;
  dosage: string;
  notes?: string;
  timeOfDay: string;        // "HH:MM"
  daysOfWeek: number[];     // 0=Sun..6=Sat; empty = every day
  timezone: string;         // IANA
  startDate: string;        // "YYYY-MM-DD"
  endDate?: string;
};

export async function listMedications(accessToken: string, petId: string): Promise<PetMedication[]> {
  const data = await request<PetMedication[] | null>(`/v1/pets/${petId}/medications`, { headers: authHeaders(accessToken) });
  return data ?? [];
}
export async function createMedication(
  accessToken: string,
  petId: string,
  med: MedicationDraft
): Promise<PetMedication> {
  return request<PetMedication>(`/v1/pets/${petId}/medications`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(med)
  });
}
export async function updateMedication(
  accessToken: string,
  petId: string,
  medId: string,
  patch: Partial<MedicationDraft> & { active?: boolean }
): Promise<PetMedication> {
  return request<PetMedication>(`/v1/pets/${petId}/medications/${medId}`, {
    method: "PATCH",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
}
export async function deleteMedication(accessToken: string, petId: string, medId: string): Promise<void> {
  await request(`/v1/pets/${petId}/medications/${medId}`, { method: "DELETE", headers: authHeaders(accessToken) });
}
export async function markMedicationGiven(
  accessToken: string,
  petId: string,
  medId: string
): Promise<PetMedication> {
  return request<PetMedication>(`/v1/pets/${petId}/medications/${medId}/mark-given`, {
    method: "POST",
    headers: authHeaders(accessToken)
  });
}

// Weekly health summary
export async function getWeeklyHealthSummary(accessToken: string): Promise<WeeklyHealthSummary> {
  return request<WeeklyHealthSummary>("/v1/me/weekly-summary", { headers: authHeaders(accessToken) });
}

// Pet documents
export async function listPetDocuments(accessToken: string, petId: string): Promise<PetDocument[]> {
  const data = await request<PetDocument[] | null>(`/v1/pets/${petId}/documents`, { headers: authHeaders(accessToken) });
  return data ?? [];
}
export async function createPetDocument(
  accessToken: string,
  petId: string,
  doc: {
    kind: PetDocument["kind"];
    title: string;
    fileUrl: string;
    fileKind?: PetDocument["fileKind"];
    expiresAt?: string;
    notes?: string;
  }
): Promise<PetDocument> {
  return request<PetDocument>(`/v1/pets/${petId}/documents`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(doc)
  });
}
export async function deletePetDocument(accessToken: string, petId: string, docId: string): Promise<void> {
  await request(`/v1/pets/${petId}/documents/${docId}`, { method: "DELETE", headers: authHeaders(accessToken) });
}

// Food items + Meal log (calorie counter)
export async function listFoodItems(
  accessToken: string,
  params: { search?: string; species?: string } = {}
): Promise<FoodItem[]> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.species) qs.set("species", params.species);
  const q = qs.toString();
  const data = await request<FoodItem[] | null>(`/v1/food-items${q ? `?${q}` : ""}`, {
    headers: authHeaders(accessToken)
  });
  return data ?? [];
}
export async function createFoodItem(
  accessToken: string,
  item: { name: string; brand?: string; kind?: FoodItem["kind"]; speciesLabel?: string; kcalPer100g: number }
): Promise<FoodItem> {
  return request<FoodItem>("/v1/food-items", {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(item)
  });
}

export async function listMealLogs(
  accessToken: string,
  petId: string,
  params: { from?: string; to?: string } = {}
): Promise<MealLog[]> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const q = qs.toString();
  const data = await request<MealLog[] | null>(
    `/v1/pets/${petId}/meals${q ? `?${q}` : ""}`,
    { headers: authHeaders(accessToken) }
  );
  return data ?? [];
}
export async function createMealLog(
  accessToken: string,
  petId: string,
  meal: {
    foodItemId?: string;
    customName?: string;
    grams: number;
    kcal?: number;
    notes?: string;
    eatenAt?: string;
  }
): Promise<MealLog> {
  return request<MealLog>(`/v1/pets/${petId}/meals`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(meal)
  });
}
export async function deleteMealLog(accessToken: string, petId: string, mealId: string): Promise<void> {
  await request(`/v1/pets/${petId}/meals/${mealId}`, { method: "DELETE", headers: authHeaders(accessToken) });
}
export async function getDailyMealSummary(
  accessToken: string,
  petId: string,
  date?: string
): Promise<DailyMealSummary> {
  const qs = date ? `?date=${date}` : "";
  return request<DailyMealSummary>(`/v1/pets/${petId}/meals/summary${qs}`, {
    headers: authHeaders(accessToken)
  });
}

// Breed care + First-aid (Care v0.14.3)
export async function getBreedCareForPet(
  accessToken: string,
  petId: string
): Promise<BreedCareLookup> {
  return request<BreedCareLookup>(`/v1/pets/${petId}/breed-care`, {
    headers: authHeaders(accessToken)
  });
}

export async function listFirstAidTopics(accessToken: string): Promise<FirstAidTopic[]> {
  const data = await request<FirstAidTopic[] | null>("/v1/first-aid", {
    headers: authHeaders(accessToken)
  });
  return data ?? [];
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
): Promise<Playdate> {
  // v0.13.5: no longer swallows errors. A 404 from the private-visibility gate
  // needs to surface to the UI so the detail screen can show a "you don't
  // have access" state instead of a blank skeleton — see [id].tsx error view.
  return request<Playdate>(`/v1/playdates/${playdateId}`, {
    headers: authHeaders(accessToken)
  });
}

/**
 * Redeem a host-generated share token (`?t=…` in the WhatsApp/SMS URL) so
 * the caller can load a private playdate. The backend upserts a pending
 * playdate_invites row and returns 200. Idempotent: re-claiming a token the
 * user already redeemed is a no-op.
 */
export async function claimPlaydateShare(
  accessToken: string,
  playdateId: string,
  shareToken: string
): Promise<void> {
  await request(
    `/v1/playdates/${encodeURIComponent(playdateId)}/claim-share/${encodeURIComponent(shareToken)}`,
    {
      method: "POST",
      headers: authHeaders(accessToken)
    }
  );
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

// Venue detail + derived feeds (v0.12)
export async function getVenueDetail(
  accessToken: string,
  venueId: string,
  lat?: number,
  lng?: number
): Promise<VenueDetail> {
  const params = new URLSearchParams();
  if (typeof lat === "number") params.set("lat", String(lat));
  if (typeof lng === "number") params.set("lng", String(lng));
  const qs = params.toString();
  const path = qs ? `/v1/venues/${venueId}?${qs}` : `/v1/venues/${venueId}`;
  return request<VenueDetail>(path, { headers: authHeaders(accessToken) });
}

export async function listVenuePosts(
  accessToken: string,
  venueId: string,
  limit = 50
): Promise<VenuePhotoFeedItem[]> {
  const data = await request<VenuePhotoFeedItem[] | null>(
    `/v1/venues/${venueId}/posts?limit=${limit}`,
    { headers: authHeaders(accessToken) }
  );
  return data ?? [];
}

export async function listVenueCheckIns(
  accessToken: string,
  venueId: string,
  mode: "active" | "history" | "all" = "active",
  limit = 50
): Promise<VenueCheckIn[]> {
  const data = await request<VenueCheckIn[] | null>(
    `/v1/venues/${venueId}/check-ins?mode=${mode}&limit=${limit}`,
    { headers: authHeaders(accessToken) }
  );
  return data ?? [];
}

export async function getVenueReviewSummary(
  accessToken: string,
  venueId: string
): Promise<VenueStats> {
  return request<VenueStats>(`/v1/venues/${venueId}/reviews/summary`, {
    headers: authHeaders(accessToken)
  });
}

export async function getReviewEligibility(
  accessToken: string,
  venueId: string
): Promise<ReviewEligibility> {
  return request<ReviewEligibility>(`/v1/venues/${venueId}/reviews/eligibility`, {
    headers: authHeaders(accessToken)
  });
}

// ── Shelters & adoption (v0.13) ───────────────────────────────────
// User-side browsing + application submission. Shelter account actions
// live in apps/shelter-mobile (separate app) and apps/shelter-web.

export async function listShelters(accessToken: string): Promise<Shelter[]> {
  const data = await request<Shelter[] | null>("/v1/shelters", {
    headers: authHeaders(accessToken)
  });
  return data ?? [];
}

// ShelterProfile is the enriched response for /v1/shelters/:id. The
// server now bundles recently-adopted + jurisdiction disclosure so
// the mobile detail screen renders in one request.
export type ShelterProfileResponse = {
  shelter: Shelter;
  pets: ShelterPet[];
  recentlyAdopted?: ShelterPet[] | null;
  disclosure?: {
    country: string;
    title: string;
    body: string;
    linkUrl?: string;
  } | null;
};

export async function getShelter(
  accessToken: string,
  shelterId: string,
  location?: { latitude: number; longitude: number }
): Promise<ShelterProfileResponse> {
  const qs = location
    ? `?lat=${location.latitude}&lng=${location.longitude}`
    : "";
  return request<ShelterProfileResponse>(
    `/v1/shelters/${shelterId}${qs}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function listAdoptablePets(
  accessToken: string,
  filters: AdoptablePetFilters & {
    minAgeMonths?: number;
    specialNeedsOnly?: boolean;
    maxDistanceKm?: number;
  } = {},
  location?: { latitude: number; longitude: number }
): Promise<ShelterPet[]> {
  const params = new URLSearchParams();
  if (filters.species) params.set("species", filters.species);
  if (filters.sex) params.set("sex", filters.sex);
  if (filters.size) params.set("size", filters.size);
  if (filters.city) params.set("city", filters.city);
  if (filters.minAgeMonths) params.set("minAgeMonths", String(filters.minAgeMonths));
  if (filters.maxAgeMonths) params.set("maxAgeMonths", String(filters.maxAgeMonths));
  if (filters.specialNeedsOnly) params.set("specialNeeds", "1");
  if (filters.maxDistanceKm && filters.maxDistanceKm > 0) {
    params.set("maxDistanceKm", String(filters.maxDistanceKm));
  }
  if (filters.search) params.set("search", filters.search);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  if (location) {
    params.set("lat", String(location.latitude));
    params.set("lng", String(location.longitude));
  }
  const qs = params.toString();
  const path = qs ? `/v1/adoption-pets?${qs}` : "/v1/adoption-pets";
  const data = await request<ShelterPet[] | null>(path, {
    headers: authHeaders(accessToken)
  });
  return data ?? [];
}

// Featured shelters rail (v0.24). Anonymous public endpoint; no bearer
// token needed, but the mobile app always has one so sending it is fine.
export async function listFeaturedShelters(): Promise<Shelter[]> {
  const data = await request<Shelter[] | null>("/v1/public/shelters/featured");
  return data ?? [];
}

// AdoptablePetDetail is the enriched response for /v1/adoption-pets/:id.
// Server strips the microchip ID and returns only the `microchipPresent`
// flag; shelter mini-card + jurisdiction disclosure are bundled.
export type AdoptablePetDetail = {
  pet: ShelterPet;
  microchipPresent: boolean;
  shelter: Shelter;
  disclosure?: {
    country: string;
    title: string;
    body: string;
    linkUrl?: string;
  } | null;
};

export async function getAdoptablePet(
  accessToken: string,
  petId: string,
  location?: { latitude: number; longitude: number }
): Promise<AdoptablePetDetail> {
  const qs = location
    ? `?lat=${location.latitude}&lng=${location.longitude}`
    : "";
  return request<AdoptablePetDetail>(`/v1/adoption-pets/${petId}${qs}`, {
    headers: authHeaders(accessToken)
  });
}

// Fire-and-forget view counter for adopter analytics. Errors are
// swallowed — a failed view-track shouldn't block navigation.
export async function trackPetView(petId: string): Promise<void> {
  try {
    await request(`/v1/public/pets/${petId}/view`, { method: "POST" });
  } catch {
    /* best-effort */
  }
}

export async function createAdoptionApplication(
  accessToken: string,
  input: AdoptionApplicationInput
): Promise<AdoptionApplication> {
  return request<AdoptionApplication>("/v1/adoption-applications", {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function listMyAdoptionApplications(
  accessToken: string
): Promise<AdoptionApplication[]> {
  const data = await request<AdoptionApplication[] | null>(
    "/v1/me/adoption-applications",
    { headers: authHeaders(accessToken) }
  );
  return data ?? [];
}

export async function withdrawAdoptionApplication(
  accessToken: string,
  appId: string
): Promise<void> {
  await request(`/v1/adoption-applications/${appId}/withdraw`, {
    method: "POST",
    headers: authHeaders(accessToken)
  });
}
