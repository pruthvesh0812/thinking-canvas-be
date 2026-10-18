---
last-verified: 2026-09-19
stale-after-days: 180
audience: everyone writing about or for ThinkingCanvas — reuse these exact terms
---

# Glossary: The Canonical Vocabulary

> Reuse these exact terms in docs, UI copy, marketing, and support. The vocabulary is part of the product. Where the **UI word** differs from the **internal term**, use the UI word with users and the internal term with engineers.

## Core concepts

| Term (internal) | UI / user-facing word | Meaning |
|---|---|---|
| **Canvas** | Canvas | The permanent thinking container for one problem. Holds the north star and every session. Never deleted in the MVP. |
| **North Star** / `original_intent` | North star (shown in the header) | The answer to *"What are you trying to figure out?"*, captured at canvas creation. **Immutable forever.** A changed goal means a new canvas. |
| **Session** | Session N | One episodic thinking run inside a canvas. A canvas has at most one *active* session at a time. |
| **Node** | Node / thought | One thought on the canvas. `owner` is `human` or `ai`. |
| **Empty node** | — | A node with no content. Meaningful: it stands for an unarticulated thought, and counts as an unresolved thread. |
| **Edge** | Connection / line | A directed relationship between two nodes. |
| **Trail / Sequence** | — | The ordered path of node creation within a session (`node_sequence`). The *direction* of thinking, stored as data. |
| **Direction marker** | — | Backend-generated tag per node: `establishes`, `questions`, `contradicts`, or `explores`. Separates real resonance from **false resonance** (semantically similar nodes that point in opposite directions). |

## Edge types ("pens")

| Internal | UI pen | Meaning | AI effect |
|---|---|---|---|
| `logical` | **Logical** | This follows from that. | Context only. Rearranging is silent. |
| `question` | **Question** | "There's a connection here I can't name yet." | **Immediately** fires the Outer Subconscious. The highest-value signal. |
| `relate` | **Relate** | "Help me articulate how these two relate." Drawn between two existing nodes. | **Immediately** fires the Articulator (2–3 readings). |
| `doubt` | *(no pen today)* | This challenges that. | Exists in the data model; not offered in the UI. |
| `associative` | *(AI-only)* | A distant cross-domain leap. | Reserved for AI. |

Pick a pen *before* you drag: the line draws live in that style.

## AI contributions

| Term | UI word | Meaning |
|---|---|---|
| **Ghost node** / **ghost** | Ghost / suggestion | A translucent (40–50% opacity), dashed, pending AI contribution. Not part of your canvas until you accept it. |
| **Ghost pair** | — | Context node + question node: the two-part grammar of an AI contribution. |
| **Context node** | — | The "ground" half. One of 6 types (below). |
| **Question node** | — | The "nudge" half: a single question that takes real thought to answer. |
| **The Threshold** | Accept | The boundary a ghost crosses when accepted. The moment ownership transfers. |
| **Accept** | ✓ Accept | Per node: keep the context, the question, or both. The node becomes a real `owner: ai` node, still marked "AI". |
| **Reject** | ✕ Reject + reason | Removes the ghost and teaches the AI. Reasons: **Too abstract**, **Too technical**, **Skip for now**. |
| **Ignore** | — | Doing nothing. Always valid. Ghosts never auto-expire. |
| **Set aside** | Set aside / Restore | Soft-archives an accepted AI node. It's hidden and **fully excluded from AI reasoning** until restored. Nothing is destroyed. |
| **Appreciation** | — | A context type that marks a genuine breakthrough. It may come without a question. Acknowledge it; there's nothing to own. |
| **Articulation** | Reading 1 / 2 / 3 | One of the 2–3 candidate phrasings the Articulator offers for a Relate edge. |

### The 6 context types

| Type | Fires when |
|---|---|
| **Reframe** | You named something correctly but haven't seen its full weight. |
| **Mirror** | You said something powerful and may not have noticed. It gets reflected back at higher fidelity. |
| **Pattern** | Two or more earlier nodes are converging and you haven't seen it. |
| **Reference** | You're circling a concept that has a precise name elsewhere. |
| **Contradiction** | Your current node pulls against an earlier one. |
| **Appreciation** | A genuine breakthrough just happened. Let it land. |

## The five AI roles

| Role | One-liner |
|---|---|
| **Expander** | Opens directions you haven't seen yet, 1–2 jumps ahead along your trail. (Diverge phase.) |
| **Stress-Tester** | Finds gaps, weak assumptions, and contradictions once you've committed. (Converge phase.) |
| **Observer** | The bird's-eye view. Maps the whole canvas and checks for drift from the north star. Speaks at Session Complete. |
| **Outer Subconscious** | The AI-only role: cross-domain leaps across all recorded human knowledge. Your inner subconscious searches one lifetime; this searches humanity's. |
| **Articulator** | Finishes the sentence your intuition started by naming a link your hand already drew. |

## System and behaviour terms

| Term | Meaning |
|---|---|
| **Prime Directive** | AI augments human cognition; it never replaces it. |
| **Cognitive atrophy** | The failure mode the whole product guards against: the human stops thinking and starts accepting. |
| **Cognitive Ownership** | The fixed split: the human owns goal, intent, click, and direction; the AI owns expansion, stress test, perspective, and association. |
| **1–2 Jump Rule** | AI contributions sit 1–2 cognitive steps from the user's frontier, never further. |
| **Ground Before Nudge** | Context first, question second. |
| **The Click** | The felt, irreducibly human moment when divergence becomes conviction. |
| **Diverging / Converging** | The two session phases. Diverging (default) widens the field; converging sharpens it. Shown as a phase toggle. |
| **Drift** | Current thinking quietly moving away from the north star. The question is always *evolution or drift?* |
| **Adaptive Attunement** | The system reads the *quality* of your thinking (exploratory / transitional / declarative) and shifts its question style (opening / bridging / closing) without being told. |
| **Augmentation Loop** | Externalize → Attune → Judge → Augment → Decide & Teach. |
| **The Judge** | The backend call that decides *whether* anything is worth saying, *where*, and by *which single* role. It replaced the old "Orchestrator". |
| **Maturity** | Whether a specific place on the canvas is ripe for a specific role's move. The judge's gate. |
| **Intervention** | The AI raising its hand. The whole decide → wait → generate → show flow. |
| **Offer** | A pending intervention: the judge says something's worth saying, and the consent timer is running. |
| **Consent timer** / **processing timer** | The visible countdown (default 10s) between "the AI has something" and "the AI generates it". You can pause, defer, "process now", or let it lapse. |
| **Glow / halo** | How an in-view offer arrives: light on the anchor node, not a wall of text. |
| **Sidebar card** | How an offer arrives when its anchor node is off-screen. Clicking it pans to the node. |
| **Directness** | `direct` or `subtle`: how loudly an offer is shown. |
| **Receptivity** | A running score of how welcome the AI's interruptions have been recently. It tunes timer length and loudness. It is **never** used to judge idea quality. |
| **Rejection Insights** | Negative constraints learned from rejected ghosts (hard block / approach pivot / temporary deferral), injected into later prompts. |
| **Impact Check** | Checks whether a held or in-flight AI response has gone stale because the canvas changed underneath it. |
| **Session Complete** | The human-triggered end of a session: Observer Suggestions → Unresolved Threads → Session Closed. |
| **Unresolved threads** | Question edges never answered, contradictions left open, empty nodes. You can carry them forward or discard them. |
| **Carry forward** | Bringing unresolved threads into the next session as pre-loaded items. |
| **Observer structure** | The Observer's output format: it highlights existing **anchor** nodes and proposes a small leveled graph of observations, accepted or rejected **per edge**. *(Designed; not surfaced in the UI yet.)* |
| **Tier-locked offer** | When the best help belongs to a higher plan, the user sees an upgrade card. Weaker help is never substituted. |

## Words to never use (and what to say instead)

| ❌ Don't say | Why | ✅ Say instead |
|---|---|---|
| "AI writes / generates your strategy / plan / answers" | Contradicts the Prime Directive | "AI helps you think it through" / "sharpens your thinking" |
| "AI assistant", "copilot", "chatbot" | Wrong category and wrong posture | "thinking partner", "thinking environment" |
| "Mind map" / "mind-mapping tool" (as a definition) | Mind maps capture destinations, not trails | "a map of how your thinking moves" |
| "Auto-", "one-click", "instantly get" | Implies accepting without thinking | "at the right moment", "when you're ready" |
| "Suggestions" (as a firehose, e.g. "unlimited suggestions") | Volume is the opposite of the value | "a single well-timed nudge" |
| "Edit your goal" | The north star is immutable | "start a new canvas for a new question" |
| "Delete" (for AI nodes you want out of the way) | Set-aside exists to preserve them | "set aside" (restorable); "delete" only for real deletion |
| "Orchestrator" | Retired | "the judge" |
| "Notes" | Not a notes app | "nodes", "thoughts" |
