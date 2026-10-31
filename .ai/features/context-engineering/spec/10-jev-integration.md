# 10 — Jev Integration

Jev is TypeSafe's "System One" model: you send a **state** and a set of typed **questions**; it
returns typed answers your code branches on. No text generation, no parsing.

Reference: https://docs.typesafe.ai/llms.txt (fetch this index before implementing; the facts
below are from docs pages shared during design and may have changed).

## 10.1 What Jev provides (as documented)

| Question type | Use for | Returns |
|---|---|---|
| `Choice` | pick one option from a list | `choice`, `probabilities`, `confidence` |
| `Score` | place the state on an ordered rubric of levels | `score` (0 … levels−1), `probabilities`, `confidence` |
| `Noul` | is this statement true? | `noul` (0–1) — no `confidence` |

- Many questions can go in **one call**; each is evaluated **in parallel and in isolation**
  against the same state. Adding questions barely changes latency and causes no context rot.
- `Choice` works reliably up to roughly 240 options.
- Model at time of writing: `jev-1.12`.
- Pricing at time of writing: $0.042 per 1M input tokens, output free. A 4k-token state costs
  about $0.0002 — **cost is not the constraint; latency is.**
- Rate limit: the public endpoint throttles above roughly 8 concurrent requests.
- Latency: not documented as a number. A cookbook ran 450 requests with 6 workers in "a few
  minutes", i.e. on the order of seconds per request. **Measure it**; keep Jev off any
  per-keystroke path.
- SDK seen in docs is Python (`typesafe_sdk`: `TypeSafeClient`, `Choice`, `Score`, `Noul`,
  `NoulCriteria`; call `client.system_one(state=..., questions=..., model=...)`). If the backend
  is not Python, check the docs index for an HTTP API or other SDK and write a thin typed client.

## 10.2 Design rules for every Jev question [DECIDED]

1. **Atomic questions.** One specific, gut-check judgment per question. Decompose anything that
   needs extended reasoning into several questions and combine in code.
2. **Ask about the task's needs, not about unseen context** (scope, not sufficiency — file 05).
3. **Branch on `confidence`, not the winner's probability.** A 0.45 vs 0.44 split and a 0.45 with
   the rest scattered are different situations; `confidence` distinguishes them.
4. **Low confidence → the recall-safe direction.** Deeper scope, mention instead of skip, keep
   instead of drop. The safe direction is defined per use below.
5. **Verifier questions: `true` = something is wrong**, with explicit `NoulCriteria`. Aggregate
   multiple checks with `max` (one confident red flag is enough), never mean.
6. **Level wording is the threshold.** For 3-level `Score` questions, the middle level's wording
   decides what lands there. Test wordings in the TypeSafe playground on 30–50 real examples
   before shipping.
7. **Every use has a fallback** if Jev errors or times out (table in 10.10). Jev must never be a
   single point of failure for an agent run.

## 10.3 Use: scope classification [DECIDED] — file 05

Only for free-text tasks (presets map deterministically).

```python
state = {
  "task": run.task,
  "focus_node": {"type": focus.type, "text": focus.text},
}
questions = {
  "scope": Choice(
    instructions="What does this task inherently need to look at on the user's thinking canvas?",
    criteria={
      "S1": "Only this node and the nodes directly connected to it (rephrase, expand, add examples, critique the node itself).",
      "S2": "The surrounding branch of reasoning: its parents, siblings, assumptions, evidence and counterpoints.",
      "S3": "Anything anywhere on the canvas: cross-branch connections, contradictions elsewhere, synthesis of the whole canvas.",
    },
  )
}
```
- `confidence < 0.7` [PLACEHOLDER] → next scope up.
- Log `scope` and `scope_confidence`.

## 10.4 Use: traversal frontier decisions [DECIDED] — file 06 §6.6

One call per hop. State holds the task, the agent's interests, the focus, and the frontier
candidates; one `Score` question per candidate edge.

```python
state = {
  "task": run.task,
  "agent": "stress_tester",
  "relations_this_agent_cares_about": ["contradicts", "depends_on (assumptions)", "supports (evidence)"],
  "direction_meaning": "The task asks what the focus idea relies on and what challenges it.",
  "focus_node": focus.text,
  "candidates": [
    {"id": "e17", "from": "Usage-based billing", "edge": "depends_on", "label": "needs Stripe metering", "to": "Stripe metered plans"},
    {"id": "e22", "from": "Survey results", "edge": "relates_to", "label": "same segment", "to": "Enterprise tier"},
  ],
}
LEVELS = [
  "Not needed for this task.",
  "Possibly useful: worth a brief mention.",
  "Needed for this task: include fully and look at what it connects to.",
]
questions = {
  f"edge_{c['id']}": Score(
    instructions=f"For the task, how important is following candidate edge {c['id']} to its target node?",
    criteria=LEVELS,
  )
  for c in frontier
}
```
- Candidates show **titles**, not full text (exploration is cheap; inclusion is decided after).
- Map answers with the recall bias in file 06 §6.6 (`effectiveLevel`).
- Only `follow` edges of the agent policy are sent (file 07); `mention` edges skip Jev.
- Batch if one hop exceeds ~100 candidates; respect the concurrency limit (10.9).

## 10.5 Use: response shape [EXISTING]

Jev already chooses the response shape (hierarchy / sequence). Keep it; add one rule
[PROPOSED]: if `confidence` is low, use a **neutral group** shape (plain set of nodes) rather than
forcing a structure — the user can rearrange it.

## 10.6 Use: output dedupe [OPTIONAL]

After validation, for each new node: take the top-3 most similar existing nodes (embed the new
text, pgvector), and ask a 3-level `Score` per pair (entity-alignment pattern):

- levels: *different idea* / *overlapping but adds something* / *same idea*
- *same idea* → drop the new node (and its edges). *overlapping* → keep.
- Fallback on error: keep everything.

## 10.7 Use: canvas summary gating [OPTIONAL] — file 04

`Score` with levels *cosmetic / minor / substantive* over (old summary + changed nodes). Skip the
summary update on *cosmetic*. Fallback: update anyway.

## 10.8 Use: verification cascade [OPTIONAL, later]

Pattern from TypeSafe's SDE-cascade cookbook: a cheaper model generates, Jev verifies with narrow
per-item checks, and only failures are regenerated by a stronger model.

Applies where output can be checked against the canvas:
- **Canvas summary**: "Does this summary claim something not present in the listed nodes?",
  "Does it omit a node that is central to a main thread?"
- **Synthesizer**: "Is this claim attributed to the user's nodes actually supported by them?"
- **Structurer**: "Does this hierarchy drop content from the original nodes?",
  "Does it invent nodes not grounded in the canvas?"
- **Critic/provoker** (harder, outputs are meant to be new): "Does this repeat an existing node?",
  "Is this generic rather than specific to this canvas?"

Adaptation: verify **per node**, regenerate **per node** (only the failing node), not the whole
response. Validate first on 30–50 hand-labeled outputs that the flags actually separate good
from bad; the cookbook's numbers are TypeSafe-internal and on extraction tasks.

## 10.9 Other possible uses [OPTIONAL]

- **Relevance rerank** in `skeleton`/`traversal` packing: one `Score` per candidate node vs the
  task, feeding `score` in file 06 §6.7.
- **Agent routing** for free text with no agent chosen: `Choice` over agents; if confidence is
  low, run the top two in parallel (fits the parallel-exploration product idea).
- **Implicit edges** [DEFERRED]: file 03 §3.4.

## 10.10 Operations [DECIDED]

**Concurrency.** Wrap all Jev calls in an Inngest step with a **global concurrency key**
(e.g. `"jev"`, limit 6) [PLACEHOLDER] to stay under the endpoint limit.

**Fallbacks (recall-safe):**

| Use | If Jev fails / times out |
|---|---|
| Scope classification | Use S2 (or S3 if the task text mentions "whole canvas" / "anything" / "elsewhere") |
| Traversal frontier | Treat every candidate as level 1 (mention); stop expanding |
| Shape | Neutral group |
| Output dedupe | Keep all nodes |
| Summary gating | Update the summary |

**Logging.** Store per run: Jev question keys, answers, confidences, latency. Needed for eval
(file 12) and caching (file 11).

## 10.11 TypeSafe docs pages this design drew on

Find them via the docs index (https://docs.typesafe.ai/llms.txt).

| Page | Pattern taken | Used in |
|---|---|---|
| Introduction | Typed questions over a shared state, evaluated in parallel; decompose into atomic questions | Everywhere |
| Cookbook: Knowledge graph entity alignment | 3-level `Score` with a *middle* "uncertain" level instead of a fitted threshold; companion `Noul`s that explain *why*; cheap first pass narrows candidates, Jev decides | Traversal levels (10.4), output dedupe (10.6), implicit edges (deferred) |
| Cookbook: SDE cascade | Cheap model generates → Jev verifies per field with `true` = wrong → escalate only failures; `max` aggregation | Verification cascade (10.8) |
| Cookbook: Classification using confidence | Branch on `confidence`, not winner probability; fall back to a coarser answer when unsure | Scope classification and shape (10.3, 10.5). Note: here the fallback goes *deeper* (more context), the opposite of the cookbook, because missing context costs more than extra context |

Cautions carried over from those pages: their accuracy numbers come from small samples or
TypeSafe-internal runs on extraction/classification tasks. Re-derive every threshold on our own
canvases (file 12).
