---
last-verified: 2026-06-17
verified-against: ThinkingCanvas_TechnicalBuild.docx (post Observer-structure redesign)
stale-after-days: 30
---

# AGENT-PIPELINE.md

> **Load this when:** Creating/modifying agents, Inngest functions, Orchestrator routing, Attunement Layer, debounce logic, Redis spawn flow, Rejection Insights Engine, or Multi-Canvas threading.

---

## Full Pipeline Flow

```
User action on canvas
  │
  ├── User writes node/edge → frontend writes directly to Supabase (no backend involved)
  │
  └── User pauses → POST /api/canvas-event (Hono)
        └── Backend reads node from Supabase (by node_id from payload)
        └── Generate directional summary → nodes.summary (gemini-2.5-flash)
        └── Generate embedding → nodes.embedding (gemini-embedding-2)
        └── inngest.send("canvas/node.created", { canvas_id, session_id, node_id })

Inngest worker
  │
  ├── agent-pipeline [debounced 10s by session_id]
  │     │
  │     ├── Step 1: Attunement Layer (gemini-2.5-flash, thinking:OFF)
  │     │     Reads last 3-5 nodes from this session via Supabase
  │     │     Output: { cognitive_mode, question_style, phase_shift_suggested }
  │     │     Writes: attunement_state to Supabase
  │     │
  │     ├── Step 2: canAgentFire() check
  │     │     Query canvas-scoped thread for pending ghost on trigger_node_id
  │     │     If pending → drop silently. No response.
  │     │
  │     ├── Step 3: Orchestrator (gemini-2.5-flash, thinking:OFF)
  │     │     Input: attunement_state + canvas signals + subscription tier
  │     │     Output: { route, question_style }
  │     │
  │     ├── Step 4: Build SpawnDescriptor + publish SPAWN to Redis
  │     │     Pre-assigns ghost_ids (client-side UUIDs)
  │     │     redis.publish(`canvas:stream:${sessionId}`, {type:'spawn', descriptor})
  │     │
  │     ├── Step 5: Inngest sleep 1500ms (frontend animates ghost frames)
  │     │
  │     ├── Step 6: Load canvas-scoped agent_thread + serialize
  │     │     Apply tiered node-anchored format (per-agent rules)
  │     │     Inject active rejection_insights as NEGATIVE CONSTRAINTS block
  │     │
  │     ├── Step 7: Agent streams (model per LLM-LAYER.md routing)
  │     │     for await (token of agent.stream(context))
  │     │       redis.publish(..., {type:'chunk', target:context_ghost_id, data:token})
  │     │     (then question node tokens if present)
  │     │
  │     └── Step 8: Publish DONE + save thread
  │           redis.publish(..., {type:'done'})
  │           Append to canvas agent_thread + save to Supabase
  │           Decrement temporal_deferral turns_remaining
  │
  ├── articulator-pipeline [immediate — no debounce]
  │     Event: canvas/edge.existing-nodes (both_existing=true)
  │     Skips Attunement + Orchestrator
  │     Articulator directly → spawn + stream
  │
  ├── outer-sub-pipeline [immediate — no debounce]
  │     Event: canvas/edge.question (edge_type='question')
  │     Outer Subconscious → spawn + stream
  │
  └── rejection-insights [immediate — no debounce]
        Event: canvas/ghost.rejected
        gemini-2.5-flash classifies → severity + insight_points
        Saves to rejection_insights table
        Updates agent_threads.active_rejection_insight_ids
```

---

## Orchestrator Routing Rules (priority order)

```typescript
1. edge between existing nodes (both_existing=true, NOT question) → ARTICULATOR (immediate)
2. edge_type === 'question'                                        → OUTER_SUBCONSCIOUS (immediate)
3. attunement.phase_shift_suggested && phase === 'diverging'       → EXPANDER (bridging)
4. phase === 'converging' && last_action === 'node_created'        → STRESS_TESTER
5. phase === 'diverging'  && last_action === 'node_created'        → EXPANDER
6. always in background (queued, not interrupting)                 → OBSERVER
```

---

## SpawnDescriptor

Built in Step 4 before the agent is called. Ghost IDs are pre-assigned so the frontend can create the structure immediately.

```typescript
// src/streaming/spawn.ts
function buildSpawnDescriptor(params: {
  trigger_node_id: string
  session_id: string
  agent_role: AgentRole
  context_node_type: ContextNodeType
  has_question_node: boolean
}): SpawnDescriptor {
  const context_ghost_id = crypto.randomUUID()
  const question_ghost_id = params.has_question_node ? crypto.randomUUID() : undefined

  return {
    trigger_node_id: params.trigger_node_id,
    session_id: params.session_id,
    context_node: {
      ghost_id: context_ghost_id,
      node_type: params.context_node_type,
      agent_role: params.agent_role,
    },
    context_edge: {
      edge_type: 'logical',
      from: params.trigger_node_id,
      to: context_ghost_id,
    },
    ...(question_ghost_id && {
      question_node: { ghost_id: question_ghost_id, node_type: 'question' },
      question_edge: { edge_type: 'logical', from: context_ghost_id, to: question_ghost_id },
    })
  }
}
```

---

## Rejection Insights Injection

Before serializing thread for any agent, check `agent_threads.active_rejection_insight_ids`. Load active insights and prepend to serialized context:

```
NEGATIVE CONSTRAINTS (active):
[HARD BLOCK]           Avoid high-level analogies  (seq:14, Too Abstract)
[APPROACH PIVOT]       Keep insight, simplify       (seq:11, Too Technical)
[DEFERRAL — 2 turns]   Pause convergence framing    (seq:9,  Skip for now)
```

After each agent turn: decrement `turns_remaining` for temporal deferrals. Set `active=false` when `turns_remaining=0`.

The Observer additionally receives an OBSERVER CONNECTION FEEDBACK block, built
from `rejection_insights` rows where `target_edge_id` is set (see "Observer
Structure" below + SERIALIZATION.md → Observer Connection Feedback).

---

## Observer Structure

The Observer is not a ghost-pair agent — `runObserver()` (`src/agents/observer.ts`)
calls `.generate()` against a Zod schema instead of `.stream()`ing prose, and
returns `{ anchor_node_ids, nodes, edges }` (or `null` when discarded) with
labels already remapped to backend-assigned `crypto.randomUUID()` ghost IDs
(never trust LLM-emitted IDs — same rule as SpawnDescriptor below).

```
runObserver() output (ObserverObservation | null):
  anchor_node_ids: string[]            — existing canvas nodes to highlight
  nodes: ObservationNode[]             — { ghost_id, level, node_type, content }
  edges: { from_id, to_id }[]          — from_id is an anchor id OR another node's ghost_id
```

### Validation (in `runObserver`, before ghost IDs are minted)

`validateObservation()` rejects malformed LLM output:
- **Anchors** must be real nodes ON THIS CANVAS — fetched + canvas-checked
  against the DB (the service-role client bypasses RLS, so the check is manual).
- **Every edge endpoint** must resolve: `to` to a known node label, `from` to a
  known node label OR a validated anchor id. No silent fallthrough.
- **Strict level-+1**: anchor→level0, level k→level k+1 only. Monotonic levels
  make the graph acyclic by construction (a cycle would need a level > itself)
  and forbid level-skips — no separate cycle walk needed.
- **Exactly one level-0 node**; every observation node has ≥1 incoming edge (no orphans).

### Persistence + interaction (once the pipeline/route is built — features 8-10, not yet started)

```
1. INSERT observer_structures  { canvas_id, session_id, thread_id, anchor_node_ids, nodes }
2. INSERT observer_edges       one row per edge, structure_id = the row above, status='pending'
3. Frontend highlights anchor_node_ids; hover reveals the structure from observer_edges
4. ACCEPT (local, committal): mark edge accepted → node at to_id crosses into canvas (if not already there)
5. REJECT (re-think trigger, NOT a local delete):
     a. user supplies connection_feedback (not_related|wrong_direction|too_indirect|already_obvious)
     b. INSERT rejection_insights with target_edge_id + connection_feedback set,
        rejection_reason left null (see DATABASE-SCHEMA.md → rejection_insights)
     c. tear down the PENDING structure (already-accepted nodes stay committed)
     d. re-invoke runObserver({ rethink: { previous, rejected_edge, reason } })
        → revised structure (rejected reference dropped, affected node rewritten), or
        → null (observation discarded)
```

Feedback is per-edge, but a rejection reconsiders the whole observation — the
Observer's worst failure mode is a false cross-branch pattern, so one bad
connection should make it re-think, not just lose one link.

---

## canAgentFire()

```typescript
// src/lib/guards.ts
async function canAgentFire(
  canvasId: string,
  agentRole: AgentRole,
  triggerNodeId: string
): Promise<boolean> {
  const thread = await db.threads.getByCanvas(canvasId, agentRole)
  if (!thread) return true

  return !thread.messages.find(msg =>
    msg.role === 'assistant' &&
    msg.ghost_pair.triggered_by_node_id === triggerNodeId &&
    msg.ghost_pair.pair_status === 'pending'
  )
}
```

---

## Multi-Canvas Thread Architecture

Threads are per-CANVAS — not per-session. Session boundary markers are injected at session start:

```typescript
// Session boundary UserMessage (injected when new session starts on existing canvas)
{
  role: 'user',
  turn_type: 'session_boundary',
  content: `[SESSION 3 STARTED]
  Canvas north star: "${canvas.original_intent}"
  Previous session (2): 12 nodes. Closed.
  New session begins. Fresh node_sequence.`
}
```

Cursor tools (`get_content`, `traverse_trail`, etc.) query by `canvas_id` — they see ALL nodes across sessions.

---

## Ghost Status Lifecycle

```
pending → accepted | rejected | context_accepted | question_accepted
pending + 2 nodes created without interaction → ignored
```

On rejection: fire `canvas/ghost.rejected` Inngest event immediately.
Backend updates thread AssistantMessage status.
No Realtime broadcast — single-user, nothing else to notify.

---

## Cursor Tools Reference

| Tool | File | Used by |
|---|---|---|
| `get_content` | `src/tools/get-content.ts` | All agents |
| `get_window` | `src/tools/get-window.ts` | Expander, Observer |
| `traverse_trail` | `src/tools/traverse-trail.ts` | Expander, Articulator |
| `get_big_picture` | `src/tools/get-big-picture.ts` | Observer |
| `get_siblings` | `src/tools/get-siblings.ts` | Observer |
| `get_path` | `src/tools/get-path.ts` | Articulator |
| `get_branch` | `src/tools/get-branch.ts` | Stress-Tester |
| `semantic_promote` | `src/tools/semantic-promote.ts` | Expander, Stress-Tester |

All tools query with `canvas_id` — they see all sessions.
`semantic_promote` uses gemini-embedding-2 cosine search (pgvector). Deduplication: skips nodes already at full content in thread.
