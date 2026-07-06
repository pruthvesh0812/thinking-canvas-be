---
last-verified: 2026-07-05
verified-against: backend CORE-CONCEPTS.md (2026-06-18) + TechnicalBuild.docx §6.3 (ghost visual model)
stale-after-days: 90
---

# CORE-CONCEPTS.md

> **Load this when:** Any task involving canvas behaviour, node/edge logic, ghost
> nodes, the Multi-Canvas model, session phases, or the AI collaboration model.

---

## The Prime Directive

AI augments human cognition — never replaces it. Every design decision flows from this.

**The ownership split:**
- Human owns: the goal, the intent, the convergence click, which path to take
- AI owns: expansion, stress-testing, spatial awareness, cross-domain leaps, articulation

**The frontend embodiment:** nothing the AI produces ever enters the real canvas
without a deliberate human click. Ghost nodes are the visual form of this rule.

---

## Multi-Canvas Workspace Model

```
User
  └── Canvas (permanent container — never deleted)
        ├── original_intent (THE NORTH STAR — write-once, always visible)
        ├── title
        └── Sessions (episodic thinking runs)
              └── Session
                    ├── status: active | closed
                    ├── current_phase: diverging | converging
                    └── node_sequence: node IDs created in THIS session, in order
```

**Frontend consequences:**
- The canvas page renders nodes from ALL sessions of the canvas — a node belongs
  to the canvas (`canvas_id`), it was merely *created* in a session (`session_id`).
- Opening a canvas with no active session → `POST /api/session/start` first.
- `original_intent` is captured once on canvas creation (`/canvas/new`), then
  rendered read-only in the `NorthStarHeader` forever. Changing your mind =
  creating a new canvas, not editing the intent.

---

## The Five AI Roles (what the user sees)

| Role | Fires when | What appears on canvas |
|---|---|---|
| **Expander** | New node, after the pause (debounced) | Ghost pair anchored to the new node |
| **Stress-Tester** | Phase switches to converging | Ghost pair challenging a weak point |
| **Observer** | Session Complete only | Observations in the Session Complete modal — never a mid-session ghost |
| **Outer Subconscious** | Question edge drawn — immediate | Ghost pair anchored near the question edge |
| **Articulator** | Edge drawn between two existing nodes — immediate | 2-3 completion options attached to the edge |

The Attunement Layer, Orchestrator, and Rejection Insights Engine are backend
infrastructure — invisible to the user except through *how* the agents behave.

---

## The Ghost Pair

Every mid-session AI contribution is a **context node + question node** pair:

| Context type | Meaning |
|---|---|
| reframe | You named it right but haven't seen its full significance |
| mirror | Reflecting what you said at higher fidelity |
| pattern | Two+ of your nodes are converging — you haven't noticed |
| reference | The thing you're circling has a precise name elsewhere |
| contradiction | This node pulls against an earlier one |
| appreciation | Genuine breakthrough — let it land (may arrive without a question node) |

**Ghost rules the frontend enforces:**
- One ghost pair per real node maximum. A new spawn for the same trigger node
  **replaces** the pending pair.
- Accept/reject is **per node in the pair** — the user may keep the reframe but
  not the question.
- No auto-fade, no timeout — a ghost floats patiently until the human acts.
  Ignoring is valid.
- Reject requires a reason (`RejectionReasonSelector`) — it feeds the backend's
  learning loop (Rejection Insights → negative constraints in future prompts).
- **Appreciation exception:** full opacity, no reject button. It is an
  observation to acknowledge, not a suggestion to own.
- Accepting = ownership transfer. The node animates from ghost to real (100%
  opacity, solid border, solid edge) and the frontend persists it to Supabase
  as an `owner: 'ai'` node.

Visual spec lives in `CANVAS-RENDERING.md`.

---

## The Observer Structure (different interaction model)

The Observer never produces a ghost pair. It highlights **existing canvas nodes
as anchors**; hovering an anchor reveals a leveled DAG of observation nodes
(level 0 bridges from the anchors; each edge goes exactly one level deeper).

- Accept/reject is **per edge**, never on the structure as a whole.
- An observation node only becomes real once ALL its incoming edges are accepted.
- Rejecting edges batches into a re-think: the pending structure tears down and
  the Observer re-emits a revised one (or drops it). Rejection feedback uses its
  own vocabulary: `not_related | wrong_direction | too_indirect | already_obvious`.

Currently surfaced at **Session Complete only**. See Known Gap #2 in
`API-CONTRACT.md` — the per-edge status endpoint doesn't exist backend-side yet.

---

## The Directed Graph Data Model

```
Node: { id, canvas_id, session_id, owner: 'human'|'ai', content,
        summary, direction_marker, embedding, created_at }
        └── summary/direction_marker/embedding are BACKEND-written enrichment.
            The frontend writes id/canvas_id/session_id/owner/content only.

Edge: { id, canvas_id, session_id, from_node_id, to_node_id,
        edge_type: 'logical'|'doubt'|'question'|'associative',
        both_existing: boolean }
        └── both_existing=true ⇔ the edge was drawn BETWEEN TWO NODES THAT
            ALREADY EXISTED (a retrospective connection), not as part of
            creating a new child node. The frontend sets this at write time —
            the backend routes the Articulator on it and never recomputes it.
```

---

## The Debounce Contract (what the frontend shows)

The backend fires agents on **pauses**, not on every event (a fixed **10s**
window per session today — the velocity-adaptive 8–25s model is designed but
not yet implemented in the backend, so don't tie the indicator to it). Two
triggers bypass the debounce and fire immediately: question edges, and edges
between existing nodes.

Frontend's job: show the `DebounceIndicator` (subtle pulsing dot near the last
active node) while a window is plausibly open — "AI is reading what you just
built" — and clear it when a spawn arrives or the user resumes creating. The
timing model is the backend's; the indicator is a hint, not a contract.

---

## Session Phases

`diverging` (default — Expander territory) / `converging` (Stress-Tester
territory). The user flips it manually via `PhaseToggle`; the frontend writes
`sessions.current_phase` directly to Supabase. The transition is also *sensed*
backend-side (Adaptive Attunement reads language quality) — the toggle is the
manual override, and user control always wins.

---

## Session Complete

Human-triggered only — a deliberate button, never automatic. Three-screen modal:
1. **Observer Suggestions** — what the Observer queued during the session
2. **Unresolved Threads** — open question edges, contradictions, empty nodes → Carry Forward / Discard
3. **Session Closed** — confirmation; carry-forwards pre-load into the next session

Details and data sources in `SESSION-FLOWS.md`.

---

## Pricing Tiers (UI perspective)

| Tier | Agents |
|---|---|
| Free | Expander + Articulator only |
| Pro ($19/mo) | All 5 agents + Rejection Insights + Session Complete learnings |
| Power ($39/mo, v1.5) | All + cognitive profile |

Enforcement is **server-side** in the backend Orchestrator. The frontend reads
`subscriptions` only to decide what UI to show — e.g. `UpgradePrompt` when a
Pro-only agent would have fired.

> ⚠️ Tier gating is currently **inconsistent** backend-side: the immediate
> question-edge pipeline (Outer Subconscious) is **not** tier-checked, so a free
> user drawing a question edge does get an Outer-Sub ghost today. Don't gate the
> question-edge affordance or show an `UpgradePrompt` for it based on tier — see
> API-CONTRACT Known Gap #7.
