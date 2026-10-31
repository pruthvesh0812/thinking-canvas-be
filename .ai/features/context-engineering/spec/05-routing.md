# 05 — Routing: Scope × Budget → Strategy

Every agent run is routed by **two independent inputs**, decided before any retrieval:

1. **Scope** — how much of the canvas the *task* inherently needs. Decided from the task.
2. **Budget category** — how big the canvas is relative to the token budget. Decided from a
   single DB read.

A third input, the **agent policy** (file 07), decides *which edge types* to prioritize within
the chosen scope. Scope decides *how deep*; policy decides *which paths*.

## 5.1 Scopes [DECIDED]

### S1 — Neighborhood
The task is about the focus node itself; immediate context is enough.
- **Includes:** focus node (full) + all 1-hop neighbors (full text, with edge type + label) +
  canvas title/goal.
- *[PROPOSED]* also include the **ancestor chain titles** (follow outgoing `elaborates` up to the
  root, titles only). Costs a few tokens and gives the "why does this node exist" frame (P1).
- **Hub guard:** if the focus has more than ~25 neighbors [PLACEHOLDER], full text for the
  closest/most relevant (agent policy order, then recency), titles for the rest.
- S1 never sends the whole canvas, even on small canvases — unrelated nodes distract.
- Examples: "Reframe this", "Expand this into sub-points", "Give me more examples other than
  what I created" (needs the existing children/examples to avoid duplicates — that's why S1
  includes 1-hop and not just the focus).

### S2 — Branch
The task needs the surrounding reasoning: parents, siblings, assumptions, counterpoints.
- **Base region:** focus (full) + 1-hop (full) + hop-2 (titles + edge labels) + semantic matches
  (3–5, strict similarity floor) + recent edits (titles).
- **Then by budget category** (5.3): whole canvas / skeleton / guided traversal.
- Examples: "Find issues with my thinking for this pricing method", "Stress test this",
  "Compare with the alternatives", "Is this consistent with the rest of this branch?"

### S3 — Canvas-wide
The task needs anything anywhere on the canvas.
- **Then by budget category**: whole canvas / skeleton + summary / traversal + more seeds +
  summary.
- Examples: "Does anything elsewhere contradict this?", "What connects this to X?",
  "Synthesize the whole canvas."

## 5.2 Classifying scope [DECIDED]

1. **Preset UI actions map deterministically** — no model call:

   | Preset action [PROPOSED mapping] | Scope |
   |---|---|
   | Reframe / Rephrase | S1 |
   | Expand / Break down | S1 |
   | More examples | S1 |
   | Critique this node | S1 |
   | Stress test | S2 |
   | Find issues in my reasoning | S2 |
   | Compare alternatives | S2 |
   | Structure this branch | S2 |
   | Find connections | S3 |
   | Synthesize canvas | S3 |

2. **Free-text tasks → Jev `Choice`** over {S1, S2, S3}, with option descriptions written as
   *what the task needs to look at* (not "is the context sufficient"). See file 10 §10.2.
3. **Low confidence → go one scope deeper.** If Jev `confidence` < 0.7 [PLACEHOLDER], use the
   next scope up (S1→S2, S2→S3). Extra context costs tokens; too little costs answer quality.
   Branch on `confidence`, not on the winner's probability.
4. Record `scope`, `scope_source`, `scope_confidence` on `agent_runs`.

**Why scope, not sufficiency:** a "given this context, is it enough?" check cannot know about
nodes it has not seen. Scope is answerable from the task alone, in one call. (Comparing the two
approaches is an offline experiment in file 12, not a production feature.)

## 5.3 Budget categories [DECIDED structure, PLACEHOLDER numbers]

```
available = per_call_context_cap
          − fixed_layers_tokens        # system prompt, agent instructions, task, thread notes, tool schema
          − output_reserve_tokens
```

| Category | Condition | Meaning |
|---|---|---|
| `small` | `canvas.token_count_total ≤ min(SMALL_MAX, available)` | Whole canvas fits comfortably. |
| `medium` | not small, and `region_tokens + skeleton_tokens ≤ available` and `token_count_total ≤ MEDIUM_MAX` | Full text for the relevant region, titles+edges for everything else. |
| `large` | otherwise | Guided traversal + stubs (+ summary). |

Starting values: `SMALL_MAX = 15_000`, `MEDIUM_MAX = 50_000` tokens [PLACEHOLDER]. Tune on real
canvases where quality, cost, and latency start to bend.

**Check size first.** `canvases.token_count_total` is maintained on write (file 03), so the
category is known from one read, *before* any semantic search or traversal. On small canvases
the semantic and recent queries are not run as retrievals; they become annotations (file 06).

**Hysteresis.** Switch category only when clearly past a threshold (≥10% beyond it)
[PLACEHOLDER], so a canvas sitting at the boundary does not flip strategies between runs.
Simplest implementation: compare against `threshold × 1.1` when moving up and
`threshold × 0.9` when moving down, using the category of the previous run on that canvas.

`skeleton_tokens` estimate: sum of title tokens for all nodes + ~8 tokens per edge (+ label
tokens). Compute with one aggregate query, or maintain alongside `token_count_total`.

## 5.4 The full decision table [DECIDED]

| | small | medium | large |
|---|---|---|---|
| **S1** | neighborhood | neighborhood | neighborhood |
| **S2** | whole canvas, annotated | skeleton (S2 region full) | S2 region + guided traversal beyond hop 2 + stubs |
| **S3** | whole canvas, annotated | skeleton (wider region) + summary | seeds + guided traversal + stubs + summary |

Strategies are specified in file 06.

## 5.5 Pseudocode

```ts
async function route(run: AgentRun): Promise<RoutePlan> {
  const scope = run.task_kind === "preset"
    ? PRESET_SCOPE[run.task]
    : await classifyScopeWithJev(run.task, focusNode);   // file 10 §10.2, includes deepen-on-low-confidence

  if (scope === "S1") return { scope, strategy: "neighborhood" };

  const available = CONTEXT_CAP - fixedLayerTokens(run) - OUTPUT_RESERVE;
  const category = budgetCategory(canvas.token_count_total, available, previousCategory(canvas));

  if (category === "small") return { scope, category, strategy: "whole_canvas" };
  if (category === "medium") {
    const region = await buildRegion(run, scope);           // file 06 §6.2
    if (region.tokens + skeletonTokens(canvas) <= available)
      return { scope, category, strategy: "skeleton", region };
  }
  return { scope, category: "large", strategy: "traversal" };
}
```

## 5.6 Escape hatch: `expand_context` tool [DECIDED]

Every agent call (all scopes, all strategies) gets a tool:

```
expand_context(node_ids: string[])  → full text + 1-hop edges (with labels) for those nodes
```

- Limits [PLACEHOLDER]: up to 2 calls per run, up to 5 node ids per call.
- Only ids that appeared in the prompt (full, title, stub, skeleton, or summary) are allowed.
- Log every call in `agent_runs.expand_context_calls`. Frequent calls on a scope or preset are a
  signal that routing is too shallow for it (file 12).
- This is what makes routing mistakes recoverable without always escalating scope.
