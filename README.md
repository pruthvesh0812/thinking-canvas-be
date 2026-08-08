# ThinkingCanvas API

Backend for ThinkingCanvas. Receives canvas events from the frontend, runs the
Mastra-based AI agent pipeline (Google Gemini models), and streams ghost node
suggestions back to the client over SSE via Upstash Redis pub/sub. Canvas
state persists to Supabase Postgres; durable/debounced work runs through
Inngest; agent traces and prompts are managed in Langfuse.

> This is the backend only. The frontend (`thinking-canvas-web`) is a separate repo.

## Prerequisites

- Node.js 20+ and npm (this repo uses **npm only** — no pnpm/yarn/bun)
- Docker (the Supabase CLI runs Postgres + the API stack locally in containers)
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
| `SUPABASE_URL` | Output of `supabase status` (step 3) → **API URL** (`http://127.0.0.1:54321` by default for local dev). This is **not** the Postgres connection string (`postgres://...`) — that's a different value used by direct DB clients, not by the `supabase-js` client this app uses. |
| `SUPABASE_SERVICE_ROLE_KEY` | Output of `supabase status` (step 3) → **service_role key** |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Upstash console → your database → REST API section |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Developers → API keys / Webhooks. Can be left blank for local dev. |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Inngest dashboard. Can be left blank for local dev — the Inngest client falls back to dev mode against the local dev server (step 5). |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Langfuse project settings → API keys |
| `LANGFUSE_BASE_URL` | Only set when self-hosting Langfuse; omit to use Langfuse Cloud |
| `FRONTEND_URL` | URL of the running `thinking-canvas-web` frontend (CORS origin). Defaults to `http://localhost:3000` if unset (`src/index.ts`). |

## 3. Start local Supabase and run migrations

Local development runs against a Supabase stack in Docker.

```bash
npx supabase start    # boots local Postgres + API stack in Docker, applies
                       # supabase/migrations/*.sql on first run
npx supabase status    # prints the local API URL + service_role key —
                       # copy these into SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
```

After the first `supabase start`, push any new migrations with:

```bash
npm run migrate:local      # supabase db push --local
npm run gen:types:local    # regenerates src/db/database.types.ts from the local schema
```

For a linked remote project (staging/production), link it once and use the
`:prod` scripts instead:

```bash
npx supabase login
npx supabase link --project-ref <ref>   # one-time per machine

npm run migrate:prod       # supabase db push --linked
npm run gen:types:prod     # regenerates src/db/database.types.ts from the linked project's schema
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

> **Note:** this repo's `.npmrc` sets `ignore-scripts=true` (a supply-chain
> guard). `inngest-cli` needs its `postinstall` script to download the CLI
> binary, so `npm run inngest:dev` rebuilds just that one pinned
> devDependency with scripts re-enabled before launching it — no global
> opt-out of `ignore-scripts` needed. If you ever see
> `Error: Inngest CLI binary not found`, run
> `npm rebuild --ignore-scripts=false inngest-cli` and try again.

## Available scripts

| Script | What it does |
|---|---|
| `npm run dev` | Starts the Hono server with hot reload on `:3001` |
| `npm run build` | Compiles TypeScript to `dist/` |
| `npm run start` | Runs the compiled server (`dist/src/index.js`) |
| `npm run test` | Runs the Vitest suite |
| `npm run migrate:local` | Pushes pending migrations in `supabase/migrations/` to the local Supabase stack |
| `npm run migrate:prod` | Pushes pending migrations to the linked remote project |
| `npm run gen:types:local` | Regenerates `src/db/database.types.ts` from the local Supabase schema |
| `npm run gen:types:prod` | Regenerates `src/db/database.types.ts` from the linked remote project's schema |
| `npm run inngest:dev` | Starts the local Inngest dev server |
| `npm run seed:prompts` | Seeds/updates the 7 agent system prompts in Langfuse Prompt Management |

## Architecture & conventions

See `CLAUDE.md` for the full repo map, naming conventions, and non-negotiable
rules, and `.ai/context/` for detailed architecture docs.
