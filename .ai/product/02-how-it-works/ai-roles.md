---
last-verified: 2026-09-19
verified-against: BE src/agents/* · src/pipeline/* · src/lib/tier.ts · CORE-CONCEPTS.md · AGENT-PIPELINE.md · intervention-layer/02-the-judge.md · LLM-LAYER.md
stale-after-days: 30
audience: product, prompt/agent work, marketing (capabilities), support (explaining behaviour)
---

# The AI Roles

> **What** the AI does. For **when and how loudly** it does it, see `intervention-model.md`.
> ThinkingCanvas's AI is not one role but five, each triggered by a different signal. There are also three invisible infrastructure pieces that decide, calibrate, and learn.

---

## The five content roles

| Role | Job | Triggered by | Posture | Model | Tier (design) | Live today? |
|---|---|---|---|---|---|---|
| **Expander** | Opens directions you haven't seen, 1–2 jumps ahead **along your trail's direction** | The judge, while **diverging** | Human + AI | gemini-2.5-flash-lite | Free | 🟠 Unreachable (see known gap #1) |
| **Stress-Tester** | Finds gaps, weak assumptions, and contradictions in a committed line of thought | The judge, while **converging** | Human + AI | gemini-2.5-flash-lite | Pro | 🟠 Unreachable |
| **Observer** | Bird's-eye map of the whole canvas plus **drift** against the north star | **Session Complete** | Human + AI; the most hands-off role | gemini-2.5-flash + high thinking | Pro | ✅ At Session Complete (as flat cards; not plan-gated) |
| **Outer Subconscious** | Cross-domain associative leaps across all recorded human knowledge | A **Question** edge | **AI only**: the one role a human can't play | gemini-2.5-flash + high thinking | Pro | ✅ Immediate (not plan-gated) |
| **Articulator** | Names a connection your hand drew before your mind could, with 2–3 readings | A **Relate** edge between two existing nodes | Human + AI | gemini-2.5-flash-lite | Free | ✅ Immediate |

### Expander
- Reads the active node, the recent trail, and attunement data. It can pull more context with tools (`get_window`, `traverse_trail`, `semantic_promote`).
- Adapts its question to attunement: **opening** ("what if / what else"), **bridging** (senses convergence), or **closing** ("what specifically / what breaks this").
- Output: one context node (a paragraph of 40–60 words) plus one question sentence.
- Its own test: *"would a thoughtful person need to actually think to respond?"*

### Stress-Tester
- Attacks a **committed subtree**: weak assumptions, missing cases, contradictions. It has scope guardrails and search targets so it attacks *the idea*, not the user.
- Only eligible once the session has latched to **converging**, either automatically from a confident, sustained attunement shift or through the manual phase toggle.
- Output: usually a `contradiction` context plus a question.

### Observer
- The only role that sees **the whole canvas** (every node, every session, grouped as a spatial map), rather than the recent trail.
- Designed never to hand you a sentence to accept. It **highlights existing nodes as anchors** and proposes a small **leveled, acyclic structure** of observation nodes hanging off them. You accept or reject **each connection** separately. An observation becomes real only once *all* its incoming connections are accepted. Rejecting connections (with reasons *not related / wrong direction / too indirect / already obvious*) makes the Observer **re-think** the whole observation: it rewrites the observation or drops it.
- **Today**: runs once at Session Complete, and its observation nodes are stored as flat `session_learnings` cards (contradiction → "contradiction", everything else → "question"). The structure/per-edge UI and its endpoint are not built.

### Outer Subconscious
- *"Your inner subconscious searches inward across one lifetime; the outer subconscious searches outward across humanity. Not smarter, but unbounded."*
- Fires on the highest-value signal in the system: a **Question edge**, a link the user senses but can't name.
- Output: a `pattern`, `reference`, or `reframe` context plus a question (always has a question).
- Reads a stateless, focused context (not the recency-tiered thread). Grounding in a real knowledge graph is a future dimension; today it relies on model knowledge.

### Articulator
- "The hand knows first." Drawing a **Relate** edge between two existing nodes is the gesture.
- Output: **2–3 articulations** (`[ARTICULATION 1] … [ARTICULATION 2] … [ARTICULATION 3]`), never one. One answer closes thinking; several force a choice. **No question node.**
- Canvas-stateful: it receives thread history plus both endpoints' surroundings (via `get_path`, `traverse_trail`).
- Since 2026-09-05, only the **Relate** pen fires it. A plain Logical edge between existing nodes is silent, so rearranging your thinking doesn't summon the AI.

---

## The ghost-pair grammar

Every contribution from the Expander, Stress-Tester, Outer Subconscious, and Articulator is:

```
Context node (one of 6 types)  ──►  Question node (required, except for appreciation; never for the Articulator)
     "the ground"                          "the nudge"
```

| Context type | Fires when |
|---|---|
| reframe | You named it right but haven't seen its full weight |
| mirror | You said something powerful; it's reflected back at higher fidelity |
| pattern | 2+ earlier nodes are converging unnoticed |
| reference | You're circling a concept that has a precise name elsewhere |
| contradiction | This node pulls against an earlier one |
| appreciation | A genuine breakthrough. Let it land; the question is optional. |

The agent chooses the type (`[NODE_TYPE: x]`). The backend strips the markers and sends the frontend clean, pre-routed text plus a `node_type` restyle message.

---

## Infrastructure (invisible to users, felt in behaviour)

### Attunement Layer: *how are you thinking?*
- Runs first on the proactive path. It generates no content; it only reads signals.
- Reads the last 3–5 nodes plus the velocity between them, and outputs `cognitive_mode` (**exploratory / transitional / declarative**), a recommended `question_style` (**opening / bridging / closing**), and whether a phase shift is suggested.
- Drives the **phase latch**: `diverging → converging`, once per session, only on a confident (≥0.7) sustained shift. There's no automatic route back to diverging in v1; that waits for branching.
- Model: gemini-2.5-flash, thinking off. *"The system's most important behavioural feature."*

### The Judge: *is anything worth saying, where, and by whom?* (replaced the Orchestrator)
- One call with strong thinking, over attunement plus the **full canvas map with complete node text** (the judgement lives in the wording, which summaries lose).
- Returns `{ mature, route, locus_node_ids, headroom, confidence }`. It picks the **single best** role, never a ranked list, and **holds silently** when nothing is ripe.
- Maturity is per role and specific to a place: the Expander needs momentum and open space, the Stress-Tester an attackable committed subtree, the Outer Subconscious a concept with a strong non-obvious analogue, the Articulator two nodes with a real but unnamed relationship.
- **Never re-offers a refusal**: it dedups against all active rejection insights.
- **Tier: upgrade, never substitute.** If the best move is Pro-only, a free user gets an upgrade card, not the Expander as a consolation. (Handing a converging user the Expander would re-diverge them, which is actively wrong.)
- Status: 🟠 built, unreachable (sits on the unmounted intervention route).

### Rejection Insights Engine: *learning what you don't want*
- Runs immediately when a **context** node is rejected (rejecting only the question doesn't trigger it).
- Converts the reason into structured negative constraints (Gemini 2.5 Flash, low thinking):

| Reason | Severity | Example constraint | Effect |
|---|---|---|---|
| Too abstract | `hard_block` | "Avoid high-level analogies" | Blocked from then on |
| Too technical | `approach_pivot` | "Keep the essence, simplify" | Changes approach |
| Skip for now | `temporal_deferral` | "Pause this theme for 3 turns" | Cools down, then expires |

- Injected into every later agent call on that canvas as a **NEGATIVE CONSTRAINTS** block. *Augmentation that tunes itself to you, not by profiling you, but by listening to your refusals.*
- Pro feature in the design; live for everyone today. Kept strictly separate from **receptivity** (timing), so a busy user's "not now" never teaches the AI that its ideas are bad.

---

## How the AI remembers (without bloat)

- **One memory thread per role per canvas**, persisting across sessions. Session boundaries are marked inside the thread ("[SESSION 3 STARTED] … north star …").
- A **serializer** converts the thread into tiers before each call. Recent turns are full fidelity. Older turns collapse to directional summaries. The **north star and the click moment are never compressed**. Full content is never deleted; it's fetched on demand.
- **Cursor tools** let agents navigate instead of swallowing the whole canvas: `get_content · get_window · traverse_trail · get_big_picture · get_siblings · get_path · get_branch · semantic_promote`.
- `semantic_promote` finds thematically related distant nodes by vector similarity and pairs each with its **direction marker**, so an agent can tell genuine resonance from **false resonance**.
- Every node gets a backend-written **directional summary**, a **direction marker**, and a **3072-dimension embedding** on save. Accepted AI nodes get them too, so they become first-class context.
- **Set-aside nodes and any edge touching them are excluded from all AI reasoning**: prompts, tools, vector search, and the Observer's map.

## Safety and integrity properties
- System prompts are constants and never built from user input. They're managed in Langfuse with a local fallback.
- LLM-emitted IDs are never trusted. Ghost IDs are minted by the backend, and the judge's and Observer's node IDs are validated against the canvas.
- Every agent call is traced (Langfuse via Mastra).
- One provider (Google Gemini) with a single API key. All model instantiation is centralised in `src/lib/llm.ts`.
