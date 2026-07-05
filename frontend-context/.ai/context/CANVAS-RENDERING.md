---
last-verified: 2026-07-05
verified-against: TechnicalBuild.docx §6.3 (ghost visual model) + backend types/index.ts (node/edge enums)
stale-after-days: 60
---

# CANVAS-RENDERING.md

> **Load this when:** Working on React Flow setup, node/edge components, the
> ghost visual spec, edge type selection, or canvas interactions.

---

## React Flow Setup

One `<ReactFlow>` instance in `components/canvas/Canvas.tsx`. All node and edge
types are registered **once**, in module-scope constants (React Flow re-renders
everything if these objects are recreated per render):

```typescript
// Module scope — never inside the component body.
const nodeTypes = {
  humanNode: HumanNode,
  ghostContext: GhostContextNode,
  ghostQuestion: GhostQuestionNode,
} satisfies NodeTypes

const edgeTypes = {
  logicalEdge: LogicalEdge,
  doubtEdge: DoubtEdge,
  questionEdge: QuestionEdge,
  associativeEdge: AssociativeEdge,
  ghostEdge: GhostEdge,
} satisfies EdgeTypes
```

Nodes/edges come from `useCanvasStore` (real graph) merged with `useGhostStore`
(floating pending layer). Ghosts render above the canvas layer and never block
interaction with real nodes.

---

## Human vs Ghost — The Visual Contract

This table is product philosophy made visible. Do not soften it.

| Property | Human node | Ghost node (AI, pending) |
|---|---|---|
| Opacity | 100% | 40–50% |
| Border | Solid | Dashed |
| Text | Full contrast | Muted — same hue, lower contrast |
| Edge to parent | Solid | Dotted |
| Position | Permanent — part of graph | Floating, anchored to its real node |
| Interaction | Edit, connect, delete | Accept / Reject only |
| Role indicator | None | Small agent icon in corner (Expander, Articulator, …) |

**Acceptance = ownership transfer.** The ghost→real transition (opacity to
100%, dashed to solid, dotted edge to solid) is the moment cognitive ownership
moves to the human. Make it a visible animation, not an instant swap.

**Appreciation exception:** arrives at full opacity with no reject button — an
observation to acknowledge, not a suggestion to own.

**Accepted AI nodes** are real nodes with `owner: 'ai'` — full opacity and
solid border like human nodes, but keep a subtle persistent marker (e.g. the
role icon) so human and AI contributions stay visually distinguishable forever.

---

## Node Components

### HumanNode
- Inline-editable text (edit on double-click or immediately after creation).
- Source + target handles for edge drawing.
- Creation flow: click empty canvas (or keyboard `n`) → empty node in edit mode
  → **persist on first content blur**, not on keystroke (see STATE-MANAGEMENT).

### GhostContextNode / GhostQuestionNode
- Render streamed text as it arrives (`chunk` appends) — no layout jank as the
  node grows; fix a max-width and let height flow.
- Show `GhostControls` (accept/reject per node) only after `done`.
- The context node shows its `node_type` label (reframe/mirror/…) + agent icon.

---

## Edge Types

| Edge type | Component | Visual | Meaning / backend effect |
|---|---|---|---|
| `logical` | LogicalEdge | solid line | standard reasoning step |
| `doubt` | DoubtEdge | dashed stroke | "I'm not sure this follows" |
| `question` | QuestionEdge | **pulsing** animation | an open question — fires Outer Subconscious immediately |
| `associative` | AssociativeEdge | light/curved | loose association |
| ghost | GhostEdge | dotted, muted | connects ghosts; never user-drawable |

The question edge pulse is a promise to the user: "the AI may answer this."
Keep it subtle but unmistakable.

### EdgeTypeSelector

On `onConnect`, show a small popover at the connection point: `logical / doubt /
question` (associative reserved for AI-drawn edges in v1). The edge is written
to Supabase only after the type is chosen; Escape cancels the connection.

### both_existing — set at draw time

```typescript
// True ⇔ the user drew this edge between two nodes that both already existed
// on the canvas (a retrospective connection). False when the edge is created
// as part of spawning a new child node. The backend routes the Articulator on
// this flag and never recomputes it — get it right at write time.
const both_existing = !connectionCreatedNewNode
```

---

## Canvas Interactions (MVP)

| Interaction | Behaviour |
|---|---|
| Pan / zoom | React Flow defaults (wheel + drag) |
| Create node | click empty canvas / `n` |
| Edge mode | drag from handle / `e` |
| Cancel | `esc` — cancels edit or pending connection |
| Delete | only human-owned elements; deleting is a Supabase write like any other (⚠ backend has no delete event yet — API-CONTRACT Known Gap #3) |
| Layout | manual positions, persisted; no auto-layout in MVP |

`DebounceIndicator`: a subtle pulsing dot near the most recently created node —
"AI is reading what you just built." Show it after a node/edge write; clear it
when a spawn arrives or the user resumes creating. Never intrusive, never blocking.

`NorthStarHeader`: fixed header showing `canvases.original_intent` for the whole
session. Read-only, always visible — it is the north star, not a form field.

---

## What NOT to Do

```
❌ Recreate nodeTypes/edgeTypes objects inside a component render
❌ Let ghosts block or capture interactions meant for real nodes
❌ Auto-layout or reposition the user's nodes without their action
❌ Render AI text at full contrast while still pending
❌ Give ghosts edit handles, drag handles, or connect handles
❌ Add a ghost stacking model — one pair per real node, replacement only
```
