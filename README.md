# Petto

Petto is a monorepo for a Tinder-style pet matching platform:

- `apps/mobile`: Expo + React Native client for pet parents
- `apps/admin`: Next.js + shadcn-style admin dashboard
- `apps/api`: Go API with WebSocket chat, moderation, and Neon/Postgres-ready schema
- `packages/contracts`: shared domain types and DTOs
- `packages/design-tokens`: shared brand tokens for mobile and web surfaces

## Stack

- Mobile: Expo Router, TanStack Query, Zustand, React Hook Form, Zod, Reanimated, FlashList, expo-image
- Admin: Next.js App Router, Tailwind, class-variance-authority, React Hook Form, TanStack Table, Recharts
- API: Go 1.24, chi, pgx, JWT auth, WebSocket chat, SQL migrations
- Database: PostgreSQL on Neon
- Media: Cloudflare R2-ready uploads with a local API-backed upload path for development

## Commands

```bash
pnpm install
pnpm dev
```

Run the API in a separate terminal after copying `.env.example` to `.env`:

```bash
cd apps/api
go mod tidy
go run ./cmd/api
```

## Notes

- The mobile and admin apps now require a running API and use live backend responses only.
- Local development uploads are stored by the API under `UPLOADS_DIR` and served from `/uploads/*`.
- SQL migrations and OpenAPI are included in `apps/api`.
- Expo SDK 54 was chosen to stay aligned with current Expo Go compatibility guidance during the SDK 55 transition period in March 2026. Source: [Expo create project docs](https://docs.expo.dev/get-started/create-a-project/) and [Expo Router docs](https://docs.expo.dev/router/introduction/).
