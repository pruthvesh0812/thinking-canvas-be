# Context engineering — start here (handoff for a new session)

Read in this order:
1. `CLAUDE.md` (repo rules, non-negotiables).
2. **`story.md` in this folder — the source of truth.** It records every product decision made on 2026-10-21 → 10-25
   and the slice sequence (0 → 10). Where it disagrees with the spec, **the story wins**.
3. `spec/` — the original context-engineering spec (16 files, unmodified copy of the upload). Read it for mechanism
   detail the story cites by file number (e.g. "spec file 09 §9.2"). Do **not** implement anything the story marks
   out of scope: edge types/policies (file 07), type-based priors (06 §6.7), DB writes of agent output + Supabase
   Realtime (09 §9.3–9.4), Jev, presets, `thread_notes`, `canvas_events`, `canvases.token_count_total`, node cap.

## Where the spec was changed (summary — details in story.md)
| Spec says | We decided |
|---|---|
| 5 agents (expander, stress tester, synthesizer, structurer, critic) | 4: Expander, Stress-Tester, General (`@agent`, role `general`), Observer. Articulator + Outer Subconscious are **removed** |
| Preset buttons → scope | No presets. User addresses an agent in a node's text or a context entry; FE sends `agent` + `source {type: context_entry\|node, id}` |
| Typed edge enum + direction policies | Free-text `edges.label` only; `edge_type` column **dropped** (staged) |
| Per-run aliases n1, n2… | User-visible `n{nodes.seq}`; new output nodes `t1, t2…` |
| Agent output written to DB, Realtime | Ghost **structure** (nodes + edges, shape follows content), streamed over Redis/SSE in node-edge chunks; user accepts/rejects |
| Jev for classification | `classify()` on Gemini (General agent only) |
| Max 7 nodes | No cap for now |
| Fixed rejection reasons | Free text or null; null → no constraint |
| canvas_id concurrency limit 1 | Key `canvas_id + agent`: different agents in parallel, same agent never twice |
| Context = node text | **Node unit** = node text + all its visible context entries |
| Tiered pricing per agent | All agents on every tier (paid tiers discussed later) |

## Still open (do not decide alone — ask the product owner)
- Accept/reject granularity (per node / per edge / both) — must be settled before Slice 2 finalizes `ghost-status`.
- Response sizing / chunk threshold. Paid tiers.

## Dev tool
To see the exact prompt an agent would read (and the token cost per layer) while you tweak the layout: `PROMPT-PREVIEW.md` in this folder.

## Branch
Work builds on the pivot branch (PR #18, `feature/pivot-text-context-capture-2026-10-16T1703`, open; `main` is
behind it). Check whether #18 has merged before starting: if yes, branch from `main`; if no, stack on the pivot
branch. Branch names follow `CODING-STANDARDS.md` (`<type>/<short-title>-<timestamp>`).

## Slice 0 — what "done" means
- `src/context/settings.ts`: one module holding every tunable the story keeps (from spec file 13 §13.3, minus the
  removed ones): `SMALL_MAX_TOKENS`, `MEDIUM_MAX_TOKENS`, `CATEGORY_HYSTERESIS`, `HUB_FULLTEXT_NEIGHBORS`,
  `EXPAND_CONTEXT_MAX_CALLS`/`_IDS`, `S2_SEMANTIC_K`/`S3_SEMANTIC_K`, `SIM_FLOOR_S2`/`_S3`, `RECENT_N`,
  `THREAD_MEMORY_TURNS`, `SCOPE_CONFIDENCE_MIN`, and the agent → scope map (D8). Typed constants, no behaviour.
- A `MAPPING` table is already in `story.md`; keep it current.
- Confirm the branch plan above. Then Slice 1.
