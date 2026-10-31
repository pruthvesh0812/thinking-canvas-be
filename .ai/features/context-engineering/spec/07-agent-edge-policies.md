# 07 — Agent Edge Policies

Each agent sees the canvas differently. The lever is **edge type + direction**. Policies decide
which paths to prioritize; scope (file 05) still decides how deep.

## 7.1 Prioritize, don't filter [DECIDED]

For each agent, every (edge type, direction) falls into one of three buckets:

| Bucket | Effect in traversal | Effect in whole-canvas / skeleton |
|---|---|---|
| `follow` | Sent to Jev; may be included full and expanded further | Ordered first |
| `mention` | Included as title (or stub), not expanded, not sent to Jev | Ordered after `follow` |
| `skip` | Stub only | Ordered last (still present) |

Strict filtering is rejected because:
- A stress tester that only follows `contradicts`/`depends_on` would never see the `supports`
  edges — and the evidence an idea rests on is exactly what it should attack.
- Users mislabel edges. A real dependency drawn as `relates_to` would vanish under a filter; as
  a mention/stub the agent still sees it and can `expand_context`.

Use `skip` rarely. Default `skip: []`.

## 7.2 Default policies [PROPOSED]

Direction is relative to the node being expanded, using the convention `src <type> dst`
(file 02). **in** = the expanded node is `dst`; **out** = it is `src`.

| Agent | follow | mention | Knobs |
|---|---|---|---|
| **Expander** | `elaborates` in (children), `example_of` in (existing examples) | `elaborates` out (parent), `alternative_to`, `relates_to` | Needs existing children/examples to avoid repeating them. Shallow. |
| **Stress tester** | `contradicts` both, `depends_on` out (assumptions it relies on), `supports` in (evidence it rests on) | `relates_to`, `elaborates`, `questions` | Deeper on `depends_on` chains. |
| **Synthesizer** | `supports` both, `relates_to` both, `elaborates` both | everything else | Shallow and wide: more semantic seeds, max depth 3. |
| **Structurer** | `elaborates` both, `alternative_to`, `example_of` both | `supports`, `contradicts`, `depends_on` | Mostly titles; structure matters more than body text. |
| **Critic / provoker** | `contradicts` both, `questions` both | `supports` | Adds *far* semantic seeds (outside the focus branch) to provoke cross-branch connections. |

Reconcile these agent names with the repo's existing agents (synthesizer, critic/provoker,
structurer exist as cognitive stances in the product; expander and stress tester were added in
this design). If an existing agent maps onto one of these, reuse its policy row.

## 7.3 Config, not code [DECIDED]

```ts
type Dir = "in" | "out" | "both";
type EdgeRule = { type: EdgeType; dir: Dir };

type AgentPolicy = {
  follow: EdgeRule[];
  mention: EdgeRule[];
  skip: EdgeRule[];
  maxDepth?: number;          // overrides traversal MAX_DEPTH
  semanticK?: number;         // overrides region semantic k
  farSemanticSeeds?: boolean; // critic: seeds outside the focus branch
  priorOverrides?: Partial<Record<EdgeType, number>>; // structural_prior overrides (file 06 §6.7)
};

export const EDGE_POLICY: Record<AgentName, AgentPolicy> = {
  stress_tester: {
    follow: [
      { type: "contradicts", dir: "both" },
      { type: "depends_on",  dir: "out" },
      { type: "supports",    dir: "in" },
    ],
    mention: [
      { type: "relates_to", dir: "both" },
      { type: "elaborates", dir: "both" },
      { type: "questions",  dir: "both" },
    ],
    skip: [],
  },
  expander: {
    follow: [
      { type: "elaborates", dir: "in" },
      { type: "example_of", dir: "in" },
    ],
    mention: [
      { type: "elaborates",     dir: "out" },
      { type: "alternative_to", dir: "both" },
      { type: "relates_to",     dir: "both" },
    ],
    skip: [],
    maxDepth: 2,
  },
  // synthesizer, structurer, critic …
};
```

Rule matching for an edge `e` seen from node `x`:
- `dir: "out"` matches when `e.src === x`; `"in"` when `e.dst === x`; `"both"` always.
- Symmetric types (`contradicts`, `alternative_to`, `relates_to`) always match as `both`.
- An edge not matched by any rule → `mention` (default), never silently dropped.

Add a unit test asserting every `type` in `EDGE_POLICY` is in the edge type enum.

## 7.4 Where the policy is used

One table drives everything downstream:

| Place | Use |
|---|---|
| Traversal (file 06 §6.6) | Which frontier edges go to Jev / become titles / become stubs |
| Scoring (file 06 §6.7) | `structural_prior` per edge type, plus overrides |
| Jev state (file 10 §10.3) | Tells Jev which relations this agent cares about for borderline edges |
| Whole canvas & skeleton (file 06 §6.4–6.5) | Ordering: `follow` paths first |
| S1 hub guard (file 06 §6.2) | Which neighbors get full text when there are too many |

## 7.5 Combining with scope

A stress test classified as S2 on a large canvas: hops 1–2 unconditional from the focus,
then Jev-guided traversal only along `follow` edges, `mention` edges as titles, everything else
as stubs. Same agent on a small canvas: whole canvas, with `contradicts` / `depends_on` /
`supports` paths ordered first.

## 7.6 Learn the policy from usage [OPTIONAL — file 11]

Log which edge types led to nodes the agent actually referenced in its output
(`agent_runs.referenced_node_ids` joined with `loaded_nodes`). After a few hundred runs per
agent, adjust buckets and priors from evidence (e.g. "stress tester references nodes reached via
`supports` in 40% of runs → keep it in `follow`").
