# ThinkingCanvas — Project Foundation Document

> **Purpose of this document.** A single, self-contained base for research and
> development on ThinkingCanvas. It captures the vision, the product model, the
> system architecture, the AI design, what is already built, what is open, and
> where the interesting research problems are. Detailed, authoritative specs
> live in `.ai/context/*` — this document is the map that ties them together
> and the starting point for anyone (human or agent) taking the project further.
>
> Last compiled: 2026-07-14 · against commit `a7a0dfa` (intervention-spectrum task-08)

---

## 1. Vision & Prime Directive

ThinkingCanvas is a spatial thinking tool: the user thinks by placing nodes and
drawing edges on an infinite canvas, and an ensemble of AI agents thinks
*alongside* them — expanding, stress-testing, connecting, and observing — without
ever taking the wheel.

**The Prime Directive: AI augments human cognition — never replaces it.**
Every design decision in this codebase flows from it.

The ownership split:

| Human owns | AI owns |
|---|---|
| The goal and the intent (the "north star") | Expansion 1–2 cognitive jumps ahead |
| The convergence click (when to stop diverging) | Stress-testing gaps and contradictions |
| Which path to take, what to accept/reject | Spatial awareness and drift detection |
| The final articulation of their own thinking | Cross-domain associative leaps |

**The test for every AI contribution:** does it require a cognitive response
from the human? If the human can accept it without thinking, it has failed.

Two consent gates enforce this:

1. **Acceptance gate (the Ghost Threshold)** — AI output appears as *ghost*
   nodes (translucent, dashed) that only cross into the real canvas when the
   human explicitly accepts them.
2. **Presentation gate (the Intervention Spectrum)** — added in June 2026:
   before the AI even *generates* content, the system judges whether the moment
   is mature, announces its intent quietly, and waits for a visible timer to
   lapse or the user to approve. Materializing structure is itself an
   interruption; the system now asks permission for that too.

---

## 2. Product Model

### 2.1 Multi-Canvas workspace

```
User
  └── Canvas (permanent container — never deleted)
        ├── original_intent   ← THE NORTH STAR — immutable after creation (RLS blocks UPDATE)
        ├── title
        └── Sessions (episodic thinking runs)
              └── Session
                    ├── status: active | closed
                    ├── node_sequence: UUID[]  ← ONLY nodes created in THIS session, in order
                    └── current_phase: diverging | converging (one-way latch in v1)
```

Critical distinctions that recur everywhere in the code:

- `nodes.canvas_id` → a node belongs to the **canvas** and is visible across all sessions.
- `nodes.session_id` → records which session *created* it.
- `sessions.node_sequence` → the ordered thinking trail for that session only.
- `agent_threads` are **per canvas**, never per session — agent memory
  accumulates across sessions.
- `original_intent` lives on the canvas, not the session. One north star per
  canvas, forever.

### 2.2 The directed graph

Nodes carry `owner: human | ai`, a `direction_marker`
(`establishes | questions | contradicts | explores`), an AI-generated
directional `summary`, and a 3072-dim embedding (gemini-embedding-2).
Edges carry `edge_type: logical | doubt | question | associative` and a
`both_existing` flag (an edge drawn between two already-existing nodes triggers
the Articulator immediately).

### 2.3 Ghost node pairs

Every content contribution (Expander, Stress-Tester, Articulator, Outer
Subconscious) is a structured **ghost pair**: a *Context node* of one of six
types (`reframe | mirror | pattern | reference | contradiction | appreciation`)
plus a mandatory *Question node* (optional only for `appreciation`). One ghost
pair per real node maximum; no auto-fade; accept = both cross into the canvas,
reject = both disappear and feed the Rejection Insights Engine.

The **Observer is the exception**: it never writes a ghost pair. It highlights
existing canvas nodes as *anchors*; hovering reveals a leveled DAG of
observation nodes whose edges the user accepts/rejects **individually**.
Rejection there is a batched *re-think trigger* (the Observer is re-invoked
with all rejected references + reasons), not a local delete. See
`CORE-CONCEPTS.md → The Observer Structure` for the full protocol.

### 2.4 Session Complete

Human-triggered, never automatic. Three screens: queued Observer suggestions →
unresolved threads (carry forward / discard) → session closed, with
carry-forwards written to `session_learnings`.

---

## 3. System Architecture

Two independent repos, no shared packages, both npm:

| Repo | Role | Deploy |
|---|---|---|
| `thinking-canvas-api` (**this repo**) | Hono backend + Inngest worker + agent pipeline | Railway |
| `thinking-canvas-web` | Next.js canvas frontend | Vercel |

### 3.1 Topology

```
Frontend (Vercel)
  ├── writes user nodes/edges directly to Supabase
  ├── POST /api/canvas-event ────────────────┐
  └── SSE  GET /api/stream/:sessionId ◄──┐   │
                                         │   ▼
Backend (Railway — Hono + Inngest in one process)
  ├── routes: canvas-event · stream · ghost-status · session · intervention · stripe
  └── Inngest functions:
        agent-pipeline          (debounced by session_id; decide→wait→generate handshake)
        articulator-pipeline    (immediate — edge between existing nodes)
        outer-sub-pipeline      (immediate — question edge)
        rejection-insights      (immediate — ghost rejection)
        session-complete        (on Session Complete)
                                         │
Upstash Redis pub/sub  canvas:stream:${sessionId}
  message types: spawn | chunk | done | waiting | offer | withdraw | ping
  → forwarded 1:1 to SSE. Ghost/offer streaming ONLY — never canvas state.

Supabase
  ├── PostgreSQL — all persistent state, RLS on every table
  ├── pgvector — node embeddings (3072 dims)
  └── Auth — anonymous first session → Google OAuth / email+password
  (Supabase Realtime is deliberately NOT used — single-user canvas,
   backend never pushes unsolicited canvas state.)

Google AI (single provider, single key — all instantiation via src/lib/llm.ts)
Langfuse — agent tracing (@mastra/langfuse) + prompt management (scripts/seed-prompts.ts)
Stripe — subscription webhook → subscriptions table
```

### 3.2 Stack

Hono (HTTP + SSE) · Mastra (agent framework, all agents registered in one
`Mastra` instance in `src/mastra.ts` for auto-tracing) · Inngest (durable,
debounced pipelines) · Supabase JS (service-role client) · Upstash Redis REST ·
Vercel AI SDK + `@ai-sdk/google` (only inside `src/lib/llm.ts`) · Zod ·
Vitest (configured; no tests written yet) · TypeScript ESM, Node 20+.

---

## 4. The AI System

### 4.1 The five content roles + infrastructure

| Role | Activation | Job | Model |
|---|---|---|---|
| **Expander** | New node in diverge phase | Opens 1–2 cognitive jumps ahead along the trail | flash-lite (`models.content()`) |
| **Stress-Tester** | Phase = converging | Gaps, weak assumptions, contradictions | flash-lite |
| **Observer** | Continuous + Session Complete | Bird's-eye spatial map, drift vs north star, anchor-based structures | flash + thinking:high |
| **Outer Subconscious** | Question edge drawn | Cross-domain associative leap | flash + thinking:high |
| **Articulator** | Edge between two existing nodes | 2–3 possible articulations of a half-formed connection | flash-lite |
| *Attunement Layer* (infra) | Before every judgement | Classifies cognitive mode: exploratory / transitional / declarative | flash, thinking OFF |
| *The Judge* (infra — formerly "Orchestrator") | On intervention trigger | Maturity + single-best routing from full canvas-map: `{ mature, route, locus_node_ids, headroom, confidence }` | flash |
| *Rejection Insights* (infra) | On ghost rejection | Rejection → structured negative constraints | flash + thinking:low |
| *Directional Summary* (infra) | On node save | One-sentence directional summary + embedding | flash + thinking:low / gemini-embedding-2 |

All model access goes through `src/lib/llm.ts` (`models.content()`,
`models.fast()`, `models.thinking(level)`) — importing `@ai-sdk/google`
anywhere else is prohibited. One env key (`GOOGLE_AI_API_KEY`) covers everything.

### 4.2 The Intervention Spectrum (the current architectural centerpiece)

The June–July 2026 work replaced the binary "full ghost pair or nothing" model
with two orthogonal axes joined by a handshake (`.ai/features/intervention-spectrum/DESIGN.md`
is the model authority — 24-action matrix, decisions log):

- **Trigger axis (whether to generate):** frontend trigger ruleset →
  `POST /api/intervention/trigger` → the **judge** runs on the full canvas-map →
  if mature, publish `waiting` (starts a visible timer on the FE) →
  `step.waitForEvent('canvas/intervention.process', { timeout })` → re-judge if
  the canvas changed (context fingerprint) → only then spend content-agent
  tokens and stream.
- **Show axis (how loudly):** `directness = f(state, show-rule)` in
  `src/lib/intervention.ts` — from a quiet sidebar `offer` up to a full ghost
  `spawn` — plus a **receptivity model** that folds every terminal offer
  response into a running per-session aggregate.
- **Concurrency:** single-flight per session; monotonic version guard
  (`offer.seq` vs `sessions.latest_seq`) re-checked at the publish boundary;
  supersession publishes `withdraw` and cancels the parked run. Context
  staleness is detected by a per-canvas version counter bumped by a DB trigger
  on **both** `nodes` and `edges`.
- **Offers are ephemeral** (`intervention_offers`): purged on session close +
  TTL. Deferring a timer is *not* content rejection — offer responses are kept
  strictly out of `rejection_insights`.

### 4.3 Context: serialization & agent memory

Agent memory is custom canvas-scoped threads in Supabase (`agent_threads`),
not Mastra memory. The serializer (`src/serializer/`) builds per-agent context
with recency **tiers** (full content → summaries) under per-agent rules; the
Observer is the exception, receiving a full spatial `canvas-map` (summary-only,
grouped by session, read fresh from source tables). Agents can pull more via
**cursor tools** (`src/tools/`): `get_content`, `get_window`, `traverse_trail`,
`get_big_picture`, `get_siblings`, `get_path`, `get_branch`, and
`semantic_promote` (pgvector similarity). Spec: `SERIALIZATION.md`.

### 4.4 The learning loops

1. **Rejection Insights Engine** — reject reason → severity → Insight Points →
   injected as a NEGATIVE CONSTRAINTS block into subsequent prompts.
   `Too Abstract → hard_block`, `Too Technical → approach_pivot`,
   `Skip for now → temporal_deferral` (turns-based cooldown, atomically
   decremented in Postgres).
2. **Observer connection feedback** — per-edge rejection reasons
   (`not_related | wrong_direction | too_indirect | already_obvious`) injected
   only into the Observer's own prompt. Deliberately a separate category from
   content rejection.
3. **Receptivity** — rolling per-session signal from offer responses +
   interaction texture (e.g. curation bursts), modulating the show ruleset.
4. **Session learnings** — carry-forwards across sessions on the same canvas.

### 4.5 Timing model

The debounce contract: the main pipeline fires on **pauses**, not events —
10s default for the first 5 nodes, then velocity-adaptive (1.5× average gap,
clamped 8–25s). Question edges and existing-node edges bypass it entirely.
`canAgentFire()` (in `src/lib/guards.ts`) gates every route: pending ghost,
in-flight offer, single-flight, version guard.

---

## 5. Data Model (summary)

Authoritative spec: `.ai/context/DATABASE-SCHEMA.md`. Migrations in
`supabase/migrations/` (9 as of this writing). RLS on every table;
`canvases.original_intent` immutability is enforced by RLS, not convention.

| Table | Keyed by | Purpose |
|---|---|---|
| `canvases` | user_id | Permanent container; immutable `original_intent` |
| `sessions` | canvas_id | Episodic runs; `node_sequence`, `current_phase`, `latest_seq`, receptivity state |
| `nodes` / `edges` | canvas_id + session_id | The graph; embeddings on nodes; fingerprint trigger on both |
| `agent_threads` | canvas_id | Per-canvas agent memory (JSONB message log, atomic append) |
| `attunement_state` | canvas_id + session_id | Cognitive-mode classification per node event |
| `rejection_insights` | canvas_id + session_id + thread_id | Active negative constraints (+ Observer edge feedback via `target_edge_id`) |
| `observer_structures` / `observer_edges` | canvas_id | Observer DAGs; per-edge accept/reject |
| `intervention_offers` | canvas_id + session_id | **Ephemeral** offer lifecycle (waiting→shown→…), purged |
| `ai_contributions` | canvas_id + session_id | Audit log |
| `session_learnings` | canvas_id + session_id | Carry-forwards |
| `subscriptions` | user_id | Stripe tier sync |

Three atomic Postgres functions replace read-modify-write in app code (concurrent
Inngest workers would drop writes otherwise): `append_thread_message`,
`append_node_to_sequence`, `decrement_insight_turns` — plus `allocate_session_seq`
for the version guard and `match_nodes` for pgvector search.

---

## 6. Current State (as of 2026-07-14)

> ⚠️ `CLAUDE.md → Current Build Status` still says "implementation not yet
> started" (dated 2026-06-09). That section is **stale** — all ten foundation
> features have since been implemented, plus most of intervention-spectrum.

**Built and committed:**

- Full Hono + Inngest backend: all routes (`canvas-event`, `stream`,
  `ghost-status`, `session`, `intervention`, `stripe`), all five pipelines,
  all seven agents, all eight cursor tools, serializer, streaming layer,
  DB layer, 9 migrations, LLM layer, logger, guards, tier enforcement,
  Langfuse observability, prompt seeding script.
- **Intervention-spectrum tasks 01–08** (data foundation → phase latch → judge
  → handshake → concurrency/version guard → canvas-sync deletes/updates → show
  ruleset + Impact Check → receptivity + offer purge).

**Open / not done:**

| Item | Notes |
|---|---|
| intervention-spectrum **task-09** | Doc ratification via `update-ai-context`: CANVAS-SYNC.md, non-negotiable #8/#9 amendment (new Redis message types), judge role, phase model. The context docs still describe the pre-judge Orchestrator. |
| **Tests** | Vitest is configured; **zero test files exist**. Highest-leverage first targets: serializer tiering, guards (`canAgentFire`, version guard), Observer structure validation, show ruleset. |
| **Frontend** | `thinking-canvas-web` had not been started as of the intervention-spectrum story. Everything FE-dependent (trigger ruleset, timer UI, offer surfaces, delete/re-parent event emission) is unexercised end-to-end. |
| **CLAUDE.md refresh** | Build-status section + repo tree (missing `intervention.ts` route, `offer.ts`, `intervention-offers.ts`, etc.). |
| **Branching** (`.ai/features/branching/`) | Deferred, major architectural change: branches as first-class forks from anchor nodes; also the rescue path for superseded AI responses. Depends on intervention-spectrum. Needs its own gatekeeper pass. |
| **Power tier (v1.5)** | Cognitive profile — designed in pricing, not built. |
| Stray artifact | `.ai/features/sdk-delivery-filter/` belongs to a different project (Spring Boot). Ignore/remove. |

**Process note:** feature work in this repo goes through a gatekeeper flow —
story + task files in `.ai/features/<name>/` (`/gatekeeper` → `/approve` →
`/implement`), with skills in `.ai/skills/` for the recurring shapes (new
agent, new tool, new Inngest function, migration) and `update-ai-context` to
keep `.ai/context/*` truthful after architectural change.

---

## 7. Research Directions

Where the genuinely open problems are — each is a self-contained thread that
can be pursued without destabilizing the core.

1. **Intervention timing & receptivity.** The receptivity model (task-08) is a
   first-pass heuristic aggregate. Open questions: what interaction signals
   actually predict "the user wants input *now*"? Can dismissal-vs-lapse-vs-pull
   patterns train a per-user prior? Langfuse traces + `intervention_offers`
   terminal states (pre-purge) are the natural dataset.
2. **Attunement quality.** The exploratory→transitional→declarative classifier
   is called "the system's most important behavioural feature" and is currently
   a single Flash call reading language quality + node velocity. It has no
   ground truth and no evaluation harness. Building even a small labeled set of
   thinking-session transcripts would allow measuring (and prompt-iterating)
   the classifier — and deciding whether the v1 one-way phase latch should
   become bidirectional.
3. **Judge cost vs quality.** The judge runs on the full canvas-map on the hot
   path. Current mitigations: FE trigger ruleset + fingerprint verdict-reuse.
   Research: how large do real canvases get before canvas-map serialization
   degrades judgement or blows latency/cost? Does a summary-only map suffice, or
   does the judge need selective full content (cursor-tool-style promotion)?
4. **Does rejection-based learning actually work?** The Rejection Insights
   Engine injects negative constraints, but nothing measures whether subsequent
   acceptance rates improve, or whether hard_blocks over-constrain. The
   `ai_contributions` audit log + ghost statuses give accept/reject rates per
   agent per constraint-state — an evaluation loop waiting to be built.
5. **Embedding space usage.** Embeddings (3072-dim) are written on every node
   save but consumed only by `semantic_promote` and `match_nodes`. Underused
   surface: drift detection vs `original_intent` embedding, cross-canvas
   pattern recall for the Power-tier cognitive profile, Observer anchor
   candidate pre-selection.
6. **The cognitive profile (Power tier).** Entirely unexplored: what persistent,
   cross-canvas model of a user's thinking style is (a) useful to the agents,
   (b) explainable to the user, (c) not creepy. Session learnings + rejection
   history + attunement trajectories are the raw material.
7. **Branching.** The deferred story is the biggest structural evolution:
   independent subtrees from anchor nodes, AI- and human-openable, and a rescue
   path for superseded offers ("valid path from [anchor] — branch here?").
   It touches node_sequence semantics, serialization, the judge's locus model,
   and the FE. Treat as a research/design track before any code.
8. **Model routing.** Everything rides Gemini 2.5 (flash / flash-lite /
   thinking budgets). The centralised `llm.ts` seam makes provider/model
   experiments cheap — e.g. does the Outer Subconscious's cross-domain leap
   improve with a stronger model, and is it worth the latency on an
   immediate-bypass path?

---

## 8. Design Invariants (Non-Negotiables)

These hold on every task; they encode the product philosophy in code review form.

1. `canAgentFire()` before every judge/agent route — never skip.
2. Tier enforcement server-side in the judge — never trust the client.
3. `canvases.original_intent` written once — never updated.
4. Agent system prompts are constants — never built from user input.
5. Agent threads are per-canvas — never per-session.
6. Shared types in `types/index.ts` — never duplicated.
7. RLS on every Supabase table.
8. No Supabase Realtime — the backend never pushes unsolicited canvas state.
9. Redis pub/sub is for AI streaming only (`spawn|chunk|done` + the
   intervention amendment `waiting|offer|withdraw`) — no canvas state over Redis.
   *(Amendment pending formal ratification — task-09.)*
10. Active rejection insights loaded before every agent call — injected as
    NEGATIVE CONSTRAINTS.
11. Ghost structure (nodes + edges) is defined by the frontend from the spawn
    descriptor — agents generate content only.
12. `@ai-sdk/google` imported only in `src/lib/llm.ts`.
13. All logging via `src/lib/logger.ts` — never bare `console.log`.

And the meta-rules for working here: think first (load the right context
files), minimum code that satisfies the requirement, surgical changes only,
every line traceable to the task.

---

## 9. Document Map

| Question | Read |
|---|---|
| Product philosophy, roles, ghost/Observer protocols | `.ai/context/CORE-CONCEPTS.md` |
| Services, deployment, env vars, auth, tiers | `.ai/context/ARCHITECTURE.md` |
| Judgement flow, pipelines, validation | `.ai/context/AGENT-PIPELINE.md` |
| Context building, tiers, threads, Observer canvas-map | `.ai/context/SERIALIZATION.md` |
| SSE / Redis protocol, spawn flag, ghost lifecycle | `.ai/context/CANVAS-SYNC.md` |
| Every table, column, RLS policy | `.ai/context/DATABASE-SCHEMA.md` |
| Model routing, thinking budgets, embeddings | `.ai/context/LLM-LAYER.md` |
| Conventions, prohibited patterns, branch naming | `.ai/context/CODING-STANDARDS.md` |
| Logging rules | `.ai/context/LOGGING.md` |
| External library docs index | `.ai/context/EXTERNAL-DOCS.md` |
| Intervention spectrum — full model + decisions log | `.ai/features/intervention-spectrum/DESIGN.md` |
| Branching design intent (deferred) | `.ai/features/branching/story.md` |
| How to add an agent / tool / pipeline / migration | `.ai/skills/*.md` |
| Task-type → context-file loading table | `CLAUDE.md` |
| Local setup, env values, run instructions | `README.md` |

---

## 10. Working the Codebase

```bash
npm install
cp .env.example .env        # fill in keys (see README §2)
npx supabase start          # local Postgres stack (Docker)
npm run migrate:local
npm run gen:types:local
npm run seed:prompts        # push prompts to Langfuse
npm run dev                 # Hono + Inngest handler (tsx watch)
npm run inngest:dev         # Inngest dev server (separate terminal)
npm run build && npm test   # tsc · vitest
```

Key env: `GOOGLE_AI_API_KEY`, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`,
`UPSTASH_REDIS_REST_URL/TOKEN`, `INNGEST_EVENT_KEY/SIGNING_KEY`,
`LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL`, `STRIPE_SECRET_KEY/WEBHOOK_SECRET`,
`FRONTEND_URL` (CORS).

Branch naming: `<type>/<short-title>-<timestamp>` per `CODING-STANDARDS.md`.
