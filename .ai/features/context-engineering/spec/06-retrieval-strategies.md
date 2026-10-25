# 06 — Retrieval Strategies

Four strategies, chosen by routing (file 05):

| Strategy | Used for |
|---|---|
| `neighborhood` | S1, any size |
| `whole_canvas` | S2/S3 on small canvases |
| `skeleton` | S2/S3 on medium canvases |
| `traversal` | S2/S3 on large canvases |

All strategies output the same structure, consumed by prompt assembly (file 08):

```ts
type LoadedNode = {
  id: string;
  tier: "full" | "title" | "stub";
  reasons: Array<"focus" | "hop1" | "hop2" | "ancestor" | "semantic" | "recent" | "traversal" | "hard_rule">;
  hop: number | null;          // distance from focus, if reached via edges
  score: number;               // see 6.6
};
type LoadedEdge = { id; src; dst; type; label; status };
type RetrievalResult = { nodes: LoadedNode[]; edges: LoadedEdge[]; stubs: Stub[]; tokens: number };
```

Only edges with `status = 'accepted'` are traversed [PROPOSED]. Suggested/rejected edges are
ignored for retrieval (they are the AI's guesses, not the user's structure).

---

## 6.1 Shared queries

**Edges touching a node set** (the only traversal primitive; hop-by-hop expansion is done in
application code so Jev can intervene between hops):

```sql
select e.id, e.src, e.dst, e.type, e.label
from edges e
where e.canvas_id = $1
  and e.status = 'accepted'
  and (e.src = any($2::uuid[]) or e.dst = any($2::uuid[]));
```

**Semantic matches** (exact scan scoped to the canvas, see file 02 index notes):

```sql
select n.id, n.title, 1 - (n.embedding <=> $2) as similarity
from nodes n
where n.canvas_id = $1
  and n.embedding is not null
  and not (n.id = any($3::uuid[]))          -- exclude ids already collected
order by n.embedding <=> $2
limit $4;
-- then keep only rows with similarity >= SIM_FLOOR (applied in code)
```

**Recent user activity:**

```sql
select node_id, max(at) as last_at
from canvas_events
where canvas_id = $1 and node_id is not null and actor = 'user'
group by node_id
order by last_at desc
limit $2;
```

**Query embedding** [DECIDED]: embed `focus.text + "\n\n" + task` with the same embedding model
used for nodes. For S1 no query embedding is needed.

---

## 6.2 `neighborhood` (S1)

1. Read focus node (full).
2. Edges touching `{focus}` → 1-hop neighbor ids → read nodes (full text).
3. *[PROPOSED]* Ancestor chain: repeatedly follow outgoing `elaborates` from the focus until no
   parent or depth 6 → titles only.
4. Hub guard (file 05 §5.1): if > ~25 neighbors, order by agent policy (file 07) then recency;
   full text for the first N, titles for the rest.

## 6.3 Building the S2 region (input to skeleton and traversal)

1. Focus (full) + 1-hop (full) via edges touching `{focus}`.
2. Hop-2: edges touching the 1-hop set → hop-2 nodes (**titles + edge labels**, not full text).
   Hop 2 can explode; titles are enough to decide whether something matters.
3. Semantic: top **3–5**, strict floor (e.g. 0.75 cosine [PLACEHOLDER]), excluding ids from
   steps 1–2. Branch-scope tasks are about one area; a loose semantic set drags in other
   branches' noise. Include as **full** if score is high, else title.
4. Recent: last ~10 user-edited nodes [PLACEHOLDER], **titles only**, excluding ids already
   collected.
5. Ancestor chain titles (as in 6.2).

For S3 the region is wider [PROPOSED]: semantic top ~8 with a slightly lower floor, plus each
semantic seed's 1-hop as titles.

## 6.4 `whole_canvas` (small canvases)

Send every node (full text) and every accepted edge (type + label).

- **Annotate instead of retrieving.** Run no separate semantic/recent retrievals. Instead tag
  nodes inside the serialization: `[focus]`, `[hop1]`, `[recent]`, `[similar]`. The `[similar]`
  tag needs a query embedding + one vector query; skip it for S2 if latency matters, keep for S3.
- **Order, don't filter.** Put the focus neighborhood first, then nodes reached via the agent
  policy's `follow` edge types, then everything else (file 08 §8.3). Models attend better to the
  start of context than the middle.

## 6.5 `skeleton` (medium canvases)

- The region from 6.3 (S2) or the wider region (S3) is included at its tiers (full/title).
- **Every other node** is included as a skeleton line: id + title.
- **Every accepted edge** is included (type + label), so the agent sees the shape of the whole
  canvas.
- S3 also includes the canvas summary (file 04).
- The agent can pull any skeleton node's full text with `expand_context`.

## 6.6 `traversal` (large canvases) — Jev-guided

Goal: explore widely (cheap) but include full text selectively (expensive), and never let a
needed node become invisible.

### Seeds
- S2: the S2 region (6.3). Hops 1–2 from the focus are **unconditional**.
- S3: the S3 region (6.3) + canvas summary. Semantic seeds get 1 hop unconditionally (to
  disambiguate them), the focus gets 2.

### Hard rules (never overridden by Jev) [DECIDED]
- Ancestor chain of the focus (titles at minimum).
- Any `contradicts` edge touching the focus or a 1-hop neighbor → target included (full).
- The agent policy's `follow` edges at hop 1 (file 07).

### The loop

```ts
let frontier = edgesLeavingCollectedSetNotYetDecided();     // from the seeds
let depth = 2;                                               // hops 1–2 already done
while (frontier.length && depth < MAX_DEPTH /* 4 [PLACEHOLDER] */) {
  const fullBudgetLeft = available - tokensOf(collectedFullText);
  if (fullBudgetLeft <= 0) break;                            // budget reached → stop expanding

  // One Jev call per hop, one Score question per frontier edge, all in parallel (file 10 §10.3)
  const decisions = await jevScoreFrontier(task, agentPolicy, focus, frontier);

  const next = [];
  for (const d of decisions) {
    const level = effectiveLevel(d);                          // recall bias, below
    if (level === 2) { include(d.target, "full"); next.push(d.target); }
    else if (level === 1) { include(d.target, "title"); }     // mention, don't expand
    else { addStub(d.edge, d.target); }                       // skipped, but stays visible
  }
  if (next.length === 0) break;                               // nothing relevant at this hop
  frontier = edgesLeaving(next).filter(notDecided);
  depth++;
}
// Remaining undecided frontier edges → stubs
```

Policy filtering of the frontier (file 07):
- `follow` edge types → sent to Jev (may expand).
- `mention` edge types → included as `title` directly, not sent to Jev, not expanded.
- `skip` edge types → stubs.

### Recall bias: `effectiveLevel` [DECIDED principle, PLACEHOLDER numbers]
- Jev returns a score on 0–2 plus `confidence`.
- Treat as **0 (skip)** only if score < 0.5 **and** confidence ≥ 0.7.
- Treat as **2 (follow)** if score ≥ 1.5.
- Everything else, including any low-confidence answer → **1 (mention)**.
Missing a node is worse than including an extra title.

### Budgets: explore vs include
- **Exploration** costs one title per edge inside a Jev call — nearly free. Explore broadly.
- **Inclusion** of full text costs prompt tokens. When the full-text budget fills, **degrade**:
  new level-2 nodes become `title`, and lower-scored existing `full` nodes are demoted to `title`
  (see 6.7). Then `title` → `stub`. Drop entirely only as a last resort.

### Stubs — the main safety net [DECIDED]
Every skipped or undecided edge becomes a one-line stub in the prompt:
```
n40 ←depends_on ("needs legal sign-off") — Contract review
```
Together with `expand_context`, nothing reachable from the collected set is ever invisible.
Cap stubs at ~40 lines [PLACEHOLDER]; beyond that, keep the highest-scored and add
"…and K more connections not shown".

### Hub fan-out
A node with many edges just means many questions in one Jev call (they run in parallel). Batch
only if one hop exceeds ~100 edges [PLACEHOLDER]; mind the rate limit (file 10).

## 6.7 Scoring and packing [DECIDED fix — see decision log]

Scoring purely by similarity to the query would prune exactly the nodes structure was meant to
find (a grandparent framing question or a counterpoint is usually *dissimilar* to the query).
So score by structural role **or** similarity, whichever is higher:

```
score(node) = max(
  structural_prior(edge_type, direction, agent_policy),
  cosine(query, node) × 0.7^hop          // 0.7 per hop [PLACEHOLDER]
)
```

`structural_prior` [PROPOSED defaults; agent policy can override, file 07]:

| Relation to focus | Prior |
|---|---|
| focus | 1.0 |
| ancestor chain | 1.0 |
| `contradicts` touching focus or 1-hop | 0.9 |
| policy `follow` edge at hop 1 | 0.8 |
| sibling (shares a parent via `elaborates`) | 0.6 |
| policy `follow` edge at hop 2+ | 0.5 |
| `relates_to` / policy `mention` | 0.0 (similarity decides) |

Jev's traversal level, when present, also feeds the score (level 2 → ≥ 0.7, level 1 → ≥ 0.4).

**Packing**: sort by score; assign `full` until the full-text budget is used, then `title`, then
`stub`. Hard-rule nodes are packed first regardless of score. Record each node's final tier and
reasons in `agent_runs.loaded_nodes`.

## 6.8 Why select broadly then prune

Hop expansion and Jev exploration are for **recall**; scoring/packing is for **precision**.
Traversal cannot know a node's value before seeing it, and a hub can produce hundreds of
candidates. Typed traversal (file 07) shrinks the candidate set up front so less is collected
only to be pruned, and degrade-before-drop means "pruned" usually means "shown as a title",
not "removed".
