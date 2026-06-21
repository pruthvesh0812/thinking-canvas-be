# ThinkingCanvas API

Backend for ThinkingCanvas. Receives canvas events from the frontend, runs the
Mastra-based AI agent pipeline (Google Gemini models), and streams ghost node
suggestions back to the client over SSE via Upstash Redis pub/sub. Canvas
state persists to Supabase Postgres; durable/debounced work runs through
Inngest; agent traces and prompts are managed in Langfuse.

> This is the backend only. The frontend (`thinking-canvas-web`) is a separate repo.

## Prerequisites

- Node.js 20+ and npm (this repo uses **npm only** — no pnpm/yarn/bun)
- A [Supabase](https://supabase.com) project
- An [Upstash Redis](https://upstash.com) database (REST API mode)
- A Google AI (Gemini) API key
- A [Langfuse](https://langfuse.com) project (cloud or self-hosted) for agent tracing + prompt management
- An [Inngest](https://www.inngest.com) account (only required in production — local dev uses Inngest's local dev server)
- A [Stripe](https://stripe.com) account (only exercised by the billing webhook, not required to boot the server)

The Supabase CLI is already installed as a dev dependency, so `npx supabase`
(or plain `supabase` inside an `npm run` script) works without a separate
global install.

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment variables

```bash
cp .env.example .env
```

Then fill in each value:

| Variable | Where to get it |
|---|---|
| `GOOGLE_AI_API_KEY` | Google AI Studio → API keys |
| `SUPABASE_URL` | Supabase dashboard → Project Settings → API → **Project URL** (`https://<project-ref>.supabase.co`). This is **not** the Postgres connection string (`postgres://...`) shown under Database settings — that's a different value used by direct DB clients, not by the `supabase-js` client this app uses. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API → **service_role** secret |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Upstash console → your database → REST API section |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Developers → API keys / Webhooks. Can be left blank for local dev. |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Inngest dashboard. Can be left blank for local dev — the Inngest client falls back to dev mode against the local dev server (step 5). |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Langfuse project settings → API keys |
| `LANGFUSE_BASE_URL` | Only set when self-hosting Langfuse; omit to use Langfuse Cloud |
| `FRONTEND_URL` | URL of the running `thinking-canvas-web` frontend (CORS origin). Defaults to `*` if unset. |

## 3. Link Supabase and run migrations

```bash
npx supabase login                            # one-time, opens a browser
npx supabase link --project-ref <your-ref>    # one-time per machine — links supabase/ to your project
npm run migrate                               # applies supabase/migrations/*.sql to the linked project
```

## 4. Seed Langfuse prompts (first run only)

Pushes the local fallback agent system prompts into Langfuse as the
`production`-labeled version, so `getPrompt()` (`src/lib/prompts.ts`) serves
the live-editable version instead of the local fallback constant.

```bash
npm run seed:prompts
```

## 5. Start the service

Run in two separate terminals:

```bash
# Terminal 1 — Inngest dev server (auto-discovers the app's /api/inngest endpoint)
npm run inngest:dev

# Terminal 2 — Hono API server
npm run dev
```

Verify it's up:

```bash
curl http://localhost:3001/health
# {"status":"ok"}
```

## Available scripts

| Script | What it does |
|---|---|
| `npm run dev` | Starts the Hono server with hot reload on `:3001` |
| `npm run build` | Compiles TypeScript to `dist/` |
| `npm run start` | Runs the compiled server (`dist/src/index.js`) |
| `npm run test` | Runs the Vitest suite |
| `npm run migrate` | Pushes pending migrations in `supabase/migrations/` to the linked project |
| `npm run gen:types` | Regenerates `src/db/database.types.ts` from the Supabase schema |
| `npm run inngest:dev` | Starts the local Inngest dev server |
| `npm run seed:prompts` | Seeds/updates the 7 agent system prompts in Langfuse Prompt Management |

## Architecture & conventions

See `CLAUDE.md` for the full repo map, naming conventions, and non-negotiable
rules, and `.ai/context/` for detailed architecture docs.
