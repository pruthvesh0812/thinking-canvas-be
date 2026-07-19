# ThinkingCanvas API — Agent Navigation Index

> **This is the BACKEND repo only.**
> Frontend (thinking-canvas-web) is a separate repository.
> Read this file first on every task. Load only the context files listed for your task type.

---

## What ThinkingCanvas API Does

Receives canvas events from the frontend, runs the AI agent pipeline, and streams ghost node pairs back via Upstash Redis pub/sub → SSE. All data persists to Supabase PostgreSQL. No Supabase Realtime — the canvas is single-user, and backend never pushes unsolicited updates to user nodes or edges. Ghost nodes are the only server-to-client push, streamed via Redis.

---

## Four Working Rules

1. **Think First** — Read relevant context files before writing any code.
2. **Simplicity** — Write the minimum code that satisfies the requirement.
3. **Surgical** — Change only what the task requires.
4. **Goal-Driven** — Every line must trace back to the task.

---

## Task Classification & Context Load Table

| Task | Load these files |
|---|---|
| Any agent work (create/modify/debug) | `CORE-CONCEPTS.md` + `AGENT-PIPELINE.md` |
| Intervention — judge, offers, decide→wait→generate, show ruleset, receptivity, Impact Check | `.ai/context/intervention-layer/README.md` (+ the numbered sub-file) |
| Serialization / thread / context window | `CORE-CONCEPTS.md` + `SERIALIZATION.md` |
| Ghost streaming / SSE / Redis / spawn flag | `CANVAS-SYNC.md` + `.ai/context/intervention-layer/07-streaming-protocol.md` |
| Rejection Insights Engine | `AGENT-PIPELINE.md` + `CANVAS-SYNC.md` |
| Multi-Canvas / session model | `CORE-CONCEPTS.md` + `ARCHITECTURE.md` |
| Database / schema / migrations | `DATABASE-SCHEMA.md` + `CORE-CONCEPTS.md` |
| Auth / Stripe / tier enforcement | `ARCHITECTURE.md` |
| Session Complete / Observer / learnings | `CORE-CONCEPTS.md` + `AGENT-PIPELINE.md` |
| Model routing / Google AI / embeddings | `LLM-LAYER.md` |
| New Mastra agent | `AGENT-PIPELINE.md` + `LLM-LAYER.md` + `.ai/skills/create-mastra-agent.md` |
| New cursor tool | `SERIALIZATION.md` + `.ai/skills/create-cursor-tool.md` |
| New Inngest function | `AGENT-PIPELINE.md` + `.ai/skills/create-inngest-function.md` |
| Supabase migration | `.ai/skills/run-migration.md` |
| External library question | `.ai/refs/EXTERNAL-DOCS.md` |
| Coding conventions / patterns / prohibited patterns | `CODING-STANDARDS.md` |
| Logging — adding logs to tools / agents / pipelines / routes | `LOGGING.md` |

---

## Repo Structure

```
thinking-canvas-api/
├── src/
│   ├── agents/             # Mastra agent definitions (one file per agent)
│   │   ├── expander.ts
│   │   ├── stress-tester.ts
│   │   ├── observer.ts
│   │   ├── outer-subconscious.ts
│   │   ├── articulator.ts
│   │   ├── attunement.ts
│   │   └── orchestrator.ts
│   ├── tools/              # Cursor tools
│   │   ├── get-content.ts
│   │   ├── get-window.ts
│   │   ├── traverse-trail.ts
│   │   ├── get-big-picture.ts
│   │   ├── get-siblings.ts
│   │   ├── get-path.ts
│   │   ├── get-branch.ts
│   │   └── semantic-promote.ts
│   ├── pipeline/           # Inngest functions
│   │   ├── agent-pipeline.ts       # debounced main pipeline
│   │   ├── articulator-pipeline.ts # immediate on existing-node edge
│   │   ├── outer-sub-pipeline.ts   # immediate on question edge
│   │   ├── rejection-insights.ts   # immediate on ghost rejection
│   │   └── session-complete.ts     # on Session Complete
│   ├── serializer/
│   │   ├── index.ts        # main serialize() function
│   │   ├── tiers.ts        # tier classification logic
│   │   ├── rules.ts        # per-agent serialization rules
│   │   └── rejection.ts    # rejection insights injection
│   ├── streaming/
│   │   ├── spawn.ts        # builds and publishes spawn descriptor
│   │   └── tokens.ts       # streams agent output chunks to Redis
│   ├── db/
│   │   ├── client.ts       # Supabase client (service role)
│   │   ├── canvases.ts
│   │   ├── sessions.ts
│   │   ├── nodes.ts
│   │   ├── edges.ts
│   │   ├── threads.ts
│   │   ├── rejection-insights.ts
│   │   └── observer-structures.ts  # read-only until pipeline writes land (features 8-10)
│   ├── routes/
│   │   ├── canvas-event.ts # POST /api/canvas-event
│   │   ├── stream.ts       # GET /api/stream/:sessionId (SSE via Redis)
│   │   ├── ghost-status.ts # POST /api/ghost-status
│   │   ├── session.ts      # POST /api/session/complete, /api/session/start
│   │   └── stripe.ts       # POST /api/stripe/webhook
│   ├── lib/
│   │   ├── redis.ts        # Upstash Redis client
│   │   ├── tier.ts         # getAvailableAgents()
│   │   └── guards.ts       # canAgentFire()
│   ├── mastra.ts            # Mastra registry — agents + Langfuse observability config
│   └── index.ts            # Hono app entry point
├── types/                  # TypeScript types shared across src/
│   └── index.ts            # Canvas, Session, NodeDelta, GhostPair, RejectionInsight, SpawnDescriptor
├── supabase/
│   └── migrations/         # SQL migration files
├── .ai/
│   ├── context/
│   ├── refs/
│   └── skills/
├── .env.example
├── CLAUDE.md               # This file
├── package.json            # npm — not pnpm
└── tsconfig.json
```

---

## How to Find Things

| I want to... | Look in... |
|---|---|
| Add/modify an agent | `src/agents/[name].ts` |
| Add a cursor tool | `src/tools/[name].ts` |
| Modify serializer | `src/serializer/` |
| Modify spawn descriptor logic | `src/streaming/spawn.ts` |
| Modify Rejection Insights | `src/pipeline/rejection-insights.ts` |
| Add Inngest pipeline | `src/pipeline/[name].ts` |
| SSE streaming endpoint | `src/routes/stream.ts` |
| DB migration | `supabase/migrations/` |
| Understand a table's fields | `.ai/context/DATABASE-SCHEMA.md` |
| Shared types | `types/index.ts` |
| Redis client | `src/lib/redis.ts` |
| canAgentFire guard | `src/lib/guards.ts` |
| Change AI model / provider | `src/lib/llm.ts` |
| Agent tracing / Langfuse observability | `src/mastra.ts` |

---

## Naming Conventions

| Layer | Pattern | Example |
|---|---|---|
| Mastra agents | camelCase + Agent | `expanderAgent`, `observerAgent` |
| Inngest functions | kebab-case | `agent-pipeline`, `rejection-insights` |
| Cursor tools | snake_case | `get_content`, `semantic_promote` |
| Supabase tables | snake_case plural | `canvases`, `sessions`, `nodes`, `rejection_insights` |
| TypeScript types | PascalCase | `Canvas`, `Session`, `NodeDelta`, `SpawnDescriptor` |
| Zod schemas | camelCase + Schema | `canvasEventSchema`, `ghostStatusSchema` |
| Inngest events | `domain/noun.verb` | `canvas/node.created`, `canvas/ghost.rejected` |
| Redis channels | `canvas:stream:${sessionId}` | |
| Spawn message types | string literal | `spawn` \| `chunk` \| `done` |
| Git branches | `<type>/<short-title>-<timestamp>` | `feature/rejection-insights-injection-2026-06-20T1430` |

> Branch naming — full spec (allowed types, timestamp format) in `CODING-STANDARDS.md`. Never use randomly generated branch names.

---

## Non-Negotiables (every task)

1. `canAgentFire()` before every judge route — never skip (the judge replaced the Orchestrator; `src/agents/orchestrator.ts` now exports `runJudge`)
2. Tier enforcement in the judge — server-side only, and never substitute a weaker agent (tier-locked best → upgrade offer, see intervention-layer)
3. `canvases.original_intent` written once — never updated
4. Agent system prompts are constants — never built from user input
5. Agent threads are per-canvas (`canvas_id`) — never per-session
6. Shared types in `types/index.ts` — never duplicate
7. RLS on every Supabase table
8. No Supabase Realtime — backend never pushes unsolicited state to frontend
9. Redis pub/sub = intervention signals (`waiting`/`offer`/`withdraw`/`spawn`/`chunk`/`done`) — the ghost stream is the maximal form; still no canvas *state* over Redis
10. Load active rejection_insights before every agent call — inject as NEGATIVE CONSTRAINTS
11. Ghost structure (nodes + edges) defined by frontend from spawn descriptor — agent generates content only
12. Never import `@ai-sdk/google` outside `src/lib/llm.ts` — all model instantiation centralised there (see `LLM-LAYER.md`)
13. Every tool, agent, pipeline, and route must use `logger` from `src/lib/logger.ts` — never `console.log` directly (see `LOGGING.md`)

---

## Key Commands

```bash
npm run dev          # Start dev server (Hono + Inngest)
npm run build        # Compile TypeScript
npm run test         # Run tests
npm run migrate:local      # Run pending Supabase migrations against local Docker stack
npm run migrate:prod       # Run pending Supabase migrations against linked remote project
npm run gen:types:local    # Regenerate TypeScript types from local Supabase schema
npm run gen:types:prod     # Regenerate TypeScript types from linked remote project's schema
npm run inngest:dev        # Start Inngest dev server separately
```

---

## Architecture Quick Reference

| Concern | Solution |
|---|---|
| Ghost node streaming to frontend | Upstash Redis pub/sub → Hono SSE |
| Canvas state persistence | Supabase PostgreSQL (no Realtime) |
| Durable debounce pipeline | Inngest (debounced by session_id) |
| Agent framework | Mastra |
| All AI models | Google AI (single provider) |
| Agent memory | Custom canvas-scoped threads in Supabase |
| Ghost rejection learning | Rejection Insights Engine → NEGATIVE CONSTRAINTS in prompt |
| Ghost structure definition | Frontend HTML/components — backend sends spawn descriptor only |

---

## Current Build Status

**As of 2026-06-09 — Implementation not yet started.**

The repo was bootstrapped with `create-next-app`. The `src/app/` Next.js scaffold and the root Next.js config must be replaced by the Hono backend as the first implementation task.

**What exists:**
- `.ai/context/` — complete architecture documentation (verified 2026-06-08)
- `.ai/skills/` — skill guides for agent/tool/pipeline/migration creation
- `.ai/features/` — feature stories with tasks (see Implementation Order below)
- `supabase/migrations/` — not yet created

**What does NOT exist yet (must be built in this order):**

| # | Feature | Story |
|---|---|---|
| 1 | Project bootstrap — Hono + TypeScript + Inngest | `.ai/features/project-bootstrap/` |
| 2 | Database foundation — all tables, RLS, pgvector | `.ai/features/database-foundation/` |
| 3 | Core types + Zod schemas | `.ai/features/core-types/` |
| 4 | DB layer — `src/db/*` | `.ai/features/db-layer/` |
| 5 | Cursor tools — `src/tools/*` | `.ai/features/cursor-tools/` |
| 6 | Serializer — `src/serializer/*` | `.ai/features/serializer/` |
| 7 | Agent implementations — `src/agents/*` | `.ai/features/agent-implementations/` |
| 8 | Ghost streaming — `src/lib/*` + `src/streaming/*` | `.ai/features/ghost-streaming/` |
| 9 | Inngest pipelines — `src/pipeline/*` | `.ai/features/inngest-pipelines/` |
| 10 | API routes — `src/routes/*` + `src/index.ts` | `.ai/features/api-routes/` |

> **Note:** `.ai/features/sdk-delivery-filter/` is from a different project (Spring Boot / help-center-v2). Ignore it.

---

## Skills Reference

| Skill | File | Load when |
|---|---|---|
| Create Mastra agent | `.ai/skills/create-mastra-agent.md` | Adding any new agent in `src/agents/` |
| Create cursor tool | `.ai/skills/create-cursor-tool.md` | Adding any new tool in `src/tools/` |
| Create Inngest function | `.ai/skills/create-inngest-function.md` | Adding any pipeline in `src/pipeline/` |
| Run Supabase migration | `.ai/skills/run-migration.md` | Adding or modifying DB schema |