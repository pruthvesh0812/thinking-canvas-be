---
last-verified: 2026-06-08
verified-against: ThinkingCanvas_Foundation.docx + TechnicalBuild.docx (post-architecture-update)
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
| **Observer** | Continuous + Session Complete | Bird's eye spatial map + drift detection vs north star | gemini-2.5-flash + thinking:high (`models.fast()` + `models.thinking('high')`) |
| **Outer Subconscious** | Question edge drawn (unlabeled) | Cross-domain associative leap across all human knowledge | gemini-2.5-flash + thinking:high (`models.fast()` + `models.thinking('high')`) |
| **Articulator** | Edge drawn between two existing nodes | Completes half-formed connection — 2-3 possible articulations | gemini-2.5-flash-lite (`models.content()`) |

**Infrastructure components (not content agents):**
- **Attunement Layer** — Classifies cognitive mode before Orchestrator. Model: gemini-2.5-flash (`models.fast()`, thinking:OFF)
- **Orchestrator** — Routes to correct agent. Model: gemini-2.5-flash (`models.fast()`, thinking:OFF)
- **Rejection Insights Engine** — Processes ghost rejections → negative constraints. Model: gemini-2.5-flash (`models.fast()` + `models.thinking('low')`)

---

## The AI Node Architecture

Every AI contribution is a structured ghost node pair:

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
1. **Observer Suggestions** — queued observations. Accept to canvas / Dismiss.
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
