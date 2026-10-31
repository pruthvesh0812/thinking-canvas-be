# ThinkingCanvas — Context Engineering Spec

Audience: the coding agent working in the backend repo (`thinking-canvas-be`).
Purpose: how agents get the right canvas context — what is stored, what is retrieved, how it is
routed, how it is packed into a prompt, and how agent output is written back.

## Before you write any code

1. **Inspect the existing repo first.** Find the current tables, Inngest functions, agent code,
   and Jev usage (Jev already picks the response *shape*). This spec describes the target design;
   reconcile it with what exists. Do not create duplicate tables or functions.
2. Treat names in this spec (tables, columns, functions, events) as **proposed names**. Keep
   existing names where an equivalent already exists, and note the mapping.
3. Numbers marked as placeholders (thresholds, budgets, k values) are starting points, not
   requirements. Put them in one config module so they can be tuned.

## Reading order

Read in order. Each file assumes the previous ones.

| # | File | What it covers |
|---|------|----------------|
| 01 | [01-overview-and-principles.md](01-overview-and-principles.md) | Problem, goals, design principles, explicit non-goals |
| 02 | [02-data-model.md](02-data-model.md) | Tables, columns, edge type enum, direction convention, indexes |
| 03 | [03-write-path.md](03-write-path.md) | Node/edge writes → embeddings, token counts, events |
| 04 | [04-canvas-summary.md](04-canvas-summary.md) | Rolling canvas-level summary |
| 05 | [05-routing.md](05-routing.md) | Scope classification × budget category → retrieval strategy |
| 06 | [06-retrieval-strategies.md](06-retrieval-strategies.md) | Whole canvas, skeleton mode, guided traversal, scoring, stubs |
| 07 | [07-agent-edge-policies.md](07-agent-edge-policies.md) | Per-agent follow / mention / skip rules over edge types |
| 08 | [08-prompt-assembly.md](08-prompt-assembly.md) | Prompt layers, serialization format, ordering |
| 09 | [09-agent-output-and-write-back.md](09-agent-output-and-write-back.md) | Output schema, validation, write transaction, layout, realtime |
| 10 | [10-jev-integration.md](10-jev-integration.md) | Every place Jev is used, question patterns, confidence rules |
| 11 | [11-caching-and-learning.md](11-caching-and-learning.md) | Cache layers, invalidation, learning policies from logs |
| 12 | [12-evaluation.md](12-evaluation.md) | Eval set, metrics, experiments to run |
| 13 | [13-build-order-and-open-questions.md](13-build-order-and-open-questions.md) | Phased build plan, open decisions |
| A | [appendix-a-end-to-end-walkthrough.md](appendix-a-end-to-end-walkthrough.md) | Every call, read, and write from user action to canvas update |
| B | [appendix-b-decision-log.md](appendix-b-decision-log.md) | What was decided, what was rejected, and why |

## Status tags used throughout

- **[DECIDED]** — agreed design. Implement as written (adapt names to the repo).
- **[PROPOSED]** — recommended default. Implement unless the repo or product owner says otherwise.
- **[OPTIONAL]** — useful add-on. Build only when the phase in file 13 says so.
- **[DEFERRED]** — explicitly not now. Do not build.
- **[PLACEHOLDER]** — a number to tune; keep it in config.

## Stack (as known)

- **Supabase**: Postgres (+ `pgvector`), Realtime, DB webhooks. Frontend writes simple mutations
  (create/edit/move nodes, add/delete edges) directly via `supabase-js`.
- **Inngest**: orchestration for all async work (embedding, summary, agent runs).
- **Backend** (`thinking-canvas-be`): logic-heavy work, agent runs, validation.
- **Jev** (TypeSafe System One model, `jev-1.12` at time of writing): fast typed decisions
  (Choice / Score / Noul). Docs: https://docs.typesafe.ai/llms.txt
- **Embedding model**: not yet chosen (see file 13).
- **Agent LLM**: not specified here; any model with tool use / structured output.

## Glossary

| Term | Meaning |
|------|---------|
| Focus node | The node the user invoked the agent on. |
| Task | The user's request (preset action or free text). |
| Scope | How much of the canvas the task inherently needs (S1 / S2 / S3). File 05. |
| Budget category | Small / Medium / Large, from canvas token size vs available budget. File 05. |
| Hop | One edge away. 1-hop = direct neighbors of a node. |
| Frontier | Edges leading out of nodes already collected, not yet decided on. |
| Seed | A starting node for traversal: the focus node, or a semantic match. |
| Stub | One-line reference to a node that was *not* loaded (id + edge + label + title). |
| Skeleton | Titles + edges of the whole canvas, without node bodies. |
| Detail tier | How much of a node is included: `full`, `title`, or `stub`. |
| Agent policy | Per-agent rules for which edge types to follow / mention / skip. File 07. |
| Thread note | One-line record of what an agent contributed, for future runs. |
