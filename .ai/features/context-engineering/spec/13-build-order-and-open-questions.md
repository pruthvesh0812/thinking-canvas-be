# 13 — Build Order and Open Questions

## 13.1 Phases [PROPOSED]

Each phase is shippable on its own. Small canvases are fully served after Phase 2.

### Phase 0 — Reconcile with the repo
- Read existing schema, Inngest functions, agent code, Jev shape-classifier usage.
- Write `docs/context-engineering/MAPPING.md`: spec name → existing name, gaps, conflicts.
- Confirm the edge type enum and direction convention with the product owner (13.2 #1–2).

### Phase 1 — Data model + write path (files 02, 03)
- `edges.type` (required enum), `edges.label`, `origin`, `status`.
- `nodes.embedding`, `content_hash`, `token_count`, `title`, `created_by_run`.
- `canvases.token_count_total`; `canvas_events` + Postgres trigger (text/edge changes only).
- `thread_notes`, `agent_runs` with logging columns.
- DB webhook → Inngest `embed-node` (debounce, hash check, embed, counts, `canvas/changed`).
- Backfill job: embed + count all existing nodes.

### Phase 2 — Agent run, minimal routing (files 05, 08, 09)
- `run-agent` Inngest function with steps (file 09 §9.5), concurrency key `canvas_id`.
- Preset → scope map. Free-text tasks default to S2 until Phase 3.
- Strategies: `neighborhood` (S1) and `whole_canvas` (S2/S3). Large canvases temporarily fall
  back to `neighborhood` + ancestor titles + `expand_context`.
- Prompt assembly with short ids, layered order, provider prompt caching (file 11 §11.1).
- Output tool schema, validation, retry-once, write transaction, suggested edges.
- `expand_context` tool.
- Full logging on `agent_runs`.

### Phase 3 — Real routing (files 04, 05, 06, 10)
- Jev scope `Choice` for free text, deepen-on-low-confidence, fallbacks, global Jev concurrency.
- Budget categories with hysteresis; `available` computation.
- S2/S3 region building (semantic + recent), `skeleton` strategy.
- Canvas summary job (incremental + periodic rebuild).
- Low-confidence shape → neutral group.

### Phase 4 — Eval harness (file 12)
- Fixtures + labels for 30–50 cases; harness computing the metrics in 12.2.
- Run experiments 1–2 to set thresholds. **Must exist before Phase 5 ships.**

### Phase 5 — Large canvases (files 06, 07)
- Agent edge policies (config + tests).
- Jev-guided traversal with hard rules, recall-biased levels, stubs, explore-vs-include budgets.
- Structural-prior scoring and tiered packing.
- Run experiments 3–7.

### Phase 6 — Optimization [OPTIONAL]
- Per-edge decision cache, traversal result cache (file 11).
- Policy learning from logs.
- Jev output dedupe, summary gating, verification cascade (file 10).

### Not now [DEFERRED]
- Implicit edges at write time (file 03 §3.4).
- Embedding edge labels for search.
- Cluster summaries, spatial reasoning (non-goals, file 01).

### Future directions (discussed, explicitly out of scope for this build)
- Agent-side graph navigation tools beyond `expand_context` (decision log #25).
- GNN node embeddings; soft-token graph injection into a fine-tuned open model (#28, #29).
- Fine-tuning a canvas-specialized model on logged operations. Prerequisite: thousands of
  canvases with full operation history (#32) and agent run logs.
- Parallel multi-direction exploration as a product feature (#31).

## 13.2 Open questions (need a decision from the product owner)

1. **Final edge type enum.** Proposed 8 types (file 02). Fewer is easier to tune; keep ≤ 8.
2. **Direction convention details.** Proposed: every edge reads `src <type> dst`; hierarchy is
   child `—elaborates→` parent. Confirm the UI picker will phrase choices this way.
3. **Node title field.** Does the product have one, or derive from the first line?
4. **Embedding model** (and its dimension N) — needed for Phase 1.
5. **Agent LLM(s)** per agent, and the **per-call context cap** used to compute `available`.
6. **Agent roster.** Map expander / stress tester / synthesizer / structurer / critic to the
   existing agents.
7. **Preset actions list** and their scope mapping (file 05 §5.2).
8. **Backend language** and whether a non-Python Jev client is needed.
9. **Max new nodes per response** (proposed 7).
10. **Should suggested edges ever be traversed?** Proposed: no, only accepted.
11. **Canvas summary use beyond retrieval** (re-entry synthesis?) — decides whether small
    canvases get summarized too.

## 13.3 Placeholders to put in one config module

| Name | Default | File |
|---|---|---|
| `EMBED_DEBOUNCE_MS` | 3000 | 03 |
| `SUMMARY_DEBOUNCE` | 10 changes / 15 min | 04 |
| `SUMMARY_FULL_REBUILD_EVERY` | 5 | 04 |
| `SUMMARY_MAX_TOKENS` | 800 | 04 |
| `SCOPE_CONFIDENCE_MIN` | 0.7 | 05, 10 |
| `SMALL_MAX_TOKENS` | 15000 | 05 |
| `MEDIUM_MAX_TOKENS` | 50000 | 05 |
| `CATEGORY_HYSTERESIS` | 0.10 | 05 |
| `HUB_FULLTEXT_NEIGHBORS` | 25 | 05, 06 |
| `EXPAND_CONTEXT_MAX_CALLS` / `_IDS` | 2 / 5 | 05 |
| `S2_SEMANTIC_K` / `S3_SEMANTIC_K` | 5 / 8 | 06 |
| `SIM_FLOOR_S2` / `SIM_FLOOR_S3` | 0.75 / 0.65 | 06 |
| `RECENT_N` | 10 | 06 |
| `TRAVERSAL_MAX_DEPTH` | 4 | 06 |
| `HOP_DECAY` | 0.7 | 06 |
| `SKIP_MAX_SCORE` / `SKIP_MIN_CONF` / `FOLLOW_MIN_SCORE` | 0.5 / 0.7 / 1.5 | 06 |
| `STUB_MAX_LINES` | 40 | 06 |
| `JEV_BATCH_MAX_QUESTIONS` | 100 | 06, 10 |
| `JEV_GLOBAL_CONCURRENCY` | 6 | 10 |
| `MAX_NEW_NODES` | 7 | 08, 09 |
