---
last-verified: 2026-09-19
verified-against: BE src/index.ts, src/routes/*, src/pipeline/*, supabase/migrations/* · BE ARCHITECTURE.md, FRONTEND-CONTRACT.md, DATABASE-SCHEMA.md · FE CLAUDE.md, src/ tree
stale-after-days: 30
audience: engineering onboarding, technical due diligence, technical marketing, support escalation
---

# System Architecture (Product-Level)

> How the frontend and backend fit together, at the level needed to reason about the product. For code-level detail, load the repo `CLAUDE.md` and the files it routes to. The backend's `FRONTEND-CONTRACT.md` is the authority on the integration contract.

---

## Two repositories, one product

| Repo | Local path | What it is | Deploys to |
|---|---|---|---|
| **thinking-canvas-be** (a.k.a. `thinking-canvas-api`) | `~/Desktop/thinking-canvas-be` | Hono API + Inngest pipelines + Mastra agents | Railway (planned) |
| **thinking-canvas-frontend** (a.k.a. `thinking-canvas-web`) | `~/Desktop/thinking-canvas-frontend` | Next.js (App Router, v16) + React 19 + React Flow canvas | Vercel (planned) |

Both use **npm only**. The backend's `types/index.ts` is the **source of truth for contract types**. The frontend mirrors it and never hand-edits the copy.

---

## Stack

| Concern | Choice | Why |
|---|---|---|
| Canvas UI | React Flow (`@xyflow/react`), Zustand (one store per concern), Tailwind | Custom node and edge types; the graph *is* the UI |
| Web server | **Hono** (Node, port 3001) | A lightweight, persistent process, needed for SSE and durable timers |
| Agents | **Mastra** | TypeScript-native agents and tools, with one registry for tracing |
| Durable pipelines | **Inngest** | Retries, step isolation, `waitForEvent` for the consent timer, debouncing |
| Database | **Supabase** Postgres + **pgvector** + Auth + RLS | Graph store, vectors, and auth in one place |
| Streaming | **Upstash Redis** pub/sub → Hono **SSE** | Keeps high-frequency token traffic off Postgres |
| AI | **Google Gemini only**: `2.5-flash-lite` (content), `2.5-flash` (judge, attunement, observer, outer sub, summaries, rejection insights; high thinking where depth matters), `gemini-embedding-2` (3072-dim vectors) | One provider and one key. Cheap models for content, thinking where judgement matters. |
| Observability and prompts | **Langfuse** (via Mastra), prompts managed in Langfuse with local fallbacks | Every agent call traced from day one; prompts editable live |
| Payments | **Stripe** (webhook only so far) | Subscription sync |

---

## The three data planes (the #1 integration concept)

```
PLANE 1: Browser ⇄ Supabase directly (anon key + user JWT, RLS-scoped)
   The frontend WRITES the user's canvas itself: canvases (create), nodes, edges,
   positions, set_aside_at, current_phase, carry-forward learnings.
   The frontend READS everything it renders.

PLANE 2: Browser → Backend REST (Supabase JWT required as of 2026-09-19)
   POST /api/canvas-event       "I just wrote X", with IDs only and never content
   POST /api/ghost-status       accept/reject a ghost pair (+ rejection reason)
   POST /api/session/start      open or resume a session (idempotent)
   POST /api/session/complete   close a session and run the Observer (async)
   POST /api/intervention/*     🟠 defined, NOT mounted
   GET  /health

PLANE 3: Backend → Browser SSE   GET /api/stream/:sessionId?token=…
   The ONLY server push. One connection per session, held open.
   Messages: spawn · chunk · node_type · done · ping
   (+ waiting · offer · withdraw from the intervention layer, which the frontend ignores today)
```

**Write-then-notify.** The frontend writes to Supabase first, then notifies the backend with row IDs. The backend re-reads the authoritative row and never trusts content or flags in the request body. Skipping the notify means the node never gets enriched and never reaches the AI.

**No Supabase Realtime, and no server-pushed canvas state.** The canvas belongs to the user. The only thing the server pushes is AI output.

---

## What happens on each gesture

| Gesture | Frontend | Backend |
|---|---|---|
| Create a node | insert `nodes` → `canvas-event node.created` | Generate a directional summary, direction marker, and embedding; append to the session trail. *(Emits `canvas/node.created`, which **no pipeline consumes**; see known gaps.)* |
| Drag out to a new node | insert node + edge → **one** `edge.created` | Treated as node.created for the new node |
| **Question** edge | insert edge (`question`) → `edge.created` | **Outer-sub pipeline**, immediately → spawn → stream → done |
| **Relate** edge (both existing) | insert edge (`relate`, `both_existing`) → `edge.created` | **Articulator pipeline**, immediately |
| Logical edge between existing nodes | insert edge | Silent (context only) |
| Edit a node | update `nodes` → `node.updated` | Re-enrich summary and embedding |
| Delete a node/edge | delete → `node.deleted` / `edge.deleted` | Impact pipeline (staleness of held offers) |
| Set aside / restore | update `set_aside_at` → `node.set_aside` / `node.restored` | Live exclusion filter on every AI read; impact check |
| Accept a ghost | insert AI nodes/edges (reusing ghost IDs) → `ghost-status` → `canvas-event ghost.accepted` | Update the thread turn; enrich the AI nodes; `ai_contributions` audit. **Doesn't** re-trigger agents. |
| Reject a ghost | discard visuals → `ghost-status` + reason | Thread updated; **Rejection Insights** pipeline (if the context node was rejected) |
| Open a canvas | `session/start` → open SSE | Create the session (or return the active one) and write session-boundary markers into every agent thread |
| "I'm done" | `session/complete` → poll `session_learnings` → write carry-forwards | **Session-complete pipeline**: Observer over the whole canvas → `session_learnings` → purge offers → close the session |

**Silence is normal.** Many notifies produce no ghost: guards, one-ghost-per-node, the judge holding, or (today) no consumer. The UI never blocks waiting for AI.

---

## Ghost streaming, step by step

```
Inngest worker ──publish──► Upstash Redis ──subscribe──► Hono SSE ──► Browser EventSource
   spawn  (structure: ghost IDs, node types, edges; no content)
   ~1.5s  (the frontend animates empty ghost frames)
   chunk… (tokens, pre-routed by the backend to the context ghost or question ghost)
   node_type (restyles the context ghost once the agent declares its type)
   done   (thread_id + turn_index + which pair finished → enables accept/reject)
```

The backend defines ghost **structure** (the spawn descriptor, with backend-minted IDs). Agents produce **content** only. The frontend owns every visual.

---

## Data model (conceptual)

```
User
 └── Canvas  (permanent; original_intent is IMMUTABLE via RLS; canvas_version bumped on every graph change)
      ├── Sessions  (episodic; status active|closed; current_phase diverging|converging;
      │              node_sequence = THIS session's trail; receptivity score; seq counter)
      ├── Nodes     (belong to the canvas, created in a session; owner human|ai; content;
      │              x/y/width/height; summary, direction_marker, embedding[3072]; set_aside_at)
      ├── Edges     (logical|question|relate|doubt|associative; both_existing; from/to handle side)
      ├── agent_threads        one per (canvas, role): the AI's memory across sessions
      ├── rejection_insights   active negative constraints (+ Observer per-edge feedback)
      ├── attunement_state     per-event cognitive mode reading
      ├── intervention_offers  ephemeral consent-timer state
      ├── observer_structures / observer_edges   (tables exist, never written yet)
      ├── session_learnings    Observer output + carried-forward threads
      └── ai_contributions     audit of accepted AI nodes
 subscriptions (per user; synced from the Stripe webhook; missing/inactive = free)
```

- **RLS on every table**: canvas ownership via `auth.uid()`.
- **Atomic Postgres functions** for concurrent appends (`append_thread_message`, `append_node_to_sequence`, `decrement_insight_turns`), so parallel workers never drop writes.
- `match_nodes` (pgvector search) excludes set-aside nodes.

---

## Security posture

- **As of 2026-09-19** (feature branches, pending merge): every `/api/*` route verifies the Supabase JWT (Bearer header, or `?token=` for SSE), and every route checks **canvas/session ownership** before acting, because the service-role client bypasses RLS. Before this, the API was unauthenticated and guarded only by CORS.
- Stripe webhook: signature-verified against the raw body. Inngest: signing key.
- CORS is locked to `FRONTEND_URL`. ⚠️ The code default is `http://localhost:9000`; the docs say 3000.
- The browser only ever holds the anon key. RLS is the boundary.
- Prompts are constants and never built from user input. LLM-emitted IDs are always validated.

---

## Environments and operations

- Local: Supabase in Docker (`npx supabase start`), `npm run inngest:dev` plus `npm run dev` (backend), `npm run dev` (frontend).
- Migrations: `npm run migrate:local` / `migrate:prod`; types regenerated with `gen:types:*`.
- Prompts: `npm run seed:prompts` pushes fallbacks to Langfuse.
- There is no evidence in either repo of a production deployment, CI, analytics, error tracking (e.g. Sentry), or product telemetry yet. Logging goes through each repo's `logger` (never `console.log`).
