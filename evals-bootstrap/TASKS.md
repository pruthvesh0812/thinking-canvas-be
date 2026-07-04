# TASKS — thinking-canvas-evals

Ordered, independently shippable. Each task states where it lives, what to
build, and a concrete "done when". Don't start task N+1 until N's "done when"
holds — later tasks assume it.

---

## Task 0 — Experiment-record provenance (lives in **thinking-canvas-be**)

**Why first:** every ghost row must carry its full provenance so future
snapshots are self-describing. Do this before anything else so production data
is usable from day one.

**Build:**
- Migration: add to `ai_contributions`:
  `trigger_node_id UUID REFERENCES nodes`, `attunement_state_id UUID REFERENCES attunement_state`,
  `prompt_name TEXT`, `prompt_version TEXT`, `routing_reason TEXT`,
  `resolved_at TIMESTAMPTZ` (set when status leaves `pending`).
- Update the spawn path (`src/streaming/spawn.ts` + pipelines) to write these.
  `prompt_version` comes from the Langfuse prompt object already fetched in
  `getPrompt()` — return `{ prompt, version }` from a new `getPromptWithVersion()`
  and thread it through.
- Update `types/index.ts` → `AiContribution`.

**Done when:** a new ghost in local dev produces an `ai_contributions` row with
all provenance columns populated, and `npm run test` passes in the backend repo.

---

## Task 1 — Repo bootstrap

**Build:** run `init.sh` (this kit), fill `.env`, `npm install` in root and
`vendor/thinking-canvas-be`, verify `npm run db:start` brings up the local
stack with vendor migrations applied.

**Done when:** `npm run cli -- --help` lists all planned subcommands (stubs),
`npm run typecheck` passes, and `import { serialize } from '@tc/serializer/index.js'`
compiles in a scratch file.

---

## Task 2 — Dataset schema + types (`src/lib/`)

**Build:**
- Zod schemas + TS types: `TrailSnapshot` (rows of all 10 tables, keyed by
  table name), `ReplayPoint`, `CandidateConfig`, `EvalRecord`, `RunManifest`
  (dataset name + hash, candidate, metric versions, timestamps).
- Dataset IO helpers: read/write `datasets/<name>/snapshot.json`,
  `points.jsonl`, `labels.jsonl`; content-hash a snapshot for the manifest.
- A tiny hand-written fixture snapshot (`golden/fixture/`) used by tests from
  here on — 1 canvas, 2 sessions, ~10 nodes, 3 ghosts (1 accepted, 1 rejected
  with insight, 1 ignored).

**Done when:** fixture round-trips through the schemas in a vitest test.

---

## Task 3 — Extractor (`src/extract/`, CLI: `extract`)

**Build:** `extract --canvas <id> --out datasets/<name>`. Connects with
`PROD_SUPABASE_*` env (separate client — never the vendor's `db`). Pulls all
rows for the canvas across the 10 tables, orders deterministically, writes
`snapshot.json` + manifest. Refuse to overwrite an existing dataset
(frozen = frozen).

**Done when:** extracting a real canvas produces a snapshot that validates
against the Task 2 schema; re-running errors with "dataset exists".

---

## Task 4 — Replay-point builder (`src/replay/points.ts`, CLI: `points`)

**Build:** walk a snapshot's `ai_contributions` (join `agent_threads.messages`)
and emit one `ReplayPoint` per ghost:
- `as_of` = the contribution's `created_at`.
- `trigger_node_id`, `agent_role`, `attunement_state_id` from provenance
  (Task 0); for pre-Task-0 rows, recover the trigger from the thread's last
  `canvas_event` turn before the response turn, else skip with a logged reason.
- `thread_truncation_index` = index of the agent's response turn for this ghost
  in `messages` (the triggering user turn is *included*, the response excluded).
- `recorded_output` (the ghost pair content from the thread turn),
  `recorded_status`, `resolved_at`.
- Skip Observer contributions in v1 (structured output needs its own scoring —
  see Task 12 note).

**Done when:** `points --dataset golden/fixture` emits exactly the expected
3 points, verified in a test.

---

## Task 5 — Time-travel seeding + context reconstruction (`src/replay/seed.ts`, `src/replay/context.ts`)

The heart of the harness.

**Build:**
- `seedAsOf(snapshot, point)`: `db reset` (or targeted truncate) the local
  stack, insert rows with `created_at <= as_of` across all tables; truncate the
  agent thread's `messages` at `thread_truncation_index`; exclude the replayed
  contribution row itself and any rejection insight it produced.
  Known v1 approximation (document in code): `rejection_insights.turns_remaining`
  / `active` reflect final state, not as-of state — include insights created
  before `as_of` as `active` and note it in the EvalRecord.
- `reconstructContext(point)`: with env pointed at local, call the **vendor**
  `serialize(thread, agentRole, canvas)` and return the string.

**Done when:**
1. Fixture test: reconstructed context contains the trigger node as `★ACTIVE`,
   contains no node created after `as_of`, and never contains the recorded
   ghost's content.
2. Fidelity check on real data: for ≥3 recent production points, the
   reconstructed context matches the context recorded in the corresponding
   Langfuse trace (allowing a documented whitelist of differences, e.g.
   the turns_remaining approximation).

---

## Task 6 — Candidate runner (`src/run/`, CLI: `run`)

**Build:**
- `CandidateConfig` loading from `candidates/*.json`:
  `{ label, agentRole, prompt: { name, version } | { file }, modelId?, providerOptions? }`.
  Prompt-by-version fetched via `@langfuse/client`; prompt-by-file for local
  experiments that aren't in Langfuse yet.
- For each ReplayPoint of the matching role: seed → reconstruct → call the
  model (same `ai` SDK call shape as the backend agent, using `@tc/lib/llm.js`
  `models`) → parse the ghost pair → write an `EvalRecord` to
  `runs/<timestamp>-<label>/records.jsonl` + `RunManifest`.
- Concurrency 1 in v1 (the local DB is shared state); `--limit N` and
  `--role <agentRole>` flags; resumable (skip already-recorded points).

**Done when:** `run --dataset golden/fixture --candidate candidates/baseline.json`
produces records for all fixture points, with cost/latency captured.

---

## Task 7 — Deterministic metrics (`src/score/metrics.ts`)

**Build (each metric versioned, pure function `(point, record) → score`):**
- `format_validity` — output parses as a context+question ghost pair; Articulator
  candidates offer 2–3 completions.
- `constraint_compliance` — no active NEGATIVE CONSTRAINT violated (string +
  embedding-similarity check of the constraint text against candidate output).
- `jump_distance` — cosine distance between trigger-node embedding and
  candidate-ghost embedding (via `@tc/lib/llm.js` `generateEmbedding`);
  reported raw, plus in/out of the accepted band (band computed from the
  dataset's accepted ghosts).
- `agreement` — when `recorded_status` is an accepted variant: cosine similarity
  of candidate output to the recorded accepted output (a known-good anchor —
  informative, never a gate on its own).

**Done when:** metrics run over a Task 6 run and land in each `EvalRecord`;
unit tests cover each metric on fixture data.

---

## Task 8 — Generativity labeler (`src/score/generativity.ts`, CLI: `label`)

**Build:** `generativity@v1`, computed on **recorded** data only:
for each point, look at the window after `resolved_at` (default: next 5 human
nodes in `sessions.node_sequence`, or 30 min, whichever first) and score
- edges drawn to/from the accepted ghost nodes,
- human nodes whose embedding cosine to the ghost content ≥ threshold
  (rejected ghosts can score here — the "spark effect"),
normalized to 0–1. Write `labels.jsonl`; keep weights/threshold in one
versioned constants object.

**Done when:** every fixture point gets a label; on a real dataset the label
distribution is reported (not degenerate all-0/all-1); weights documented.

---

## Task 9 — LLM judge + calibration (`src/judge/`)

**Build:**
- `judge@v1`: prompt rubric derived from the Foundation Principles
  (`vendor/.ai/context/references/ThinkingCanvas_FoundationPrinciples.md`):
  1–2 cognitive jumps from the trigger node? ground-before-nudge? demands a
  cognitive response (vs. handing over a conclusion)? respects active
  constraints? Score 1–5 + one-sentence rationale, structured output, run on
  `models.fast()` with `thinking('low')`.
- Few-shot anchors: 2 high-generativity and 2 low-generativity real examples
  (anonymized) pinned into the rubric.
- **Calibration command** (`judge-calibrate`): run the judge over recorded
  outputs of a labeled dataset and report Spearman correlation with
  `generativity@v1` + per-band means. Store the result in
  `judge/calibration/<judge-version>.json`.

**Done when:** calibration report exists for `judge@v1`; the correlation is
positive and documented (if it isn't, iterate the rubric — that IS the task).

---

## Task 10 — Compare + report (`src/compare/`, `src/report/`, CLI: `compare`)

**Build:**
- Paired comparison over the intersection of replay points in two runs:
  per-metric deltas, judge win/tie/loss rate, bootstrap 95% CI on win rate
  (10k resamples), violation counts, cost/latency deltas.
- Markdown report to `reports/<timestamp>-<a>-vs-<b>.md`: verdict table,
  CI, the 5 largest wins and losses with full context/output excerpts for
  human reading, and the manifest (dataset hash, prompt versions, serializer
  commits, metric/judge versions).

**Done when:** `compare` on two fixture runs produces a report; a seeded-RNG
test makes the bootstrap deterministic.

---

## Task 11 — Langfuse experiments (`src/report/langfuse.ts`)

**Build:** push each run as a Langfuse dataset run (dataset = replay points,
items = EvalRecords with scores) so results sit next to production traces and
prompt versions; link the compare report in run metadata.

**Done when:** a run is visible in Langfuse with per-item scores, and two runs
are comparable in its UI.

---

## Task 12 — Golden set + CI gate

**Build:**
- `golden/` curation: `golden add --dataset <d> --point <id>` copies a point
  (with minimal as-of row subset) after **anonymization** (strip user ids,
  emails; content review checklist in the command output). Target ≈50 points
  across roles/phases/users. Golden points are never used while iterating on a
  candidate — gate only.
- GitHub Action in **thinking-canvas-be**: on PRs touching
  `src/agents/`, `src/serializer/`, `scripts/seed-prompts.ts`, check out this
  repo with the submodule pinned to the PR's SHA, run baseline-vs-PR compare on
  the golden set, fail on: any new constraint violation, judge win rate CI
  entirely below 45%, or `format_validity` regression.

**Done when:** a deliberate prompt sabotage (e.g. "always answer the user's
question directly") on a branch fails the gate; a no-op change passes.

---

## Later (out of v1 scope, tracked here so they aren't lost)

- Observer scoring (structured DAG output needs graph-aware metrics +
  per-edge feedback replay).
- Attunement/Orchestrator evals — pure-data (no generation): score recorded
  `attunement_state` predictions and routing decisions against realized
  outcomes across snapshots.
- As-of reconstruction of `rejection_insights.turns_remaining` (needs an
  audit trail or event-sourced decrements in the backend).
- Anonymization pipeline for sharing datasets beyond golden.
- Parallel replay via per-worker schemas instead of `db reset`.
