---
last-verified: 2026-06-08
verified-against: ThinkingCanvas_TechnicalBuild.docx, Section 07 (post-architecture-update)
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
| Rejection Insights block | Yes — always first | Yes | Yes | No | No (stateless) |
| North star (canvas-level) | Full | Full | Full | Full | Full |
| Click moment | Full if exists | Full — critical | Full if exists | No | No |
| Active node | Full + attunement | Full | Summary only | Full (both) | Full (both endpoints) |
| Recent (3) | Full content | Full + flag contradictions | Summary only | Full both trails | No trail |
| Mid (4-10) | Summary + marker | Summary + FLAG contradictions | Summary only | N/A | No |
| Compressed (10+) | Trail + markers | Extract contradictions | Trail only | N/A | No |
| Attunement | Yes | No | No | No | No |
| Ghost history | Own only | None | Summary | None | None |
| Thread type | Canvas-stateful | Canvas-stateful | Canvas-stateful | Canvas-stateful | Stateless per edge |

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
