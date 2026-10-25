# 08 — Prompt Assembly

Takes the `RetrievalResult` (file 06) and produces the agent prompt. Deterministic code; no
model calls.

## 8.1 Layer order [DECIDED principle, PROPOSED exact order]

Stable content first (better for provider prompt caching), task-specific content after, the task
itself last.

| # | Layer | Present when | Source |
|---|---|---|---|
| 1 | System + agent stance instructions | always | agent config |
| 2 | Tools: output tool + `expand_context` | always | file 09, file 05 §5.6 |
| 3 | Canvas intent (title, goal) | always | `canvases` |
| 4 | Canvas summary | S3 on medium/large; optionally S2 large | file 04 |
| 5 | Thread memory (last ~5 thread notes) | always (if any) | `thread_notes` |
| 6 | Focus node (full) | always | retrieval |
| 7 | Loaded nodes (by tier) + edges | always | retrieval |
| 8 | Skeleton (titles of all other nodes) | `skeleton` strategy | retrieval |
| 9 | Not-loaded stubs | `traversal` strategy | retrieval |
| 10 | Recent activity | S2/S3 | retrieval |
| 11 | Task + agent + scope + shape + constraints | always | run |

Trade-off note: in `whole_canvas` mode the canvas body is identical across runs on the same
canvas, so placing it before the focus (layers 6–7 swapped) can improve cache hits. The default
here favors attention (focus near the top of the dynamic part). Measure before changing.

## 8.2 Short ids [PROPOSED]

UUIDs waste tokens and are easy for a model to garble. Per run, alias every node id appearing in
the prompt to a short id (`n1`, `n2`, …), focus = `n1`. Store the alias map on the run
(in memory during the Inngest function; persist inside `context_snapshot` metadata). Validation
(file 09) maps aliases back to UUIDs and rejects any alias not in the map.

## 8.3 Serialization format [PROPOSED]

Edges always read `src —type→ dst`, matching the stored convention (file 02), with the user's
label inline. The label is often the most valuable context in the prompt (P2).

```text
<canvas_intent>
title: B2B launch pricing
goal: Decide a pricing model for the B2B launch
</canvas_intent>

<thread_memory>
- Earlier stress test: flagged churn risk for heavy users (n7).
- Expander added three onboarding variants under n20.
</thread_memory>

<focus id="n1" type="claim">
Usage-based billing via Stripe metered plans
</focus>

<nodes>
n2 [hop1] (evidence) Survey: 60% of pilot customers prefer paying per seat …
n3 [ancestor] (question) title: How do we monetize?
n4 [hop2] (idea) title: Flat annual license
n5 [similar] (claim) Heavy users generate 70% of API calls …
n6 [hop1] (task) Set up Stripe metered plans for API usage …
</nodes>

<edges>
n1 —elaborates→ n3 ("one candidate answer")
n2 —contradicts→ n1 ("customers want predictable bills")
n4 —alternative_to→ n1
n1 —depends_on→ n6 ("needs Stripe metering")
</edges>

<not_loaded>  (fetch with expand_context if needed)
n9 —questions→ n4 ("does annual pricing work for EU customers?") — EU billing rules
n12 —relates_to→ n5 ("same customer segment") — Enterprise tier
…and 14 more connections not shown
</not_loaded>

<recent_activity>
n7 edited, n8 created, n2 edited
</recent_activity>

<task agent="stress_tester" scope="S2" shape="hierarchy">
Find issues with my thinking for this pricing method.
</task>
```

Rules:
- Tier markers: `full` nodes print their text; `title` nodes print `title:`; stubs only appear in
  `<not_loaded>`; skeleton nodes print `id — title` in a `<skeleton>` block.
- Reason tags in brackets (`[hop1]`, `[ancestor]`, `[similar]`, `[recent]`, `[traversal]`,
  `[focus-region]`) tell the agent *why* a node is present. In `whole_canvas` mode they are the
  annotations that replace separate retrievals (file 06 §6.4).
- Node order inside `<nodes>`: by score descending (file 06 §6.7), focus-region first.
- In `whole_canvas` and `skeleton` mode: policy `follow` paths first, then the rest (file 07).

## 8.4 Standing instructions included in layer 1/11 [PROPOSED]

- Use only node ids that appear in this prompt. New nodes get temp ids `t1`, `t2`, …
- Do not output coordinates or layout.
- If something essential is in `<not_loaded>` or `<skeleton>`, call `expand_context` (max 2
  calls) instead of guessing its content.
- **S1 tasks:** "The neighbors are context. The task is about the focus node only; do not
  rewrite neighbors."
- Respect the requested shape (from the existing Jev shape classifier). If no shape was
  confidently chosen, return a flat group of nodes.
- Keep to at most 7 new nodes [PLACEHOLDER].

## 8.5 Token accounting

- Measure each layer's tokens during assembly; enforce `available` (file 05 §5.3).
- If over budget after assembly (estimate drift), demote lowest-scored `full` nodes to `title`,
  then trim stubs, then trim recent activity. Never trim the focus, the task, or hard-rule nodes.
- Persist `context_tokens` and the exact prompt (`context_snapshot`) on `agent_runs`.
