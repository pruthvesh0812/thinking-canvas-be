# Appendix A — End-to-End Walkthrough

Every call, read, and write from user action to canvas update.
Legend: **CALL** = external API / function · **READ** = DB read · **WRITE** = DB write.

---

## A. User creates or edits a node

1. **Frontend** — WRITE `nodes` (text, x, y) via supabase-js.
2. **Postgres trigger** — WRITE `canvas_events` (only if text changed / new row).
3. **DB webhook** — CALL Inngest `node/updated {node_id, canvas_id}`.
4. **`embed-node`** — debounce ~3 s per node_id.
5. READ `nodes` (text, content_hash, token_count). Hash unchanged → stop.
6. CALL embedding API (node text).
7. WRITE `nodes` (embedding, content_hash, token_count, title).
8. WRITE `canvases.token_count_total += delta` (atomic).
9. CALL Inngest `canvas/changed`.
10. **`update-canvas-summary`** (debounced per canvas) — READ `canvas_events` since last summary →
    [optional CALL Jev gate] → CALL LLM (incremental or full) → WRITE `canvases.summary`.

**User draws an edge:** WRITE `edges` (type, label, origin user, status accepted) → trigger
WRITE `canvas_events` → `canvas/changed`. No embedding.

---

## B. Agent run — example 1: preset "More examples" (S1), any canvas size

1. **Frontend** — CALL `POST /agent/run {canvas_id, focus_node_id, agent: expander, task: more_examples}`;
   subscribe to Realtime for this canvas.
2. **Backend** — WRITE `agent_runs` (queued); CALL Inngest `agent/triggered {run_id}`; return run_id.
3. **`run-agent` · load** — READ `agent_runs`, focus node, `canvases` (title, goal).
4. **route** — preset map → **S1**. No Jev call, no budget check needed.
5. **retrieve (neighborhood)**
   - READ edges touching `{focus}` → 1-hop ids → READ those nodes (full).
   - READ ancestor chain via outgoing `elaborates` (titles).
   - Expander policy orders neighbors: incoming `elaborates` (children) and incoming
     `example_of` (existing examples) first.
6. **assemble** — READ `thread_notes` (last 5). Build prompt, short ids. WRITE
   `agent_runs.context_snapshot`, `loaded_nodes`, `context_tokens`.
7. **llm** — CALL agent LLM with output tool + `expand_context`.
8. **validate** — code checks (file 09 §9.2). Fail → one retry.
9. **write** — one transaction: WRITE `nodes` (agent), `edges` (new↔new accepted, new↔existing
   suggested), `thread_notes`, `agent_runs` (done).
10. Continue at **D**.

---

## C. Agent run — example 2: free text "Find issues with my thinking for this pricing method", stress tester, large canvas

1–3. As in B (agent: stress_tester, task_kind: free_text).
4. **route**
   - CALL Jev `Choice` scope → **S2**, confidence 0.82 (≥ 0.7, keep S2).
   - READ `canvases.token_count_total` (e.g. 120k) → `available` ≈ 30k → **large** →
     strategy **traversal**.
   - WRITE `agent_runs` (scope, scope_confidence, budget_category, strategy).
5. **retrieve — region**
   - CALL embedding API (focus text + task) → query vector.
   - In parallel:
     - READ edges touching `{focus}` → 1-hop nodes (full).
     - READ edges touching 1-hop set → hop-2 nodes (titles + labels).
     - READ pgvector top-5 in canvas, excluding collected ids, floor 0.75 → semantic nodes.
     - READ `canvas_events` last 10 user-edited → recent (titles).
     - READ ancestor chain (titles).
   - Hard rules: `contradicts` edges touching focus/1-hop → targets full.
6. **retrieve — guided traversal**
   - Frontier = accepted edges leaving the collected set, not yet decided.
   - Policy split: `follow` (contradicts both, depends_on out, supports in) → Jev;
     `mention` (relates_to, elaborates, questions) → titles; others → stubs.
   - Hop 3: CALL Jev (one `Score` per follow-edge, in one request). Level 2 → full + expand;
     level 1 → title; level 0 (confident) → stub.
   - Hop 4: repeat for level-2 targets while full-text budget remains; stop at depth 4, budget,
     or no level-2 results.
   - Remaining frontier → stubs.
7. **score & pack** — `score = max(structural_prior, cosine × 0.7^hop)` (+ Jev level); hard-rule
   nodes first; fill `full` → `title` → `stub` within `available`.
8. **assemble** — layers per file 08 (intent, thread memory, focus, nodes, edges with labels,
   not-loaded stubs, recent activity, task). WRITE `agent_runs` (snapshot, loaded_nodes, tokens).
9. **llm-1** — CALL agent LLM. Agent calls `expand_context(["n9"])` (a node it only saw as a stub).
10. **expand-1** — READ n9 full + its 1-hop edges; WRITE `agent_runs.expand_context_calls`;
    **llm-2** — CALL agent LLM with the result → output tool call.
11. **validate** → **check** [optional: CALL Jev dedupe] → **write** (as B.9).
12. Continue at **D**.

---

## D. After the write

1. **Realtime** → frontend receives new nodes/edges.
2. **Frontend** runs dagre/ELK (shape + edges, anchored at focus) → WRITE `nodes` (x, y).
3. New node inserts → write path **A** (embedded, counted, events, summary trigger).
   x/y updates → webhook → stops at hash check (no cost, no event).
4. User accepts/rejects suggested edges → WRITE `edges.status`; WRITE `agent_runs.outcome`.
5. User keeps/edits/deletes agent nodes → WRITE `agent_runs.outcome`.

---

## E. Failure paths

| Failure | Behavior |
|---|---|
| Jev error/timeout | Recall-safe fallback per use (file 10 §10.10); run continues |
| Embedding API error in `embed-node` | Inngest retries; node simply lacks an embedding meanwhile (excluded from semantic search, still reachable by edges) |
| Embedding API error at query time | Skip semantic seeds; continue with structure only; log |
| LLM output invalid twice | `agent_runs.status = failed`; nothing written; frontend shows error |
| Write transaction fails | Inngest retries the `write` step only (LLM call memoized) |
