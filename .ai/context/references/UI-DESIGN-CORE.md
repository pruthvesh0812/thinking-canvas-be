---
status: draft — not committed, v0.1
last-updated: 2026-06-23
owner: design draft for thinking-canvas-web (frontend repo) — not implemented here
---

# UI Design Core — ThinkingCanvas

> **What this is:** a working core for the UI design — enough structure to build
> against, loose enough to still change. Every rule below traces back to
> `ThinkingCanvas_FoundationPrinciples.md` or `CANVAS-SYNC.md`. Section 11 flags
> everything that is explicitly *not* decided yet, for the next design pass.
>
> **What this isn't:** pixels, a Figma file, or frontend code. The actual UI is
> built in `thinking-canvas-web` (separate repo). This backend repo only
> defines *data* (`SpawnDescriptor`, `RedisMessage` — see `CANVAS-SYNC.md`).
> This document is the translation layer between that data contract and what
> the user sees — written here because the data shape and the visual shape
> have to agree with each other.

---

## 0. The Three Rules Every Screen Must Pass

Before any layout or color, every screen/interaction is checked against these.
If a screen fails one, the screen is wrong — not the rule.

| Principle (Foundation Principles) | UI rule it forces |
|---|---|
| AI augments, never replaces | Nothing AI-generated ever renders solid on arrival. Everything starts translucent + pending. There is no "insert AI text directly" path. |
| No cognitive atrophy | No "accept all." No batch-accept of ghost pairs. Every accept is one deliberate act on one pair. |
| Ground before nudge | The Context Node is always visually upstream of / anchoring the Question Node — never side-by-side as equals, never question-first. |
| 1–2 jump rule | Ghost pairs render spatially anchored to their trigger node (an edge away), never in a side panel or modal. Distance on screen = cognitive distance. |
| The click is irreducibly human | The phase indicator (diverge/converge) is informational only — never a button, toggle, or control. The system never auto-converges anything. |
| The Observer never hands you a sentence | Observer output is never an accept/dismiss card. It's a highlight + hover-reveal — the user pulls the thread. |

---

## 1. The Canvas Surface (home screen)

```
┌─────────────────────────────────────────────────────────────────┐
│ ◆ North Star: "<original_intent>"        Session 3 · diverging │  ← pinned header, always visible
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│        [solid node]──logical──▶[solid node]                     │
│              │                                                   │
│           doubt                                                  │
│              ▼                                                   │
│        [solid node]┄┄question┄┄▶ ░░ghost: question░░            │
│                                        ▲                          │
│                                   logical (ghost edge)            │
│                                        │                          │
│                              ░░ghost: context (reframe)░░         │
│                                                                   │
│                                                  infinite pan/zoom│
├─────────────────────────────────────────────────────────────────┤
│ ⊙ canvases   ⊙ session                              + new node  │  ← light footer chrome
└─────────────────────────────────────────────────────────────────┘
```

- **North star bar**: pinned, always-visible, low-chrome. It is the one piece
  of UI that is never optional — the whole product hinges on the north star
  being a constant presence, not a setting buried in a menu.
- **Phase indicator** (`diverging` / `converging`): a quiet label, not a
  switch. Read from Attunement state. No "Diverge Mode" button anywhere —
  the user never flips this themselves (see Section 9, "what NOT to build").
- **Canvas body**: infinite pan/zoom graph. Nodes + edges are the only content.
  No toolbars floating over the canvas itself — keep the thinking surface clean.
- **Drift indicator**: when the Observer flags drift vs. the north star, the
  north star bar gets a subtle, non-alarming visual change (e.g. a thin
  underline accent) — not a popup, not a badge with a number. It invites a
  glance, not a reaction.

---

## 2. Node Anatomy

### Human node (real, permanent)
- Solid fill, solid border, full opacity.
- Owner is implicit from the solid styling — no "You said:" label needed.
- `direction_marker` (establishes / questions / contradicts / explores) can
  inform a small corner glyph — open question, see Section 11.

### AI ghost node — lifecycle states

| State | Trigger | Visual |
|---|---|---|
| **Spawning** | `spawn` message received | Empty dashed frame fades in (~1.5s draw-on), edge to trigger node draws first |
| **Streaming** | `chunk` messages | Text fills token-by-token inside the dashed frame, soft blinking cursor at the write head |
| **Idle / pending** | `done` received, no user action yet | Full text visible, 40–50% opacity, dashed border. Accept/reject affordances appear on hover or focus — not painted on by default, to keep the canvas calm |
| **Accepted** | User accepts | Short transition: dashed → solid, opacity 40–50% → 100%. This transition IS the "ownership transfer" moment — it should be felt, not instant |
| **Rejected** | User rejects | Ghost + its edge fade and remove. Immediately followed by the Rejection Reason Selector (Section 6) — the disappearance and the reason prompt should not feel like two separate events |
| **Ignored** | 2 new nodes created without interaction | No special treatment — it just sits there. No auto-fade, ever (Foundation Principles: "no auto-fade — ghost waits until human acts") |

### Context node type badge (6 types)

Every Context Node carries one of six types — a small glyph/accent
distinguishes which, since the *kind* of ground being laid is itself useful
signal to the user (open question on exact iconography, Section 11):

`reframe` · `mirror` · `pattern` · `reference` · `contradiction` · `appreciation`

`appreciation` is visually distinct from the other five in one more way: it
has no mandatory Question Node, so it can render as a single standalone
ghost — never force a dangling second slot for it.

### Question node
- Always the *second* node in a pair, downstream of its Context Node.
- A distinguishable shape or accent from Context Nodes (not just smaller
  text) — it's the "nudge," and ground-before-nudge should be readable from
  shape alone, without reading the text.

---

## 3. Edge Anatomy

Edge type is the most information-dense data in the system (Foundation
Principles, Block 1) — the UI should make the four types visually
unmistakable at a glance, not just on hover-tooltip:

| Edge type | Meaning | Suggested visual treatment |
|---|---|---|
| `logical` | follows from | Solid line |
| `doubt` | questions/challenges | Dashed, slightly heavier weight |
| `question` | sensed, can't yet be named — **highest signal** | Dotted + a subtle pulse/glow — this is the rarest, most valuable edge a user can draw, and it should look like it |
| `associative` | distant AI-only leap | Curved (not straight), distinct hue reserved for AI-only content |

Ghost edges (connecting to a pending ghost node) additionally inherit the
ghost node's translucency, regardless of type.

---

## 4. Ghost Lifecycle Timing (must match backend exactly)

The visual states above are not just stylistic — they are the client-side
half of a wire protocol already fixed in `CANVAS-SYNC.md`. The frontend
must render:

```
spawn  → draw empty frame(s) + edge(s) immediately, then ~1.5s hold
       (matches Inngest sleep('ghost-animation', '1500ms'))
chunk  → append token to the node matching `target` (ghost_id)
done   → stop listening for this pair; node is now "idle/pending"
```

There is no backend signal for "streaming slower/faster" — token arrival
rate IS the pacing. Do not add artificial typing delays on top of it.

---

## 5. Observer Structure UI

This is the one role that breaks the "ghost pair" pattern entirely, so it
needs its own interaction model, not a variant of Section 2:

1. **At rest**: one or more *existing, real* canvas nodes get a quiet anchor
   treatment (e.g. a soft outer glow) — nothing else visible yet.
2. **On hover/focus of an anchor**: the proposed structure reveals — a small
   DAG of observation nodes (still ghost-styled) fans out from the anchor,
   level by level (level 0 closest, deeper levels further out spatially).
3. **Per-edge accept/reject** — not per-node, not per-structure. Each edge
   in the revealed structure gets its own accept/reject control. A node only
   solidifies once *every* incoming edge to it is accepted.
4. **Reject is batched, not immediate**: rejecting an edge doesn't make it
   vanish on the spot. It gets flagged (with a reason chip — see Section 6)
   and stays visible, dimmed, while the user keeps judging the rest of the
   structure. Nothing tears down until the user signals they're done
   flagging (e.g. a "done reviewing" affordance, exact control TBD —
   Section 11).
5. **Tear-down + re-think**: once the user finishes, the whole pending
   remainder disappears together, and a moment later a revised structure
   (or nothing, if the observation no longer holds) streams back in — same
   spawn→stream→done choreography as Section 4, just for a graph instead of
   a pair.

This is deliberately the most "hands-off" interaction in the product — the
user is judging connections the AI already found, not accepting prose.

---

## 6. Rejection Reason Selector

A small popover/inline control, appears immediately on reject — never a
full modal (keep it lightweight, the user is mid-thought).

**Two distinct reason sets** (different shape of rejection, do not merge them):

| Context | Reasons offered |
|---|---|
| Ghost pair (content) rejection | Too Abstract · Too Technical · Skip for now |
| Observer edge rejection | Not related · Wrong direction · Too indirect · Already obvious |

The copy difference matters: content rejection reasons are about *how it was
said*; Observer rejection reasons are about *why the connection doesn't
hold*. Mixing these into one selector would blur a distinction the backend
already keeps separate (`rejection_insights.rejection_reason` vs.
`connection_feedback`).

---

## 7. Session Complete Flow (3 screens, human-triggered only)

Never automatic — always a deliberate "I'm done" action from the user.

**Screen 1 — Observer Suggestions**
Everything the Observer queued but held back all session. Same
anchor-highlight + hover-reveal + per-edge accept/reject pattern as
Section 5, just surfaced explicitly instead of ambient on the canvas.

**Screen 2 — Unresolved Threads**
List of: unanswered question edges, open contradictions, empty nodes. Each
gets a binary choice: **Carry Forward** or **Discard**. This is a simple
list/checklist screen — no graph rendering needed here, just clear text per
item.

**Screen 3 — Session Closed**
Confirmation that carry-forwards were written to `session_learnings`, north
star reaffirmed, session marked closed. This is also where the **first-time
signup prompt** lives for anonymous users (see Section 9).

---

## 8. Tier Gating (Free / Pro / Power)

Free tier only has Expander + Articulator. The other three roles
(Stress-Tester, Observer, Outer Subconscious) still need to be
*acknowledged* as existing — never silently absent, since invisibly missing
features feel like bugs, not like a pricing tier.

- Where a locked role would have fired, show a quiet locked-state affordance
  (e.g. a dimmed/lock-iconed ghost frame) rather than nothing at all — exact
  treatment is open (Section 11), but "nothing happens" is explicitly wrong.
- Upgrade CTA is contextual to the moment the lock was hit, not a generic
  pricing page nag.

---

## 9. Auth & Onboarding

```
Session 1 (anonymous) → full canvas access, zero signup friction
        │
        ▼
Session Complete (first time) → "Create account to save and continue"
        │ (signup/login)
        ▼
Anonymous canvas migrates to user_id
        │
        ▼
Session 2+ → requires auth
```

The first session must feel like *zero* setup — the product's first
impression is the thinking, not a signup form. The ask comes only once
there's something real to lose (a closed first session).

**What NOT to build** (explicit, because these are easy mistakes that
violate Section 0's rules):
- No "Diverge / Converge" mode switch — the phase indicator is read-only.
- No exposed "AI is thinking…" generic chatbot spinner — the ghost
  spawn-and-stream choreography (Section 4) *is* the thinking indicator.
  A separate spinner would reintroduce the answer-machine metaphor this
  product is explicitly rejecting.
- No "accept all ghosts" / "clear all ghosts" bulk action.
- No visible Attunement/Orchestrator internals (cognitive_mode, routing
  decision) — attunement is supposed to be felt, not displayed as a badge.

---

## 10. Design Tokens — v0.1 draft (placeholders, not final)

Treat every value below as a starting point to react to, not a decision.

| Token | Draft value | Notes |
|---|---|---|
| `node.human.opacity` | 100% | |
| `node.ghost.opacity` | 40–50% | per Foundation Principles, exact number TBD |
| `ghost.spawn.duration` | 1500ms | **fixed** — must match Inngest sleep, not a design choice |
| `ghost.accept.transition` | ~250–400ms | dashed→solid, opacity ramp |
| `edge.question.pulse` | slow, low-amplitude | highest-signal edge type, should read as "alive" not "alarming" |
| Context type accents (6) | TBD | one hue/glyph per: reframe, mirror, pattern, reference, contradiction, appreciation |
| Edge type styles (4) | solid / dashed / dotted+pulse / curved-dashed | see Section 3 |
| Phase indicator copy | "diverging" / "converging" | plain text label, no icon decided yet |

---

## 11. Open Decisions — flag these for the next design pass

Explicitly unresolved. Don't treat anything here as settled just because
it's written down above.

- Exact color palette / hex values — none chosen yet.
- Iconography for the 6 context node types and the `direction_marker` glyph.
- Canvas rendering approach (React Flow vs. custom canvas/WebGL) — affects
  what's even feasible for the pulse/glow/streaming effects above.
- Exact control for "done flagging rejections" in the Observer batch-reject
  flow (Section 5, step 4).
- Locked-tier visual treatment (Section 8) — lock icon vs. blur vs. ghost
  outline only.
- Light/dark mode, and whether ghost translucency reads well in both.
- Mobile/responsive strategy — is this desktop-only for v1?
- Accessibility: ghost-vs-real and the 4 edge types must be distinguishable
  without relying on color alone (shape/pattern already help — needs a
  real contrast/colorblind pass).
- Multi-canvas switcher UI — sidebar, dropdown, or separate screen.
- Node card sizing/auto-layout algorithm for the graph (manual placement vs.
  force-directed vs. sequence-driven layout).

---

## 12. Explicitly Out of Scope for This Document

- Frontend component code / React — lives in `thinking-canvas-web`, not
  this repo, and isn't written here.
- Pixel-accurate mockups or a Figma file.
- Marketing/landing page design (pricing page, etc.) — this doc covers the
  in-app thinking surface only.
