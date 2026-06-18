---
last-verified: 2026-06-18
verified-against: ThinkingCanvas_TechnicalBuild.docx, Section 07 (post Observer canvas-map context model)
stale-after-days: 30
---

# SERIALIZATION.md

> **Load this when:** Working on the serializer, thread compression, context window management, directional summaries, semantic_promote, or Rejection Insights injection.

---

## Why This Exists

LLMs have one linear context window. Raw JSON loses graph structure. The serializer converts typed thread messages into structured text that preserves spatial topology, cognitive direction, and ghost interaction history — without bloating context.

**The rule:** Never send raw JSON to an agent. Always serialize first.

---

## Rejection Insights Block (injected before trail)

Always check `agent_threads.active_rejection_insight_ids` before serializing. Load active insights from `rejection_insights` table and inject BEFORE the trail content:

```
NEGATIVE CONSTRAINTS (active — do not violate):
─────────────────────────────────────────────
[HARD BLOCK]           Avoid high-level analogies and metaphors
                       Source: seq:14, reason: Too Abstract
[APPROACH PIVOT]       Keep core insight, simplify language and framing
                       Source: seq:11, reason: Too Technical
[DEFERRAL — 2 turns]   Pause convergence framing theme this session
                       Source: seq:9, reason: Skip for now
─────────────────────────────────────────────
```

Temporal deferrals decrement `turns_remaining` after each agent turn. When `turns_remaining=0`, set `active=false`.

### Observer Connection Feedback (Observer only — injected after NEGATIVE CONSTRAINTS)

The Observer doesn't write ghost pairs — it proposes a structure of edges, each
individually accepted/rejected by the user. Rejected edges produce a SEPARATE
category of `rejection_insights` row (`target_edge_id` + `connection_feedback`
set, `rejection_reason` null — see DATABASE-SCHEMA.md → rejection_insights).
`buildRejectionBlock(canvas_id, agentRole)` renders these as their own block,
and only when `agentRole === 'observer'`:

```
OBSERVER CONNECTION FEEDBACK (active — do not repeat these connections):
─────────────────────────────────────────────
[APPROACH PIVOT]       These two nodes are not actually related this way
                       Source: seq:22, reason: Not Related
[HARD BLOCK]           Needs an intermediate bridge node — don't jump directly
                       Source: seq:25, reason: Too Indirect
─────────────────────────────────────────────
```

`connection_feedback` values: `not_related | wrong_direction | too_indirect | already_obvious`.

---

## Node-Anchored Format

Each node is self-contained — connections and content co-located. No separate topology + content blocks.

```
[seq:16 | nodeId_abc | contradicts | ★ACTIVE]
CONTENT: "full node content"
INCOMING: [seq:15 | establishes] ──logical──▶ "summary of node 15"
OUTGOING: none yet
```

---

## Multi-Canvas Session Context

The thread spans sessions. Add session boundary context at the start of each new session:

```
╔═══════════════════════════════════════════════╗
║ CANVAS NORTH STAR [canvas_id | ANCHOR]        ║
║ "original_intent — immutable north star"       ║
╚═══════════════════════════════════════════════╝

─── SESSION BOUNDARY: Session 3 started ───────
  Previous session (Session 2): 12 nodes, closed.
  This session (Session 3): 0 nodes so far.
────────────────────────────────────────────────
```

The north star anchor is CANVAS-level — it never changes across sessions.

---

## Observer Context Model (bird's-eye, not recency-tiered)

The 4-tier system below is a recency/linearization model — right for the
conversational agents, wrong for the Observer. The Observer's job is
cross-session, cross-branch drift and pattern detection, which means the
material it most needs (older nodes, sibling branches) is exactly what the
tiers compress away or drop, and the canvas itself is a branching DAG that
tiering forces into a single line.

Instead, `SerializationRule.threadType: 'canvas-map'` (Observer only) routes
through `serializeCanvasMap()` in `src/serializer/index.ts`, which bypasses
`classifyTiers()` and the Tier 1–4 formatters entirely. It builds the
Observer's context from three blocks, all read fresh from source tables —
never reconstructed from the agent's own thread log, so the view can't go
stale or miss a branch the thread didn't happen to record:

1. **CANVAS MAP** — every node on the canvas (`getAllByCanvas`), grouped by
   session, summary-only, with full INCOMING/OUTGOING edge lines per node
   (`getEdgesByCanvas`). This is the spatial picture — the whole graph, briefly.
2. **CURRENT FOCUS** — the last 5 nodes (`getRecentNodes`), oldest first, with
   the node that triggered this Observer run flagged `★TRIGGER`. A light
   recency pointer on top of the full map — "where attention is right now" —
   not a replacement for it.
3. **PAST OBSERVATIONS** — the Observer's own prior structures
   (`getStructuresByCanvas` / `getEdgesByStructure`), each node shown with its
   per-edge accept/reject outcome so the Observer doesn't repeat a
   structure the user already worked through. Empty until pipeline write
   support for `observer_structures`/`observer_edges` lands (features 8–10).

Order: north star → NEGATIVE CONSTRAINTS / OBSERVER CONNECTION FEEDBACK →
CANVAS MAP → CURRENT FOCUS → PAST OBSERVATIONS.

```
════════════════════════════════════════════════
CANVAS MAP (all sessions — summary only)
─── session a1b2c3d4 ───
[seq:3 | nodeId_abc | establishes]
  "establishes: convergence is felt internally"
  INCOMING: none yet
  OUTGOING: ──contradicts──▶ seq:7
════════════════════════════════════════════════

────────────────────────────────────────────────
CURRENT FOCUS (most recent activity)
[seq:7 | nodeId_xyz | contradicts | ★TRIGGER]
  "contradicts: recognition isn't a decision"
────────────────────────────────────────────────

────────────────────────────────────────────────
PAST OBSERVATIONS (this canvas)
[structure:f00dca7e | anchors: nodeId_a, nodeId_b]
  (level 0, pattern) "..." — accepted
────────────────────────────────────────────────
```

For cursor tools (`get_big_picture`, `get_siblings`, `traverse_trail`,
`get_content`) the Observer still calls at runtime to drill into a specific
branch or pull full content for one node — the map above is the standing
context, tools are for follow-up. Drill-down depth still uses the same
node-anchored format as the tiers below (e.g. `get_big_picture`'s output).
`options.triggerNodeId` on `serialize()` is only consumed by this path —
the existing 3-argument call signature still works for every other agent.

---

## Tier Formats

### Tier 0 — Anchor
```
╔══════════════════════════════════════════════╗
║ CANVAS NORTH STAR [canvas_id | ANCHOR]       ║
║ "full original intent"                       ║
╚══════════════════════════════════════════════╝
```

### Tier 1 — Active
```
────────────────────────────────────────────────
[seq:16 | nodeId_abc | contradicts | ★ACTIVE]
CONTENT: "full text"
INCOMING: [seq:15 | establishes] ──logical──▶ "summary"
ATTUNEMENT: transitional | question_style: bridging | confidence: 0.81
MY LAST RESPONSE [triggered by seq:15]:
  [contradiction] "..." STATUS: ⧗ PENDING (1 node created while pending)
────────────────────────────────────────────────
```

### Tier 2 — Recent (last 3)
```
────────────────────────────────────────────────
[seq:14 | nodeId_def | establishes]
CONTENT: "full text"
INCOMING: seq:13 ──doubt──▶ | OUTGOING: ──▶ seq:16
MY RESPONSE: [reframe] ✓ ACCEPTED → [question] ✗ REJECTED
REJECTION: "too_abstract" → insight injected in NEGATIVE CONSTRAINTS
────────────────────────────────────────────────
```

### Tier 3 — Mid (turns 4-10)
```
────────────────────────────────────────────────
[seq:10 | nodeId_ghi | questions]
SUMMARY: "questioned what triggers convergence click"
INCOMING: seq:9 ──logical──▶ | OUTGOING: ──▶ seq:11
RESPONSE: [pattern] context:✓ question:✓
────────────────────────────────────────────────
```

### Tier 4 — Compressed (blocks of 5)
```
════════════════════════════════════════════════
[COMPRESSED | seq:1-5 | nodes: id1,id2,id3,id4,id5]
TRAIL:
[seq:1 | establishes] ──logical──▶
[seq:2 | establishes] ──logical──▶
[seq:3 | questions]   ──doubt──▶
[seq:5 | establishes] ──logical──▶ seq:6
DIRECTION: "Established convergence is felt — questioned trigger"
RESPONSE PATTERN: accepted:3 rejected:1 | 1 rejection → hard_block active
════════════════════════════════════════════════
```

---

## Per-Agent Serialization Rules

| Rule | Expander | Stress-Tester | Observer | Articulator | Outer Sub |
|---|---|---|---|---|---|
| Rejection Insights block | Yes — always first | Yes | Yes + own OBSERVER CONNECTION FEEDBACK block | No | No (stateless) |
| North star (canvas-level) | Full | Full | Full | Full | Full |
| Click moment | Full if exists | Full — critical | Full if exists | No | No |
| Context model | Recency tiers | Recency tiers | **Canvas map** (see below) | Recency tiers | Active node only |
| Active node | Full + attunement | Full | n/a — see canvas map | Full (both) | Full (both endpoints) |
| Recent (3) | Full content | Full + flag contradictions | n/a — see canvas map | Full both trails | No trail |
| Mid (4-10) | Summary + marker | Summary + FLAG contradictions | n/a — see canvas map | N/A | No |
| Compressed (10+) | Trail + markers | Extract contradictions | n/a — see canvas map | N/A | No |
| Attunement | Yes | No | No | No | No |
| Ghost history | Own only | None | n/a — own structures shown in PAST OBSERVATIONS | None | None |
| Thread type | Canvas-stateful | Canvas-stateful | **Canvas-map** | Canvas-stateful | Stateless per edge |

**Observer bypasses the tiers above entirely.** Its rule has
`threadType: 'canvas-map'`, which routes `serialize()` through
`serializeCanvasMap()` instead of the Tier 1–4 pipeline — see
"Observer Context Model" above for the CANVAS MAP / CURRENT FOCUS /
PAST OBSERVATIONS blocks it receives instead.

**Observer output is structured, not prose.** `runObserver()` calls `.generate()`
with a Zod schema (`{ anchor_node_ids, nodes: [{label, level, node_type, content}],
edges: [{from, to}] }`), not `.stream()`. There is no `[NODE_TYPE]`/`[QUESTION]`
text format — see CORE-CONCEPTS.md → The AI Node Architecture and
AGENT-PIPELINE.md → Observer Structure for how this gets persisted. Its thread
turn is also its own `ThreadMessage` variant — `turn_type: 'observer_structure'`,
distinct from `ghost_pair` — since it points at a structure_id rather than a
ghost pair (see types/index.ts → ThreadMessage and CODING-STANDARDS.md for the
exhaustiveness-guard convention this requires of any future variant).

---

## Directional Summary Generation

Generated once on node save by Gemini 2.5 Flash (thinking:low). Never at query time.

```
Prompt: "Summarize in exactly one sentence.
Begin with: establishes | questions | contradicts | explores
Max 15 words after the marker.
BAD: 'The user wrote about convergence'
GOOD: 'establishes: convergence is felt internally — recognition not decision'"
```

Stored as `nodes.summary` + `nodes.direction_marker`.

---

## Semantic Promote

Uses `gemini-embedding-2` cosine search (3072-dim vectors).

Only promotes nodes NOT already at full content in thread:
- Tier 1 (active) or Tier 2 (recent) → full content present → skip
- Tier 3 (mid) or Tier 4 (compressed) → summary only → promote

Injected as temporary context block — NOT appended to thread permanently.

---

## Pre-Computation Pipeline

On every node save (in order):

```
1. content → nodes.content
2. gemini-2.5-flash (thinking:low) → nodes.summary + nodes.direction_marker
3. gemini-embedding-2 → nodes.embedding (VECTOR(3072)) → pgvector
```

Never regenerate unless content is edited. One summary + one embedding per node save.
