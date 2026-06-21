# ThinkingCanvas — Foundation Principles

> **The product document.** Intent, framework, behaviour, building blocks, and the shift it brings to generative AI.
> _Where human thinking expands — AI augments, not replaces._

---

## About This Document

This is the **foundational layer** for ThinkingCanvas — the single document that explains *why* the product exists, *what* it believes, *how* it behaves, and *how* it actually works down to the core building blocks. It sits above the implementation and below nothing.

It is written to be **extended**. The three reference documents it builds on — `ThinkingCanvas_Foundation.docx` (philosophy), `ThinkingCanvas_DevPlan.docx` (build order), and `ThinkingCanvas_TechnicalBuild.docx` (architecture) — each open one face of the product. This document ties those faces into one coherent first-principles narrative, and every section is designed as an anchor you can hang new dimensions and layers off later.

| If you want… | Read |
|---|---|
| The narrative — why this exists, what it changes | This document, top to bottom |
| The philosophy in full | `ThinkingCanvas_Foundation.docx` |
| The build order and phasing | `ThinkingCanvas_DevPlan.docx` |
| The architecture and schemas | `ThinkingCanvas_TechnicalBuild.docx` |
| Task-scoped agent context | `.ai/context/*.md` (loaded per the `CLAUDE.md` table) |

> **Authority note.** Where this document touches the technical stack, it reflects the *current* canonical architecture: a single Google AI (Gemini) provider, Supabase, Inngest, Hono, Mastra, and Upstash Redis. Earlier references to other model providers in source material are superseded by `.ai/context/ARCHITECTURE.md`.

### Table of Contents

1. [The Intent — Why ThinkingCanvas Exists](#part-i--the-intent)
2. [The Problems It Solves](#part-ii--the-problems-it-solves)
3. [Foundational Principles — The Invariants](#part-iii--foundational-principles)
4. [The Framework That Drives the System](#part-iv--the-framework-that-drives-the-system)
5. [Behaviour — How It Acts](#part-v--behaviour)
6. [Core Building Blocks — How It Actually Works](#part-vi--core-building-blocks)
7. [How It Helps People](#part-vii--how-it-helps-people)
8. [The Shift in Generative AI](#part-viii--the-shift-in-generative-ai)
9. [Dimensions to Open Next](#part-ix--dimensions-to-open-next)
10. [Glossary — The Canonical Vocabulary](#glossary)

---

## Part I — The Intent

### It was discovered, not specified

ThinkingCanvas was not designed from a requirements doc. It was **discovered through a conversation** — a live demonstration of the thing it would become. In a Socratic dialogue, no answers were handed over and no finished outputs were given. Instead, questions were held at exactly the right cognitive distance — one to two steps ahead — and the human did the walking.

> "You didn't receive this knowledge. You generated it." — the moment the product was born.

This origin is not a nice story bolted onto a feature list. It **is** the design philosophy in motion. ThinkingCanvas exists to recreate, deliberately and at scale, the conditions under which that conversation happened: conditions where human thinking naturally expands, with AI as the invisible architecture of the expansion rather than the source of the conclusions.

### The intent in one sentence

> **Build the conditions under which a human and an AI together reach a point that neither could have reached alone — and make sure the human owns the arrival.**

Everything downstream — the directed graph, the five AI roles, the ghost nodes, the attunement layer, the per-node consent gate — is an instrument tuned to that single intent.

### The stake behind the intent

We are living through a step-change in AI capability. The dominant interface for that capability is the **answer machine**: ask a question, receive a finished output. It is extraordinary, and it carries a quiet cost. When the easiest path is to accept a generated conclusion, thinking gets *outsourced*. The muscle that forms original structure — that holds tension, senses convergence, and makes the leap — slowly stops being used.

ThinkingCanvas treats that risk — **cognitive atrophy** — as the defining problem of this era, not a footnote. The product is a structural bet that the highest-value thing AI can do is not to think *for* you, but to make *your* thinking go further, faster, and deeper than it otherwise could. AI augments human cognition; it never replaces it. That is not a constraint on the product. It is the entire value proposition.

---

## Part II — The Problems It Solves

ThinkingCanvas is built for people whose **core deliverable is a decision, a strategy, or a structure — not a document**. For them, the thinking *is* the work. Today that work happens in tools that were never built for it. Here is the specific gap each one leaves, and how ThinkingCanvas closes it.

| The problem | Why existing tools fail | What ThinkingCanvas does |
|---|---|---|
| **Non-linear thinking forced into linear tools** | Docs and chat windows are one-dimensional. Real thinking branches, loops back, and jumps. The structure is lost the moment it's typed. | A spatial directed graph where structure *is* the medium — branches, loops, and jumps are first-class. |
| **The answer-machine trap (cognitive atrophy)** | Chatbots hand over conclusions. Accepting them requires no thinking. The user stops generating and starts collecting. | Every AI contribution is a *nudge that demands a cognitive response*. Nothing can be accepted without thinking. |
| **The lost trail** | Mind maps capture *where you ended up* — nodes and connections — but not *how you got there*. | Sequence is stored as data. The order of thoughts reveals the **direction of travel**, which is what lets AI predict the next useful step. |
| **Silent drift** | Over a long session the goal quietly morphs and no one notices. The most invisible failure mode in brainstorming. | A fixed north star (`original_intent`) plus an Observer that flags when current thinking has drifted from it — *evolution or drift?* |
| **The unarticulated connection** | You sense two ideas are related but can't yet say why — and the moment passes unrecorded. | Drawing an edge between two existing nodes triggers the Articulator: the hand moved before the mind, and the system helps finish the thought. |
| **The convergence problem** | Brainstorming has a diverge phase and a converge phase, but the transition can't be scheduled or button-pressed. It's *felt*. | Adaptive Attunement reads the texture of your language and shifts the AI's posture from opening to sharpening — without you announcing it. |
| **Scattered, ephemeral thinking** | Thinking lives in half-finished Notion docs, Slack threads, and meeting notes. Nothing carries forward with structure. | Canvases persist; sessions carry unresolved threads forward. The thinking has a permanent home and a memory. |

> The throughline: existing tools are built for the **output** of thinking. ThinkingCanvas is the first tool built for the **act** of thinking.

---

## Part III — Foundational Principles

These are the invariants. They do not change between releases, and every feature must trace back to them. If a proposed change violates one of these, the change is wrong — not the principle.

### The Prime Directive

> **AI augments human cognition. It never replaces it.**

The test applied to *every* AI contribution: **does this require a cognitive response from the human?** If the human can accept it without thinking, it has failed — no matter how impressive the output.

### The Ownership Split

Cognitive ownership is non-negotiable and cannot be automated.

| The human owns | The AI owns |
|---|---|
| The **goal** — what problem is being solved | The **expansion** — directions not yet seen |
| The **intent** — why it matters | The **stress-test** — gaps in formed ideas |
| The **click** — the convergence moment of recognition | The **bird's-eye view** — spatial + temporal awareness |
| The **direction** — which path to take forward | The **outer subconscious** — leaps across humanity's knowledge |

### The Principle Set

| Principle | Statement |
|---|---|
| **1–2 Cognitive Jump Rule** | Every AI contribution must sit 1–2 cognitive steps from the user's current frontier — never further. Distance creates alienation, not expansion. |
| **Ground Before Nudge** | AI lays ground first (a reframe, mirror, pattern, reference, or contradiction) *then* asks the question. The nudge only lands when the ground is laid. |
| **The Convergence Principle** | The "click" — the moment divergence becomes conviction — is irreducibly human. AI cannot manufacture it; it can only enrich the field so the click lands on fertile ground. |
| **Sequence as Data** | The order in which thoughts are created is as important as the thoughts. The trail reveals direction; direction enables prediction. |
| **Question Edges as Signal** | An edge a human draws but cannot label is the highest-value signal in the system. It marks the exact boundary of their current knowledge. |
| **The Hand Knows First** | Drawing a line between two nodes is a cognitive act that *precedes* understanding why. AI closes the gap — never replaces the final human choice. |
| **2–3 Completions, Not One** | When AI articulates a connection it offers 2–3 possibilities, never one. One answer closes thinking; multiple force a cognitive choice and keep ownership with the human. |
| **Appreciation Stands Alone** | Not every AI contribution is a door — sometimes it is a window. Appreciation marks a breakthrough and lets it land. The follow-up question is optional. |
| **Drift Detection** | The original intent is sacred and immutable. AI continuously compares current thinking to the north star and surfaces divergence. |
| **The Ghost Threshold** | AI contributions arrive as **ghost nodes** — translucent, floating, not yet real. Nothing crosses into the real canvas without deliberate human consent. Acceptance is the visual act of ownership transfer. |
| **No Cognitive Atrophy** | If the user starts accepting AI nodes without thinking, the design has failed. Every interaction must require a cognitive response. |

---

## Part IV — The Framework That Drives the System

The five AI roles describe *what* AI does. This section describes the engine that decides *when* and *how* — the operating framework that turns "augment, not replace" from a slogan into a mechanism.

### Three pillars

Augmentation becomes real only when three things hold at once. These are the load-bearing pillars of the entire system:

1. **Cognitive Ownership** — the division of labour above. The human holds the goal, the intent, and the click; the AI holds expansion, challenge, perspective, and association. Cross this line and you get replacement, not augmentation.

2. **Adaptive Attunement** — the system reads the *quality* of thinking, not just the content, and shifts its orientation in response — from opening to closing, from widening to sharpening — **without being instructed**. The word comes from music (an instrument tuning to another in real time) and from therapy (a clinician shifting their entire presence in response to what they sense). It is active listening, made into software.

3. **The Calibrated Nudge** — every contribution is *ground before nudge*, held to 1–2 cognitive jumps, and delivered through a consent gate (the ghost). This is what makes AI feel like a partner standing beside you rather than an oracle talking at you.

> Remove any one pillar and the product collapses into something that already exists: drop ownership and it's an answer machine; drop attunement and it's a static assistant; drop calibration and it's an idea firehose.

### The Augmentation Loop

The pillars run on a repeating loop — the heartbeat of every session:

```
            ┌─────────────────────────────────────────────────────┐
            │                                                     │
            ▼                                                     │
   1. EXTERNALIZE          2. ATTUNE              3. ORCHESTRATE   │
   Human writes a    →     System reads the   →   Route to the    │
   node / draws an        quality + texture       right cognitive │
   edge on the canvas     of the thinking         role + posture  │
                                                        │         │
            ▲                                           ▼         │
            │                                                     │
   5. DECIDE & TEACH      4. AUGMENT (GHOST)                      │
   Human accepts /   ←    The role offers a    ←──────────────────┘
   rejects / ignores      ghost pair: ground +
   → the choice feeds     nudge, 1–2 jumps ahead,
   back into the system   floating, not yet real
```

Each stage maps to a real component:

| Stage | What happens | Driven by |
|---|---|---|
| **1. Externalize** | A thought becomes a node; a felt link becomes an edge. | The canvas (directed graph) |
| **2. Attune** | The texture of recent language + node velocity is read into a cognitive mode and a recommended question style. | Attunement Layer |
| **3. Orchestrate** | Attunement state + hard canvas signals → a routing decision, gated by tier and `canAgentFire()`. | Orchestrator |
| **4. Augment** | The chosen role generates a ghost pair, calibrated to distance and posture, streamed in alive. | The five roles + ghost streaming |
| **5. Decide & Teach** | The human accepts, rejects, or ignores. Rejections become negative constraints; acceptances confirm direction. | Ghost threshold + Rejection Insights |

The loop is **debounced** — it fires on *pauses*, not on every keystroke — because a rapid node-edge-node burst is one unit of thinking, not three. Two signals bypass the debounce and fire immediately, because they are explicit requests for help: a **question edge** and an **edge drawn between two existing nodes**.

### The cognitive arc the loop serves

The loop runs inside a larger arc — the natural shape of a thinking session:

```
   DIVERGE  ───────────►  ◦ CLICK ◦  ───────────►  CONVERGE
   widen the field        the felt moment           sharpen the idea
   (Expander)             of recognition            (Stress-Tester)
                          (irreducibly human)
```

Adaptive Attunement is the layer that senses *where on this arc you are* and tunes the AI's questions accordingly: **opening** while you explore, **bridging** as convergence approaches, **closing** once you've committed. The user never flips a switch. Their thinking changes, and the system listens.

---

## Part V — Behaviour

This is how the framework feels in use — the observable behaviour of the system.

### The canvas is externalized thinking

The user thinks *onto* a directed graph. Nodes are thoughts; edges are the relationships between them. Human nodes and AI nodes are visually distinct — the human's contributions are solid and permanent; the AI's arrive as ghosts. The canvas is single-user and quiet: the backend never pushes unsolicited changes onto it. The only thing the server ever streams to the canvas is a ghost.

### The five roles

AI does not have one role — it has five, each activated by a different signal and a different phase.

| Role | Activates on | What it holds | Posture |
|---|---|---|---|
| **Expander** | New node during divergence | Unexplored directions, 1–2 jumps ahead along your trail | Human + AI |
| **Stress-Tester** | Convergence click / converge phase | Gaps, weak assumptions, unresolved contradictions | Human + AI |
| **Observer** | Continuous background + Session Complete | Bird's-eye spatial map + drift vs. the north star | Human + AI |
| **Outer Subconscious** | A question edge (unlabeled link) | Cross-domain leaps across all recorded human knowledge | **AI only** |
| **Articulator** | An edge between two existing nodes | The connection your hand drew before your mind could name it | Human + AI |

Two notes that matter:

- **The Outer Subconscious is the one role only AI can play.** Your inner subconscious searches inward across one lifetime; the outer subconscious searches outward across humanity. Not smarter — *unbounded*. The human still holds the intention and decides what matters.
- **The Observer never hands you a sentence to accept.** It highlights *existing* canvas nodes as anchors and proposes a small acyclic structure of observation nodes hanging off them. You pull on the thread yourself, accepting or rejecting each connection individually — the most hands-off role by design.

### The two-node grammar of an AI contribution

Every conversational AI contribution is a **pair**: a **Context Node** that lays ground, followed by a **Question Node** that nudges. The agent chooses the context type from the signal in the moment:

| Context type | Fires when | Then |
|---|---|---|
| **Reframe** | You named something correctly but haven't seen its full weight | name it at higher resolution → question |
| **Mirror** | You said something powerfully and may not have noticed | reflect it back at higher fidelity → question |
| **Pattern** | Two+ prior nodes are converging and you haven't seen it | name the pattern → question |
| **Reference** | You're circling a concept with a precise name elsewhere | name it → question |
| **Contradiction** | Your current node pulls against a prior one | surface the tension → question |
| **Appreciation** | A genuine breakthrough just happened | mark it — and *optionally* let it stand alone in silence |

### The ghost threshold

Ghost nodes are the physical embodiment of the philosophy: **AI offers, the human decides.**

- They are translucent (40–50% opacity), dashed, floating above the canvas — *pending*, never real.
- **Accept** = the pair crosses the threshold and becomes solid, owned nodes. **Reject** = it disappears. **Ignore** = it waits patiently; there is no auto-fade.
- The limit is **one ghost pair per real node** — anchored spatially, so the canvas never floods.
- Acceptance is the exact moment **cognitive ownership transfers**. The thought becomes yours.

### It learns what you *don't* want

When you reject a ghost, you give a reason. The **Rejection Insights Engine** converts that into a structured negative constraint and injects it into the agent's next prompts:

```
Too Abstract   → hard_block         → "Avoid high-level analogies"   → blocked
Too Technical  → approach_pivot     → "Keep essence, simplify"       → re-framed
Skip for now   → temporal_deferral  → "Pause this theme 3 turns"     → cooled down
```

This is augmentation that tunes itself to *you* — not by profiling you, but by listening to your refusals.

### The invited voice — Session Complete

Throughout the session the Observer watches and *queues*, but it does not interrupt. It speaks only when invited, at the human-triggered **Session Complete** gate:

1. **Observer Suggestions** — what it noticed but held back. You pull each thread yourself.
2. **Unresolved Threads** — question edges never answered, contradictions left open, nodes left empty. Carry forward or discard.
3. **Session Closed** — the session is saved, the north star preserved, and selected threads become live again in the next session.

> AI waited the entire session. It speaks now because it was asked. That restraint *is* the product.

---

## Part VI — Core Building Blocks

This is the top layer of how things actually work — the substrate beneath the behaviour.

### Block 1 — The directed graph (the substrate)

The data structure is the architecture. A standard mind map is a *snapshot*; ThinkingCanvas captures the **trail** — the order, direction, and causality of how one thought gave birth to another.

- **Nodes** carry `content`, an `owner` (human / ai), a `node_type`, a `sequence_index` (its place in the trail), a directional `summary` and `direction_marker` generated at save, and a vector `embedding`.
- **Edges** carry an `edge_type` that encodes the *cognitive relationship* — this is the most critical data in the system:

| Edge type | Meaning | AI signal strength |
|---|---|---|
| **Logical** | This thought follows from that one | Medium |
| **Doubt** | This thought questions or challenges that one | Medium |
| **Question** | A connection is sensed but cannot yet be named | **Highest** |
| **Associative** | A distant, non-obvious leap across domains | AI-only |

> Nodes + edges alone give AI your *destination*. Nodes + edges + **sequence** give AI your *direction of travel*. That distinction is the whole point.

### Block 2 — Canvas and Session (the workspace model)

```
User
 └── Canvas  (permanent container — never deleted)
       ├── original_intent  (THE NORTH STAR — immutable after creation)
       └── Sessions  (episodic thinking runs)
             ├── Session 1 → node_sequence: [n1, n2, n3]   (closed)
             ├── Session 2 → node_sequence: [n4, n5]        (closed)
             └── Session 3 → node_sequence: [n6, n7]        (active)
```

- A **Canvas** is the permanent home and holds the immutable north star.
- A **Session** is one continuous thinking flight; its `node_sequence` holds only the nodes created in *that* run.
- Nodes belong to the **canvas** (visible across all sessions) but are created in a **session**.
- This enables **time-travel**: revisit a canvas, start a new session, and the agents see the full history.

### Block 3 — The agent pipeline (the brain)

Two infrastructure components stand in front of the five content roles:

- **The Attunement Layer** runs *first* on every node event. It is a pure signal reader — it generates no content. It reads the last few node texts and the velocity between them and outputs a `cognitive_mode` (exploratory / transitional / declarative) and a recommended `question_style` (opening / bridging / closing).
- **The Orchestrator** combines that soft reading with hard canvas signals and decides which role to fire and with what posture — *always* checking subscription tier and `canAgentFire()` before routing. If a node already has a pending ghost, it silently drops: the ghost already there is the response.

The pipeline is **durable and debounced** (via Inngest, keyed by `session_id`), so it survives restarts and fires on pauses, not keystrokes — with the two immediate-fire bypasses noted earlier.

### Block 4 — Agent memory and the serializer (how AI remembers without bloat)

Each agent keeps its own **thread, scoped per canvas** (not per session) — so knowledge accumulates across a canvas's whole history, and the Observer's framing never contaminates the Expander's.

Before every call, a **serializer** converts the thread into a tiered text format. Recent turns are full-fidelity; older turns collapse into directional summaries; the north star and click moment are never compressed. Full content is never deleted — only moved to the database and retrieved on demand.

Agents start with a lean context and **navigate the graph with tools** — a cursor pattern, like a person who reads a node and then asks what came before, rather than swallowing the whole canvas at once:

```
get_content · get_window · traverse_trail · get_big_picture ·
get_siblings · get_path · get_branch · semantic_promote
```

`semantic_promote` is the clever one: it finds thematically related distant nodes by vector similarity and injects *only* those not already at full fidelity — and it pairs them with their `direction_marker`, so the agent can tell genuine resonance from **false resonance** (two nodes can be semantically close but point in opposite directions).

### Block 5 — Ghost streaming (how ghosts arrive alive)

Ghost content does not appear all at once — it streams in, word by word, so the contribution feels alive rather than dropped. The path is deliberately **off the database**:

```
Inngest worker  ──publish──►  Upstash Redis  ──subscribe──►  Hono SSE  ──►  Canvas
                 spawn │ chunk │ done            (stateless)        EventSource
```

Redis pub/sub carries the high-frequency token traffic so Postgres never sees it. The sequence is: publish a `spawn` signal → sleep ~1.5s while the frontend animates an empty ghost frame → stream `chunk`s as the agent generates → publish `done`. **Redis is for ghost streaming only** — never canvas state.

### Block 6 — The technical framework (the stack)

The conceptual framework runs on a deliberately small, single-provider stack:

| Concern | Choice | Why |
|---|---|---|
| Web server | **Hono** | Lightweight, persistent process (needed for SSE + durable timers) |
| Agent framework | **Mastra** | TypeScript-native agents, tools, and one registry for tracing |
| Durable pipeline | **Inngest** | Debounce-by-session, retries, step isolation |
| Database | **Supabase** (Postgres + pgvector) | Graph store, vectors, auth, RLS — all in one |
| Streaming | **Upstash Redis** | Pub/sub for ghost tokens; protects Postgres |
| AI | **Google AI (Gemini)** — single provider | Content roles on `gemini-2.5-flash-lite`; routing/observer/outer-sub on `gemini-2.5-flash` (thinking high where depth is needed); `gemini-embedding-2` for vectors |
| Observability | **Langfuse** (via Mastra) | Trace every agent call from day one |

> A few decisions look arbitrary but aren't: **one thread per agent per canvas** (prevents cross-agent contamination), **original intent immutable** (drift detection needs a fixed anchor — change it and you start a new session), and **system prompts are constants, never built from user input** (a security and integrity invariant).

---

## Part VII — How It Helps People

ThinkingCanvas is for anyone who can answer *yes* to one question:

> **"Do you regularly have a thinking problem you can't solve in a linear document or a chat window?"**

It helps them along two axes — *who they are* and *what cognitive job they need done*.

### By the cognitive job

Regardless of profession, the system offers five distinct kinds of help — one per role:

- **Open the field** when you're stuck or narrow (Expander)
- **Sharpen the idea** once you've committed, before the world does it for you (Stress-Tester)
- **Keep you oriented** — show the shape of what you've built and whether you've drifted (Observer)
- **Make the impossible connection** — bridge your thought to something from a field you'd never have searched (Outer Subconscious)
- **Finish the sentence your intuition started** — name the link your hand already drew (Articulator)

### By who they are

| Profile | The thinking problem | What ThinkingCanvas gives them |
|---|---|---|
| **Founders & early builders** | Vast idea space, high stakes, sudden clicks; blank pages and chat windows capture none of it | Work through product-market fit (diverge → converge), stress-test the thesis *before* investors find the fracture, catch the connection between two hunches |
| **Product managers** | Constant context-switching across user problems, constraints, and goals; thinking scattered across tools | Diverge on the problem then converge on the solution, surface cross-domain analogies for hard UX, carry unresolved threads into the next sprint, catch when a feature debate quietly became a different problem |
| **Researchers & academics** | Synthesizing literature and forming original arguments; linear notes destroy structure | The directed graph *is* the structure of an argument; the Articulator links papers you sensed were related; open questions at session end become the next session's start |
| **Consultants & strategists** | Complex client problems, competing hypotheses, the need to synthesize fast and present with confidence | Build the causal map of a situation, have the Stress-Tester challenge the recommendation before the client does, surface what was left unresolved |

> **Secondary, high-value, slightly later:** writers and essayists (narrative maps beautifully to a graph), graduate students (thesis development), coaches and therapists (mapping a client's thinking live — needs shared view), and executives (strategic decisions — needs polished onboarding).

The throughline across all of them: ThinkingCanvas measures success not by what it produced *for* you, but by whether you feel you built something **with** it.

---

## Part VIII — The Shift in Generative AI

Most of generative AI today is organized around a single metaphor: **the oracle**. You ask; it answers. The interface optimizes for the *quality of the output* and measures success by *task completion*. This is enormously useful — and it quietly trains a dependency, because the path of least resistance is to accept the answer and move on.

ThinkingCanvas proposes a different metaphor: **the cognitive environment**. The AI is not the source of conclusions; it is the architecture around your thinking that makes your thinking go further. The output is a byproduct. **The upgraded thinker is the product.**

### What concretely shifts

| Dimension | Answer-machine paradigm | ThinkingCanvas paradigm |
|---|---|---|
| **Unit of value** | The answer the AI produced | The insight *you* generated |
| **AI's posture** | Replace / automate the work | Augment / attune to the worker |
| **Interaction model** | Turn-taking chat | Spatial, ambient, consent-gated |
| **Context strategy** | Dump everything in the window | **Calibrate distance** — 1–2 jumps, the trail is the context |
| **Trigger** | An explicit prompt | Reading the *texture* of thought |
| **Memory** | Stateless prompt or flat history | Canvas-scoped, sequence-aware thread |
| **Primary failure guarded against** | Hallucination | **Cognitive atrophy** |
| **Success metric** | Task completed | *"Neither could have reached this alone."* |

### Three deeper shifts

1. **From output-optimization to process-amplification.** The frontier question stops being "how good is the answer?" and becomes "how much better did the human's thinking get?" That reframes the entire design surface — you start engineering for *cognitive response*, not for fluency.

2. **From context-maximalism to calibrated distance.** The reflex of current systems is to give the model *more* — more context, more retrieval, more tokens. ThinkingCanvas inverts it: the 1–2 jump rule and the lean per-agent trail are a discipline of giving *less, but exactly right*. Relevance is a function of *cognitive proximity*, not volume.

3. **From the prompt to the relationship.** As models get better at producing answers, the marginal value of one more capability point shrinks, and the marginal value of the *relationship* between human and model grows. Adaptive Attunement — software that reads the quality of your thinking and shifts its presence without being told — is a bet that the next frontier is not capability but **partnership**.

### A new category

> ThinkingCanvas is the first tool built for the **act** of thinking, not the **output** of it.

It is not a note-taking tool, not a mind map, not a chatbot. It is a **thinking environment** — a place where the process of thinking becomes visible, traceable, and amplifiable, and where the human stays the author of every conclusion. If the answer-machine era asked "what can AI do *for* us?", this is a deliberate move to the harder, more important question: **"what can AI help us *become*?"**

---

## Part IX — Dimensions to Open Next

This document is a foundation, not a ceiling. Each layer below can be added *on top of* the principles in Part III without revising them — that is the test of a good foundation. Items marked with a release reflect the current roadmap; the rest are open directions.

| Dimension | What it opens | Notes |
|---|---|---|
| **Cognitive profile** | Learning *how* you think — preferred jump distance, convergence timing, which suggestions you ignore | `v1.5` — needs 3+ sessions of data to be meaningful |
| **Thematic & behavioural patterns** | Surfacing the topics you return to and the way you tend to think, across canvases | `v1.5` |
| **Multiplayer / shared thinking** | Two or more people thinking on one canvas; coaches and therapists mapping live | Needs a real-time collaboration layer — a distinct architectural decision |
| **External-knowledge Outer Subconscious** | Grounding cross-domain leaps in a real knowledge graph rather than model memory alone | GraphRAG-style retrieval; deferred until core value is validated |
| **New roles & edge types** | The role set and the four edge types are extensible — new cognitive jobs can be added as first-class roles | Each must pass the ownership and 1–2-jump tests |
| **Cross-canvas synthesis** | Letting the system reason across a user's *many* canvases — a portfolio of thinking | Builds on canvas-scoped threads |
| **Richer attunement signals** | Beyond language quality and velocity — incorporating edit patterns, dwell, revision behaviour | Strengthens the Adaptive Attunement pillar |

> **How to extend this document:** add a new Part for a major dimension, or a new row to the tables it already contains. Keep Part III (the invariants) stable — new layers earn their place by *obeying* the principles, not amending them.

---

## Glossary

The canonical vocabulary. Future documents and features should reuse these exact terms.

| Term | Meaning |
|---|---|
| **Augmentation Loop** | The five-stage heartbeat: Externalize → Attune → Orchestrate → Augment → Decide & Teach |
| **Adaptive Attunement** | The system reading the *quality* of thinking and shifting its orientation without being told |
| **Cognitive Ownership** | The fixed split: human owns goal/intent/click/direction; AI owns expansion/stress-test/perspective/association |
| **The Click** | The felt, irreducibly human moment when divergence becomes conviction |
| **1–2 Jump Rule** | AI contributions must sit 1–2 cognitive steps from the user's frontier — never further |
| **Ground Before Nudge** | Context node first (lay the ground), question node second (the nudge) |
| **Ghost Node / Ghost Pair** | A translucent, pending AI contribution; nothing crosses into the real canvas without human consent |
| **The Threshold** | The boundary a ghost crosses on acceptance — the moment ownership transfers |
| **North Star (`original_intent`)** | The immutable goal of a canvas, the anchor for drift detection |
| **Drift** | Current thinking quietly moving away from the north star — evolution or silent loss |
| **Question Edge** | An edge drawn but unlabeled — the highest-signal input; the frontier of the user's knowledge |
| **Trail / Sequence** | The ordered path of node creation — the *direction* of thinking, stored as data |
| **Canvas** | The permanent thinking container; holds the north star and all sessions |
| **Session** | One episodic thinking run within a canvas |
| **The Five Roles** | Expander, Stress-Tester, Observer, Outer Subconscious, Articulator |
| **Outer Subconscious** | The AI-only role: associative leaps across all recorded human knowledge |
| **Rejection Insights** | Negative constraints learned from what the human rejects, injected into later prompts |
| **Cognitive Atrophy** | The failure mode the whole product guards against: the human stops thinking and starts accepting |

---

> **The core promise, restated:** *AI and human together reached a point where individually neither could have arrived alone.* This is the measure of every session — and the measure of this document.

_ThinkingCanvas — Foundation Principles · v0.1_
