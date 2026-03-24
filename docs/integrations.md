# Petto Integrations

## Neon

Petto API now supports persistent storage through `DATABASE_URL`.

Required env:

```env
DATABASE_URL=postgres://<user>:<password>@<host>/<db>?sslmode=require
```

How it works right now:

- If `DATABASE_URL` is empty, API uses in-memory state.
- If `DATABASE_URL` is set, API stores the full application state snapshot inside Postgres table `app_state`.
- This is a pragmatic first production step so the app can persist users, pets, posts, venues, events, and moderation state on Neon immediately.

Recommended Neon setup:

1. Create a Neon project and database.
2. Copy the pooled connection string from Neon.
3. Put it into `DATABASE_URL`.
4. Start the API again.

Integration point:

- API bootstrap: [`main.go`](/Users/yigitkarabulut/Desktop/Projects/Petto/apps/api/cmd/api/main.go)
- Persistent store: [`postgres.go`](/Users/yigitkarabulut/Desktop/Projects/Petto/apps/api/internal/store/postgres.go)

## Cloudflare R2

Petto mobile upload flow now tries presigned R2 uploads first, then falls back to local API uploads for development.

Required API env:

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
```

Recommended `R2_PUBLIC_BASE_URL`:

- Your custom public domain pointed at the bucket
- or a public `r2.dev` URL if you expose the bucket publicly

Flow:

1. Mobile calls `POST /v1/media/presign`
2. API creates a presigned `PUT` URL for R2
3. Mobile uploads the image directly to R2
4. API returns the final public asset URL

Integration points:

- API presign route: [`media_presign.go`](/Users/yigitkarabulut/Desktop/Projects/Petto/apps/api/internal/server/media_presign.go)
- Mobile upload client: [`api.ts`](/Users/yigitkarabulut/Desktop/Projects/Petto/apps/mobile/lib/api.ts)

## Mapbox

Current app uses `react-native-maps` so Explore already works in Expo.

If you want true Mapbox:

1. Use an Expo development build, not Expo Go.
2. Install `@rnmapbox/maps`
3. Add a public token for runtime and a secret token for SDK downloads
4. Replace the `MapView` in [`explore.tsx`](/Users/yigitkarabulut/Desktop/Projects/Petto/apps/mobile/app/(app)/(tabs)/explore.tsx) with Mapbox `MapView`, `Camera`, `PointAnnotation`, or `ShapeSource` + `SymbolLayer`
5. Keep venue coordinates from the API exactly as they already are now

Recommended mobile env:

```env
EXPO_PUBLIC_MAPBOX_TOKEN=
```

Recommended code swap location:

- [`explore.tsx`](/Users/yigitkarabulut/Desktop/Projects/Petto/apps/mobile/app/(app)/(tabs)/explore.tsx)

What stays the same when moving to Mapbox:

- Venue/event API contracts
- Check-in and RSVP endpoints
- Admin venue/event management screens

Only the map rendering layer changes.
