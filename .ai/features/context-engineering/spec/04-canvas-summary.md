# 04 — Canvas Summary [DECIDED: one rolling summary per canvas]

A single structured summary per canvas, updated incrementally as the canvas builds up. This is
**not** cluster summaries (those are a non-goal); it is one summary for the whole canvas.

## Why

- Gives canvas-wide tasks (Scope S3, file 05) a compact view of the whole canvas when the canvas
  is too large to send whole.
- Serves as the "canvas intent / map" layer in medium and large canvases (file 08).
- Can also power the product's re-entry synthesis (what a returning user sees). Reuse it there
  if that feature exists rather than generating a second summary.

## Format [PROPOSED]

Structured JSON, with **node ids as anchors** so agents can jump from summary to nodes (and call
`expand_context` on them).

```json
{
  "goal": "Decide a pricing model for the B2B launch",
  "main_threads": [
    { "name": "Pricing", "node_ids": ["n4", "n12"], "gist": "usage-based vs seat-based" },
    { "name": "Onboarding", "node_ids": ["n20"], "gist": "self-serve flow" }
  ],
  "decisions": [{ "text": "Rejected freemium", "node_ids": ["n31"] }],
  "open_questions": [{ "text": "Will heavy users churn?", "node_ids": ["n15"] }],
  "tensions": [{ "text": "n12 assumes monthly billing; n30 says annual", "node_ids": ["n12", "n30"] }]
}
```

Size budget: keep the rendered summary under ~800 tokens [PLACEHOLDER].

## Update mechanism

Inngest function **`update-canvas-summary`**, triggered by `canvas/changed`.

1. **Debounce** per `canvas_id`: run after ~10 changes or ~15 minutes idle, whichever first
   [PLACEHOLDER]. Implement with Inngest debounce/batching keyed by `canvas_id`.
2. **Read** `canvas_events` since `canvases.summary_updated_at` → changed node/edge ids.
   If nothing changed in text or edges → stop.
3. **Gate (Jev, [OPTIONAL])**: one `Score` question — "How much do these changes alter the
   overall meaning of the canvas?" with levels *cosmetic / minor / substantive*. Skip the update
   on *cosmetic*. File 10.
4. **Decide incremental vs full rebuild**:
   - If `summary_incremental_count >= 5` [PLACEHOLDER] or `summary` is null → **full rebuild**.
   - Else → **incremental update**.
5. **Incremental update**: LLM call with (old summary + changed nodes/edges, with their 1-hop
   context titles) → new summary. Cost stays flat as the canvas grows.
6. **Full rebuild**: LLM call over the whole canvas, or (if too large) over the skeleton plus
   full text of high-degree nodes. Prevents incremental errors from compounding.
7. **Validate**: every node id in the summary exists in the canvas. Drop invalid ids.
8. **Write** `canvases.summary`, `summary_updated_at = now()`, and set
   `summary_incremental_count` to 0 (full) or +1 (incremental).

## Rules

- Small canvases (budget category `small`, file 05) don't need the summary for retrieval —
  the whole canvas is sent. Still keep it updated if the product uses it for re-entry; otherwise
  only start summarizing once a canvas crosses the small threshold.
- A stale summary is acceptable for retrieval because it is never the only source: stubs,
  traversal, and `expand_context` cover gaps. Do not block agent runs waiting for a summary.
