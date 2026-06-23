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
┌──────────────────────────────────────────────────────────────┬───┐
│ ◆ North Star: "<original_intent>"      Session 3 · diverging │ ⊘3│  ← pinned header + rail (collapsed)
├──────────────────────────────────────────────────────────────┤   │
│                                                                │   │
│        [solid node]──logical──▶[solid node]                  │   │
│              │                                                │   │
│           doubt                                               │   │
│              ▼                                                │   │
│        [solid node]┄┄question┄┄▶ ░░ghost: question░░         │   │
│                                        ▲                       │   │
│                                   logical (ghost edge)          │   │
│                                        │                       │   │
│                              ░░ghost: context (reframe)░░      │   │
│                                                                │   │
│                                               infinite pan/zoom│   │
├──────────────────────────────────────────────────────────────┤   │
│ ⊙ canvases   ⊙ session                     I'm done   + new node│
└──────────────────────────────────────────────────────────────┴───┘
```

- **North star bar**: pinned, always-visible, low-chrome. It is the one piece
  of UI that is never optional — the whole product hinges on the north star
  being a constant presence, not a setting buried in a menu.
- **Phase indicator** (`diverging` / `converging`): a quiet label, not a
  switch. Read from Attunement state. No "Diverge Mode" button anywhere —
  the user never flips this themselves (see Section 9, "what NOT to build").
- **Canvas body**: infinite pan/zoom graph. Nodes + edges are the only content.
  No toolbars floating over the canvas itself — keep the thinking surface clean.
  No panel for *AI* content either — every AI contribution (ghost pair,
  Observer reveal, locked-tier affordance) renders on-canvas, anchored to the
  node that triggered it. A panel of AI output would break the 1–2 jump rule
  (Section 0): it would put AI content at a fixed screen location instead of
  next to its trigger, restoring exactly the side-channel "answer box" the
  product rejects. (This is scoped to *AI* content — see the Open Threads
  Rail just below, which carries the user's own state, not AI output.)
- **Drift indicator**: when the Observer flags drift vs. the north star, the
  north star bar gets a subtle, non-alarming visual change (e.g. a thin
  underline accent) — not a popup, not a badge with a number. It invites a
  glance, not a reaction.
- **"I'm done" affordance**: the only entry point into the Session Complete
  flow (Section 7). Lives in the footer, plain text/button — not a modal
  trigger disguised as anything else. Human-triggered only; the system never
  surfaces this on its own (e.g. on inactivity), since that would imply the
  system deciding the session is over.

### Open Threads Rail

The one piece of persistent chrome beyond the north star bar — repurposes
what was originally a sidebar for AI suggestions (rejected, Section 9) into
something that never carries AI content: a live mirror of the same three
categories Session Complete's "Unresolved Threads" screen (Section 7,
Screen 2) will eventually force a decision on — **unanswered question
edges**, **open contradictions**, **empty nodes**.

| State | Trigger | Content |
|---|---|---|
| **Collapsed** (default, always) | — | Thin icon + a neutral numeric count (`⊘3`). No color-coded urgency, no styling change between diverging and converging — same quiet weight regardless of phase. It's orientation, not a nudge. |
| **Expanded** | Human click only | The three categories as a flat list. Each item, clicked, pans/selects the corresponding node on canvas — that's the only interaction it offers. |

**Why it has no resolve action.** No Carry Forward / Discard control lives
in the rail, even though that's exactly what Session Complete's Screen 2
will ask for the same items. If the rail let you discard a thread mid-session,
it would quietly reopen the convergence pressure Adaptive Attunement exists
to hold off — "you have unfinished business" sitting in view during a
diverging phase is itself a nudge toward closing things prematurely. The
rail previews the data; only Session Complete spends it. This also means the
rail must not change appearance based on the phase indicator — doing so
would leak Attunement's internal read through a side door, which Section 9
separately prohibits.

Exact side (left/right) and whether it shares space with the canvas
switcher are open — see Section 11.

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
- No manual self-reported state/mood selector of any kind (e.g. "Flow /
  Exploring / Stuck" pills). Cognitive mode is Adaptive Attunement's job —
  read silently from language quality + node velocity, never asked of the
  user. A self-report control duplicates what Attunement already infers,
  and duplicating it in the UI invites the two to disagree.
- No sidebar/side panel for AI suggestions, helpers, or chat. All AI output
  is a ghost pair or Observer reveal anchored on-canvas to its trigger node
  (Section 0, 1–2 jump rule). A panel is a fixed location independent of
  what triggered it — that's the side-channel this product is built against.
  (The Open Threads Rail, Section 1, is the one sidebar that exists — it
  carries only the user's own canvas state, never AI content, and never a
  resolve action, so it doesn't reopen this side-channel.)
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
| `surface.base` | warm off-white, e.g. `#F7F3EC` | direction set Section 14.6, exact hex TBD |
| `content.ink` | soft near-black, e.g. `#2B2622` | direction set Section 14.6, exact hex TBD |
| `font.content` | humanist sans (e.g. Public Sans / Source Sans 3 register) | Section 14.6, exact family TBD |
| `font.chrome` | quieter neutral sans, same family lower weight | Section 14.6 |
| `node.ghost.font-style` | italic while pending → roman on accept | Section 14.4, pairs with the opacity/border transition |

---

## 11. Open Decisions — flag these for the next design pass

Explicitly unresolved. Don't treat anything here as settled just because
it's written down above.

- Exact color palette hex values within the warm-light direction (Section
  14.6) — direction chosen, literal values are still a draft to react to.
- Exact content/chrome font family names + licensing (Section 14.6) —
  register chosen (humanist sans / quieter neutral sans), literal typeface
  not chosen.
- Iconography for the 6 context node types and the `direction_marker` glyph.
- Canvas rendering approach (React Flow vs. custom canvas/WebGL) — affects
  what's even feasible for the pulse/glow/streaming effects above.
- Exact control for "done flagging rejections" in the Observer batch-reject
  flow (Section 5, step 4).
- Locked-tier visual treatment (Section 8) — lock icon vs. blur vs. ghost
  outline only.
- Dark mode equivalent of the warm-light palette (Section 14.6), and
  whether ghost translucency + the italic ghost-text cue (Section 14.4)
  read well in it.
- Mobile/responsive strategy — is this desktop-only for v1?
- Accessibility: ghost-vs-real and the 4 edge types must be distinguishable
  without relying on color alone (shape/pattern already help — needs a
  real contrast/colorblind pass).
- Multi-canvas switcher UI — sidebar, dropdown, or separate screen.
- Node card sizing/auto-layout algorithm for the graph (manual placement vs.
  force-directed vs. sequence-driven layout).
- Orientation/navigation aids for large, multi-session canvases (jump-to-node
  search, breadcrumb of past sessions, minimap). Section 0's "calm canvas"
  rule argues against a persistent minimap, but with no aid at all a canvas
  with dozens of nodes across many sessions may become unnavigable by pan/zoom
  alone. Needs a decision, not an assumption either way.
- Undo for an accidental ghost reject. Rejection currently triggers the
  Rejection Reason Selector immediately (Section 2) with no stated way back —
  worth deciding whether a reject is truly final or has a short undo window.
- Open Threads Rail (Section 1) exact placement — which screen edge, and
  whether it shares chrome with the canvas/session switcher or stays fully
  separate. Also whether "empty nodes" needs a staleness threshold (how long
  before a blank node counts as an open thread vs. one the user just created
  a second ago).

---

## 12. Explicitly Out of Scope for This Document

- Frontend component code / React — lives in `thinking-canvas-web`, not
  this repo, and isn't written here.
- Pixel-accurate mockups or a Figma file.
- Marketing/landing page design (pricing page, etc.) — this doc covers the
  in-app thinking surface only.

---

## 13. Deferred Beyond MVP (noted, not designed)

Raised as future-version scope, explicitly not part of the v1 MVP this
document designs for. Captured here only so it isn't lost — nothing in
Sections 1–11 assumes any of this exists.

- **Connectors** — integrations pulling content in from external
  tools/sources. Likely lands as a new way to seed/ground a Context Node
  (alongside the 6 types in Section 2), not a new canvas primitive.
- **Skills** — user-configurable AI capabilities beyond the 5 fixed roles.
  Flag for later, not resolved here: the product's current non-negotiable
  is that agent system prompts are constants, never built from user input
  (CLAUDE.md). A skills feature needs its own resolution of that boundary
  before any design work starts.
- **Generated doc (for download)** — an exportable, linear document derived
  from the canvas/session. An output artifact, not a new editing surface —
  doesn't conflict with the graph-not-document model (Section 0) since it's
  a one-way projection out of the graph, not a second place the user thinks.
- **Upload material** — user-supplied reference files become grounding
  material on the canvas. Likely connects to Context Nodes / "ground before
  nudge" (Section 0) rather than being a separate UI concept of its own.

None of this affects the MVP sections above. Worth its own design pass once
actually scheduled — not before.

---

## 14. Design Philosophy — the human-first lens

Not interaction rules (those are Sections 1–9) and not how the AI *speaks*
(that's the agent prompts, backend — out of scope here). This section is the
**lens a designer holds before every UI decision**, down to the smallest
detail. One stance runs through all of it: the human and their thinking are
the subject; the app and the AI are always subordinate to it.

### 14.1 The stance, in one line

**Human-first, everywhere — including the details no one will name.** The
person's thinking is the only thing on screen that matters; every pixel of
app and every AI mark exists to serve it and must visibly defer to it. If a
design choice makes the tool more present and the thinker less central, it's
wrong — no matter how small.

### 14.2 What the designer holds before every decision

Six lenses. Run each screen, component, and micro-interaction past all six.

- **The human's content is always visually dominant.** Their nodes are the
  most solid, most saturated, most legible thing in view; everything AI is
  translucent and quieter (Section 2). The hierarchy of attention is never
  in question at a glance.
- **The system never takes the wheel.** No AI mark ever steals focus,
  scroll, or selection. A ghost can appear, but the cursor stays where the
  human left it; the viewport doesn't jump to AI output; typing is never
  interrupted. The human can always keep working *through* an AI arrival.
- **Ignore is a first-class response.** Every AI element can be left
  untouched forever with no penalty, no fade, no nag (Section 2). Nothing
  the human didn't initiate ever blocks, traps, or demands a reply.
- **Calm by default, detail on demand.** Affordances (accept/reject, Observer
  reveal, rail contents) stay hidden until the human reaches for them
  (hover/focus) — the resting state is quiet. The canvas is never pre-loaded
  with controls the human didn't ask to see.
- **The human's hand stays on everything reversible.** Spatial arrangement
  is theirs and never auto-reorganized; destructive moves are avoidable or
  recoverable; consent is asked at the moment of the act, not assumed.
- **Plain and unhurried.** Chrome copy is plain human language, never system
  jargon; motion is unhurried, never urgent; nothing uses notification or
  alert patterns. The app behaves like a calm room, not a feed.

**Human-first in the small details** (the part that's easy to skip): the
empty state invites the *human's* first mark, not the AI's. A spawning ghost
never occludes an existing human node. The brightest pixel on screen is
always something the human made, never a CTA. A 200ms hover delay before
accept/reject affordances appear, so a glance doesn't summon controls. These
are the kinds of choices where the philosophy actually lives — not in the big
layout, but in whether each tiny default protects the thinker or pesters them.

### 14.3 The look

How the surface should read, derived from the stance above and the Foundation
Principles — not yet pixels (those are 14.6 + Section 11).

- **Quiet, spacious, low-chrome.** Generous negative space — nodes breathe,
  the canvas is a place to think, not a screen to fill. Chrome recedes to the
  edges (north star bar, footer, rail); the thinking surface stays clean
  (Section 1).
- **Solid-vs-translucent is the primary visual language.** The whole look is
  organized around the human (solid, present) / AI (translucent, provisional)
  distinction. Everything else — color, weight, motion — is in service of
  keeping that contrast instantly readable.
- **Restraint over richness.** 4 edge types + 6 context types are a lot to
  distinguish; carry most of it through shape/weight/pattern (Sections 2–3)
  and spend color sparingly, so the surface stays calm. Every accent earns
  its place against the calm-canvas rule or it's cut.
- **Comfort for the long haul.** People stare at this for an hour. Warm, soft
  contrast over clinical glare; nothing that fatigues or strains.

### 14.4 Motion

- Organic, unhurried easing — **ink settling, not UI snapping.** No
  springy/bouncy overshoot anywhere; overshoot signals "app/toy," which
  fights the calm-room stance (14.1).
- Exactly **one ceremonial moment**: ghost accept (`ghost.accept.transition`,
  Section 10) — dashed→solid, opacity ramp. It's the ownership-transfer
  moment (Section 2) and should be felt, slightly slow, deliberate — the
  only "event" on an otherwise ambient surface.
- Nothing else pulses for attention except the single privileged `question`
  edge (Section 3) — alive, not alarming. No notification-style motion
  anywhere else, including the Open Threads Rail (Section 1), which is
  explicitly phase-invariant and non-urgent.
- **Ghost text renders italic while pending, settling to roman on accept** —
  a visual rendering cue (not a content/voice rule): it reinforces "offered,
  not yours yet" in the type itself, alongside the opacity/border change.
  Doubles as a non-color cue for ghost-vs-real that survives a colorblind
  pass (Section 11).

### 14.5 Anti-aesthetic — what the visual style must NOT be

- **Not the generative-AI hype costume** — no purple gradients, no ✦
  sparkles, no glowing orbs, no "AI" badges, no shimmer. The product is
  *anti*-answer-machine; it must not cosplay as one.
- **Not a productivity dashboard** — no charts, streaks, progress bars,
  completion %, gamification. Thinking isn't a KPI.
- **Not a chatbot** — no bubbles, no avatar, no typing-dots (Section 9).
- **Not clinical** — avoid pure-white glare and harsh contrast on a surface
  people stare at for an hour.

### 14.6 Palette & type direction (taste call, not derived)

Direction chosen; literal values are still open (Section 11) — treat
everything below as a draft to react to, same convention as Section 10.

- **Base surface — warm light, paper & ink.** An off-white warm base (not
  pure white) with soft ink-dark content color (not pure black). Reads as a
  considered notebook/studio, not a SaaS dashboard — chosen over a cool
  architectural light or a dark-focus surface specifically because it's the
  gentlest on long sessions and the least likely to slide into "tool" or
  "AI product" territory. Draft starting point: surface `#F7F3EC`,
  content ink `#2B2622`.
- **Content typography** (the human's own writing + ghost text, Section 2):
  a **humanist sans** (register like Public Sans / Source Sans 3 — exact
  family TBD). Chosen over a serif to keep long writing sessions plainly
  legible without a "literary" affectation; chosen over a geometric/neutral
  sans specifically to avoid the generic-productivity-tool read that 14.5
  warns against.
- **Chrome typography** (north star bar, footer, Open Threads Rail, labels):
  a quieter neutral sans, distinct from content type only in weight/size —
  never in personality. Chrome should recede; content should read.
- This settles the *direction* of Section 11's palette item; exact hex
  values, the literal font family/license, and the dark-mode equivalent of
  this palette remain open for the next design pass.
