---
last-verified: 2026-09-19
verified-against: FoundationPrinciples.md Part III–IV · CORE-CONCEPTS.md (BE + FE) · intervention-layer/README.md · CLAUDE.md non-negotiables (BE + FE)
stale-after-days: 180
audience: everyone making a decision — product, design, engineering, prompt work, marketing claims
---

# Principles: The Invariants

> These don't change between releases. Every feature must trace back to them.
> **If a proposed change violates one of them, the change is wrong, not the principle.**

---

## The Prime Directive

> **AI augments human cognition. It never replaces it.**

**The test applied to every AI contribution:** *does it require a cognitive response from the human?* If the human can accept it without thinking, it has failed, however impressive the output.

---

## The Ownership Split

Cognitive ownership is fixed and cannot be automated.

| The human owns | The AI owns |
|---|---|
| The **goal**: what problem is being solved | The **expansion**: directions not yet seen |
| The **intent**: why it matters | The **stress test**: gaps in ideas already formed |
| The **click**: the moment of convergence and recognition | The **bird's-eye view**: spatial and temporal awareness of the whole canvas |
| The **direction**: which path to take next | The **outer subconscious**: leaps across humanity's knowledge |

Cross this line and you get replacement, not augmentation.

---

## The principle set

| # | Principle | Statement | Where it shows up in the product |
|---|---|---|---|
| 1 | **1–2 Cognitive Jump Rule** | Every AI contribution sits 1–2 cognitive steps from the user's current frontier, never further. Too much distance alienates rather than expands. | Every agent prompt; the judge's maturity check |
| 2 | **Ground Before Nudge** | The AI lays ground first (a reframe, mirror, pattern, reference, or contradiction), *then* asks. The nudge only lands once the ground is laid. | The ghost pair: context node → question node |
| 3 | **The Convergence Principle** | The "click", when divergence becomes conviction, is irreducibly human. AI can't manufacture it. It can only enrich the field so the click has fertile ground. | No agent ever declares a conclusion |
| 4 | **Sequence as Data** | The order thoughts were created in matters as much as the thoughts. The trail reveals direction, and direction makes prediction possible. | `node_sequence`, `direction_marker`, trail tools |
| 5 | **Question Edges as Signal** | An edge the human draws but can't label is the highest-value signal in the system. It marks the boundary of their current knowledge. | The Question pen fires the Outer Subconscious immediately |
| 6 | **The Hand Knows First** | Drawing a line between two nodes is a cognitive act that comes *before* understanding why. AI closes the gap and leaves the final choice to the human. | The Relate pen fires the Articulator |
| 7 | **2–3 Completions, Not One** | When AI articulates a connection it offers 2–3 possibilities. One answer closes thinking; several force a choice and keep ownership human. | Articulator output: `[ARTICULATION 1..3]` |
| 8 | **Appreciation Stands Alone** | Not every contribution is a door. Some are windows. Appreciation marks a breakthrough and lets it land, and the follow-up question is optional. | The `appreciation` context type; a question node is optional |
| 9 | **Drift Detection** | The original intent is sacred and immutable. AI keeps comparing current thinking with the north star and surfaces divergence. | Immutable `original_intent`; the Observer |
| 10 | **The Ghost Threshold** | AI contributions arrive as ghosts: translucent, floating, not yet real. Nothing crosses into the canvas without deliberate human consent. Accepting is the visible act of ownership transfer. | Ghost nodes, accept/reject per node |
| 11 | **No Cognitive Atrophy** | If users start accepting AI nodes without thinking, the design has failed. | The master constraint on every feature |
| 12 | **Two Consent Gates** *(added with the intervention layer)* | Consent covers both *presentation* (may the AI show up at all right now?) and *acceptance* (may this idea join my canvas?). Materialising structure unasked is itself an interruption. | Consent timer → glow-first arrival → accept/reject |
| 13 | **Single Best, Never a Menu** *(intervention layer)* | When the AI speaks, it makes one move: the best one. A list of suggestions is itself noise. | The judge returns one route or holds silently |
| 14 | **Upgrade, Never Substitute** *(intervention layer)* | If the right help is on a higher plan, offer the upgrade. Never quietly give weaker or wrong help instead. | Tier-locked offers |
| 15 | **"Not now" ≠ "bad idea"** *(intervention layer)* | Deferring or ignoring the AI is a *timing* signal. Rejecting content is a *quality* signal. The two are never mixed up. | Receptivity model vs. the Rejection Insights Engine |
| 16 | **Restraint is the product** | The Observer watches all session and speaks only when invited (Session Complete). Silence is a feature, not a bug. | Session Complete; the judge holding silently |

---

## The three pillars

Augmentation only becomes real when all three hold at once.

1. **Cognitive Ownership.** The human holds the goal, intent, and click. The AI holds expansion, challenge, perspective, and association.
2. **Adaptive Attunement.** The system reads the *quality* of thinking, not just its content, and shifts its posture without being told: opening while you explore, bridging as you approach convergence, closing once you've committed. The term comes from music (an instrument tuning to another in real time) and from therapy (a clinician adjusting their whole presence to what they sense).
3. **The Calibrated Nudge.** Every contribution grounds before it nudges, stays within 1–2 jumps, and passes through consent gates. It should feel like a partner beside you, not an oracle talking at you.

> **Remove any one pillar and the product collapses into something that already exists.**
> Drop ownership → an answer machine. Drop attunement → a static assistant. Drop calibration → an idea firehose.

---

## The Augmentation Loop (the heartbeat)

```
 1. EXTERNALIZE  →  2. ATTUNE  →  3. JUDGE/ROUTE  →  4. AUGMENT (ghost)  →  5. DECIDE & TEACH
 human writes a     read the        is anything        one role makes one     accept / reject /
 node or draws an   quality and     worth saying,      calibrated move, which  ignore; rejections
 edge               texture of the  where, and by      arrives as a ghost      become constraints
                    thinking        whom?                                      ──────► back to 1
```

It fires on **pauses**, not keystrokes. A burst of node-edge-node is one unit of thinking. Two explicit gestures bypass the wait because they are direct requests for help: a **Question edge** and a **Relate edge**.

The loop serves a larger arc:

```
DIVERGE ──────────► ◦ THE CLICK ◦ ──────────► CONVERGE
widen the field      felt moment of          sharpen the idea
(Expander)           recognition — human     (Stress-Tester)
```

---

## Non-negotiable engineering invariants (product-relevant subset)

These appear in both repos' `CLAUDE.md` and exist to protect the principles above:

| Invariant | Protects |
|---|---|
| `original_intent` is written once and never updated; RLS blocks edits | Drift detection needs a fixed anchor |
| Agent system prompts are constants and never built from user input | Integrity; resistance to prompt injection |
| Agent memory threads are per **canvas**, not per session | Knowledge builds up across a canvas's whole history |
| One agent thread per role per canvas | The Observer's framing never contaminates the Expander's |
| Tier enforcement is server-side only | Can't be bypassed; the frontend only *shows* upgrade UI |
| No Supabase Realtime; the server never pushes canvas state | The canvas is the user's; the only server push is AI suggestions |
| Ghost *structure* is defined by the system; agents generate *content* only | Predictable UI; never trust LLM-invented IDs |
| Active rejection insights are injected into every agent call as NEGATIVE CONSTRAINTS | The AI stops re-offering what you refused |
| Never auto-accept a ghost (appreciation is only *acknowledged*, never owned automatically) | The Ghost Threshold |
| A set-aside AI node is excluded from **all** AI reasoning until restored | The user's control over what the AI "sees" |

---

## How to use these principles in a decision

1. Identify which principle(s) the proposal touches.
2. Apply the master test: **does this make the human think more, or less?**
3. Check the pillars: does it weaken ownership, attunement, or calibration?
4. If it violates any of them, reshape the proposal rather than bending the principle.
5. New layers (new roles, new edge types, new surfaces) earn their place by *obeying* these principles, never by amending them.

**Common proposals that fail this test:** "summarise my canvas into a doc", "auto-expand every node", "let the AI build the first draft of the map", "accept all", "a chat panel on the side", "AI edits the north star as my goal evolves", "suggestions that expire to create urgency".
**Proposals that pass, reshaped:** "offer a structure the user assembles edge by edge" (the Observer model), "a quiet sidebar card instead of a popup", "a new-canvas flow for a changed goal", "export *my* nodes as an outline".
