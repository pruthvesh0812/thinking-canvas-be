---
last-verified: 2026-06-08
verified-against: ThinkingCanvas_TechnicalBuild.docx (post single-user refactor)
stale-after-days: 30
---

# ARCHITECTURE.md

> **Load this when:** Working on deployment, service integration, model routing, auth, payments, Redis streaming, or DB schema.

---

## Two Separate Repos

| Repo | Description | Deployment |
|---|---|---|
| `thinking-canvas-api` | Backend — this repo | Railway |
| `thinking-canvas-web` | Frontend — separate repo | Vercel |

These are independent. No shared package manager. Each has its own `package.json` using **npm**.

---

## Service Topology

```
Frontend (Vercel — thinking-canvas-web)
  └── Next.js app
        ├── User creates node/edge → writes directly to Supabase
        ├── User action → POST /api/canvas-event (Railway)
        └── SSE (EventSource) ← ghost node streaming via Redis

Railway (Backend — this repo)
  └── Hono server
        ├── POST /api/canvas-event  → save metadata + fire Inngest
        ├── GET  /api/stream/:sessionId → SSE via Upstash Redis subscription
        ├── POST /api/ghost-status  → update ghost pair status in thread
        ├── POST /api/session/complete → Session Complete flow
        ├── POST /api/stripe/webhook → subscription sync
        └── Inngest worker (same process)
              ├── agent-pipeline (debounced 10s by session_id)
              ├── articulator-pipeline (immediate)
              ├── outer-sub-pipeline (immediate)
              ├── rejection-insights (immediate on ghost rejection)
              └── session-complete (on Session Complete event)

Upstash Redis (pub/sub only)
  └── Channel: canvas:stream:${sessionId}
        Inngest publishes: spawn | chunk | done
        Hono subscribes → forwards to SSE
        ONLY for ghost node streaming. No canvas state. No user node/edge events.

Supabase
  ├── PostgreSQL — all persistent data
  ├── pgvector — node embeddings (gemini-embedding-2, 3072 dims)
  └── Auth — anonymous sessions + Google OAuth + email/password
  NOTE: Supabase Realtime is NOT used. Single-user canvas — no backend push for canvas state.

Google AI (single provider — all instantiation via src/lib/llm.ts, see LLM-LAYER.md)
  ├── gemini-2.5-flash-lite (models.content()) — content agents (Expander, Stress-Tester, Articulator)
  ├── gemini-2.5-flash (models.fast()) — Attunement, Orchestrator, Observer, Outer Sub, Summary, Rejection Insights
  │     Observer + Outer Sub add providerOptions: { google: models.thinking('high') }
  └── gemini-embedding-2 — node embeddings
```

---

## Multi-Canvas Workspace Model

```
User
  └── Canvas (permanent container)
        ├── original_intent (immutable — set once at creation, RLS blocks UPDATE)
        ├── title
        └── Sessions (episodic thinking runs)
              ├── Session 1: start_time, end_time, status:closed, node_sequence:[n1,n2,n3]
              ├── Session 2: start_time, end_time, status:closed, node_sequence:[n4,n5]
              └── Session 3: start_time, status:active, node_sequence:[n6,n7] ← current
```

- Nodes belong to canvas (visible across all sessions), created in a session
- Agent threads are per-canvas — they accumulate knowledge across sessions
- `sessions.node_sequence` = only the nodes created in THAT session

---

## Agent Model Routing

> Source of truth: `src/lib/llm.ts` / `LLM-LAYER.md`. All instantiation goes through `models.fast()` / `models.content()` / `models.thinking()` — never `google(...)` directly.

| Agent | Model | Thinking | Note |
|---|---|---|---|
| Expander | gemini-2.5-flash-lite (models.content()) | OFF | |
| Stress-Tester | gemini-2.5-flash-lite (models.content()) | OFF | |
| Articulator | gemini-2.5-flash-lite (models.content()) | OFF | |
| Observer | gemini-2.5-flash (models.fast()) | **high** (models.thinking('high')) | Compensates for Flash base |
| Outer Subconscious | gemini-2.5-flash (models.fast()) | **high** (models.thinking('high')) | Compensates for Flash base |
| Attunement Layer | gemini-2.5-flash (models.fast()) | OFF | Pure classification |
| Orchestrator | gemini-2.5-flash (models.fast()) | OFF | Routing decision |
| Directional Summary | gemini-2.5-flash (models.fast()) | low (models.thinking('low')) | Structured output |
| Rejection Insights | gemini-2.5-flash (models.fast()) | low (models.thinking('low')) | Structured output |
| Embeddings | gemini-embedding-2 | N/A | 3072 dimensions |

**Single API key:** `GOOGLE_AI_API_KEY` covers all models.

---

## Key Environment Variables

| Variable | Notes |
|---|---|
| `GOOGLE_AI_API_KEY` | All Gemini models + embeddings |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only — never expose to client |
| `UPSTASH_REDIS_REST_URL` | Pub/sub streaming |
| `UPSTASH_REDIS_REST_TOKEN` | |
| `STRIPE_SECRET_KEY` | |
| `STRIPE_WEBHOOK_SECRET` | |
| `INNGEST_EVENT_KEY` | |
| `INNGEST_SIGNING_KEY` | |
| `LANGFUSE_PUBLIC_KEY` | Observability |
| `LANGFUSE_SECRET_KEY` | |
| `FRONTEND_URL` | Allowed CORS origin (Vercel URL) |

---

## Database Tables (summary)

| Table | Key FKs | Notes |
|---|---|---|
| `canvases` | user_id | Permanent. `original_intent` immutable via RLS. |
| `sessions` | canvas_id | Episodic run. `node_sequence` = this session only. |
| `nodes` | canvas_id + session_id | Belongs to canvas, created in session. |
| `edges` | canvas_id + session_id | `both_existing` flag triggers Articulator. |
| `agent_threads` | canvas_id | Per-canvas. Accumulates across sessions. |
| `attunement_state` | canvas_id + session_id | Per node creation event. |
| `rejection_insights` | canvas_id + session_id + thread_id | Active constraints. |
| `ai_contributions` | canvas_id + session_id | Audit log. |
| `session_learnings` | canvas_id + session_id | Unresolved threads carried forward. |
| `subscriptions` | user_id | Stripe sync. |

---

## Auth Flow

```
Session 1 (anonymous): full canvas access, no signup
Session Complete (first): "Create account to save and continue"
  → anonymous sessions migrated to user_id on signup
Session 2+: requires auth
RLS: auth.uid() = user_id on canvases → cascades
```

Auth methods: Google OAuth (primary) + email/password.

---

## Pricing Tiers

| Tier | Agents |
|---|---|
| Free | Expander + Articulator only |
| Pro ($19/month) | All 5 agents + Rejection Insights + Session Complete |
| Power ($39/month, v1.5) | All + cognitive profile |

Checked in Orchestrator via `getAvailableAgents(subscription_tier)` — server-side only.

---

## npm Commands

```bash
npm run dev        # Start Hono + Inngest dev server
npm run build      # Compile TypeScript
npm run test       # Run tests
npm run migrate    # Run pending Supabase migrations
npm run gen:types  # Regenerate TypeScript types from schema
```
