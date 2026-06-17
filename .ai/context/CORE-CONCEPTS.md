---
last-verified: 2026-06-17
verified-against: ThinkingCanvas_Foundation.docx + TechnicalBuild.docx (post Observer-structure redesign)
stale-after-days: 90
---

# CORE-CONCEPTS.md

> **Load this when:** Any task involving agents, canvas behaviour, node/edge logic, ghost nodes, Multi-Canvas model, Rejection Insights, or the AI collaboration model.

---

## The Prime Directive

AI augments human cognition — never replaces it. Every design decision flows from this.

**The ownership split:**
- Human owns: the goal, the intent, the convergence click, which path to take
- AI owns: expansion, stress-testing, spatial awareness, cross-domain leaps, articulation

**The test for every AI contribution:** Does this require a cognitive response from the human? If the human can accept it without thinking, it has failed.

---

## Multi-Canvas Workspace Model

```
User
  └── Canvas (permanent container — never deleted)
        ├── original_intent (THE NORTH STAR — immutable after creation)
        ├── title
        └── Sessions (episodic thinking runs)
              └── Session
                    ├── start_time / end_time
                    ├── status: active | closed
                    ├── node_sequence: UUID[] — ONLY nodes created in THIS session, in order
                    └── current_phase: diverging | converging
```

**Critical distinctions:**
- `nodes.canvas_id` → node belongs to canvas, visible across ALL sessions
- `nodes.session_id` → which session created this node
- `sessions.node_sequence` → the ordered thinking trail for THIS session only
- `agent_threads` → per CANVAS, not per session. Accumulates knowledge across sessions.
- `original_intent` lives on `canvases`, NOT on sessions. One north star per canvas forever.

---

## The Five AI Roles

| Role | Activation Signal | Job | Model |
|---|---|---|---|
| **Expander** | New node in diverge phase | Opens 1-2 cognitive jumps ahead along the trail direction | gemini-2.5-flash-lite (`models.content()`) |
| **Stress-Tester** | Phase switches to converging | Finds gaps, weak assumptions, contradictions | gemini-2.5-flash-lite (`models.content()`) |
| **Observer** | Continuous + Session Complete | Bird's eye spatial map + drift detection vs north star — highlights anchor nodes + a hierarchical structure, never writes a ghost pair directly (see "The Observer Structure" below) | gemini-2.5-flash + thinking:high (`models.fast()` + `models.thinking('high')`) |
| **Outer Subconscious** | Question edge drawn (unlabeled) | Cross-domain associative leap across all human knowledge | gemini-2.5-flash + thinking:high (`models.fast()` + `models.thinking('high')`) |
| **Articulator** | Edge drawn between two existing nodes | Completes half-formed connection — 2-3 possible articulations | gemini-2.5-flash-lite (`models.content()`) |

**Infrastructure components (not content agents):**
- **Attunement Layer** — Classifies cognitive mode before Orchestrator. Model: gemini-2.5-flash (`models.fast()`, thinking:OFF)
- **Orchestrator** — Routes to correct agent. Model: gemini-2.5-flash (`models.fast()`, thinking:OFF)
- **Rejection Insights Engine** — Processes ghost rejections → negative constraints. Model: gemini-2.5-flash (`models.fast()` + `models.thinking('low')`)

---

## The AI Node Architecture

Every AI contribution from Expander, Stress-Tester, Articulator, and Outer
Subconscious is a structured ghost node pair:

```
Context Node (one of 6 types) + Question Node (mandatory except Appreciation)
```

| Context Type | Triggered When | Question Node? |
|---|---|---|
| reframe | User named something correctly but hasn't seen its full significance | Mandatory |
| mirror | User expressed something powerfully — reflect at higher fidelity | Mandatory |
| pattern | Two+ prior nodes converging — user hasn't noticed | Mandatory |
| reference | User circling a concept with a precise name elsewhere | Mandatory |
| contradiction | Current node pulls against something in prior node | Mandatory |
| appreciation | Genuine breakthrough moment — let it land | Optional — agent decides |

**Ghost node rules:**
- 40-50% opacity, dashed border — float above canvas
- One ghost pair per real node maximum
- Accept = both nodes cross threshold into canvas
- Reject = both disappear (triggers Rejection Insights Engine)
- No auto-fade — ghost waits until human acts
- Progressive appearance: spawn signal → 1.5s animation → token streaming via SSE

**The Observer is the exception** — it never writes a ghost pair into a
thread. See "The Observer Structure" below.

---

## The Observer Structure

The Observer doesn't propose a sentence the user can accept or reject as a
unit — it highlights existing canvas nodes and lets the user pull on the
thread themselves.

```
1. Observer picks one or more EXISTING canvas nodes as anchors and highlights them.
2. User hovers an anchor → the proposed structure reveals itself (still ghost-state).
3. Structure is a DAG of observation nodes, in levels:
     level 0 — exactly ONE node, bridging directly from the anchor(s)
     level k (k>=1) — 1 to n nodes; a level-k node may fan into one shared
       level-(k+1) node or several, and a level-(k+1) node may converge
       from one level-k node or several
   Every edge goes STRICTLY one level deeper (anchor→level0, level k→level k+1).
   This monotonicity makes the graph acyclic by construction and forbids
   level-skips. Most observations need only level 0 — deeper levels exist only
   when the insight takes more than one cognitive jump to reach.
4. The user accepts or rejects each EDGE individually (anchor→observation,
   observation→observation) — there is no accept/reject on the structure as a
   whole. Feedback granularity is per-edge.
5. ACCEPT is per-edge, but an observation node is the genuine synthesis of
   EVERY reference into it, so it only crosses into the real canvas once ALL of
   its incoming edges are accepted. Node content is never hedged to survive a
   missing reference — if a reference doesn't belong, the observation is wrong,
   not partially right.
6. REJECT is NOT a local delete — it is a re-think trigger, and it BATCHES. The
   user may flag one OR MORE references as improper, each with a reason; the
   structure stays on screen while they flag (rejecting one edge must not make
   the rest vanish before the user has judged them). Once the user is done, the
   entire PENDING structure is torn down and the Observer is re-invoked with the
   prior structure + ALL rejected references + reasons (RE-THINK MODE,
   `runObserver({ rethink })`). It then either:
     - re-emits a revised structure with every rejected reference dropped and
       each affected node rewritten as a genuine synthesis of the references
       that remain, or
     - discards the observation entirely (`runObserver` returns null) when
       dropping the rejected references leaves it hollow.
   Example: 3 anchor edges fan into one level-0 node; the user rejects edges 2
   and 4. The whole structure disappears once they finish flagging. If the
   observation still holds on the remaining references, the Observer rewrites
   that node referencing only those; if what's left is hollow, it is discarded.
   (Already-accepted nodes from step 5 are committed and unaffected — only the
   pending remainder is torn down.)
```

**Validation:** the Observer's claimed structure is checked before any ghost ID
is minted — anchors must be real nodes on this canvas, every edge endpoint must
resolve, and edges must obey the strict level-+1 rule (see AGENT-PIPELINE.md →
Observer Structure validation). LLM-emitted IDs are never trusted.

**Edge rejection feedback is its own category**, distinct from the Rejection
Insights Engine's content reasons (`too_abstract`/`too_technical`/`skip_for_now`)
— it tells the Observer WHY that specific connection didn't hold, not whether
the wording was off: `not_related | wrong_direction | too_indirect | already_obvious`.
Stored on `rejection_insights` via `target_edge_id` + `connection_feedback`
(see DATABASE-SCHEMA.md → rejection_insights), and injected only into the
Observer's own prompt as an OBSERVER CONNECTION FEEDBACK block (see
SERIALIZATION.md → Observer Connection Feedback).

Persisted in `observer_structures` (one row per Observer invocation, holding
the anchors + the full node list) and `observer_edges` (one row per
individually-resolvable edge — see DATABASE-SCHEMA.md).

---

## Rejection Insights Engine

When a user rejects a ghost, they select a reason. An Inngest function processes the rejection and generates structured negative constraints (Insight Points) injected into subsequent agent system prompts.

```
Rejection Reason → Severity → Insight Points → Injection
Too Abstract    → hard_block           → "Avoid high-level analogies"     → Blocked completely
Too Technical   → approach_pivot       → "Keep essence, simplify"         → Changed approach
Skip for now    → temporal_deferral    → "Pause theme for 3 turns"        → Temporary cooldown
```

Insight Points stored in `rejection_insights` table. Active constraints referenced via `agent_threads.active_rejection_insight_ids`. Injected as NEGATIVE CONSTRAINTS block in subsequent system prompts.

---

## Adaptive Attunement

The Attunement Layer reads the QUALITY of thinking, not just the content:

- **Exploratory** → Expander uses opening questions ("what if", "what else")
- **Transitional** → Expander uses bridging questions (sensing convergence)
- **Declarative** → Expander uses closing questions ("what specifically", "what breaks this")

The transition is never declared by the user — read from language quality + node velocity by Gemini 2.5 Flash. This is the system's most important behavioural feature.

---

## The Directed Graph Data Model

```
Canvas (permanent)
  ├── original_intent (immutable)
  └── Sessions (episodic)
        ├── node_sequence: [nodeId_1, nodeId_4, nodeId_7] — this session's trail
        └── Nodes (belong to canvas, created in session)
              ├── owner: human | ai
              ├── direction_marker: establishes | questions | contradicts | explores
              ├── summary: directional sentence (gemini-2.5-flash at save)
              └── embedding: vector/3072 (gemini-embedding-2 at save)
        └── Edges
              ├── edge_type: logical | doubt | question | associative
              └── both_existing: boolean (triggers Articulator when true)
```

---

## The Debounce Contract

- Fires on **pauses**, not on every event
- Default: 10 seconds (first 5 nodes)
- After 5 nodes: velocity-adaptive (1.5x avg gap, min 8s, max 25s)
- **Immediate bypass:** question edges + edges between existing nodes
- `canAgentFire()` checked before routing — blocks if pending ghost exists for that node

---

## Session Complete Flow

Three screens, human-triggered (never automatic):
1. **Observer Suggestions** — queued Observer structures from this session. Hover an
   anchor to reveal it, accept/reject each edge individually (see "The Observer
   Structure" above) — not an accept/dismiss on the structure as a whole.
2. **Unresolved Threads** — question edges, contradictions, empty nodes. Carry Forward / Discard.
3. **Session Closed** — carry-forwards written to `session_learnings`.

---

## Atomic DB Operations

Three Postgres functions handle values that must be updated based on their current state. Never use read-modify-write in application code for these — concurrent Inngest workers will silently drop each other's writes.

| Function | Table | Why atomic |
|---|---|---|
| `append_thread_message(thread_id, message)` | `agent_threads.messages` | Multiple agents share one thread per canvas and append concurrently |
| `append_node_to_sequence(session_id, node_id)` | `sessions.node_sequence` | Rapid node creation fires simultaneous events; order must be preserved |
| `decrement_insight_turns(insight_id)` | `rejection_insights.turns_remaining` | Decrement + auto-deactivate must happen in one statement or a turn slips through |

Call via `db.rpc(fn_name, params)`. Never inline the array/JSONB append logic in `src/db/*.ts`.

---

## Pricing Tiers

| Tier | Agents Available |
|---|---|
| Free | Expander + Articulator only |
| Pro ($19/month) | All 5 agents + Rejection Insights + Session Complete learnings |
| Power ($39/month, v1.5) | All agents + cognitive profile |
