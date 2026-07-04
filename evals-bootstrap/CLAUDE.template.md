# thinking-canvas-evals — Agent Navigation Index

> Offline eval harness for ThinkingCanvas. Replays real thinking trails against
> candidate component versions (agent prompts, serializer, routing) and scores
> them. Read this file first on every task. The backend under test lives at
> `vendor/thinking-canvas-be` (git submodule) — its own `CLAUDE.md` and
> `.ai/context/*.md` are the authority on backend concepts.

---

## What This Repo Does

Every ghost pair ThinkingCanvas produced in production is a labeled experiment:
the serialized context was the input, the ghost was the prediction, and the
user's accept/reject/ignore (plus what they built afterwards) is the label.
This repo:

1. **Extracts** frozen snapshots of real canvases from production (read-only).
2. **Reconstructs** the exact context an agent saw at any historical moment,
   using the backend's *actual* `serialize()` — never a re-implementation.
3. **Runs** candidate configurations (a new prompt version, a serializer commit,
   a different model setting) against those historical moments.
4. **Scores** outputs with deterministic metrics, generativity labels, and a
   calibrated LLM judge.
5. **Compares** candidates pairwise and produces reports with confidence
   intervals, logged to Langfuse as experiments.

The output is evidence: "prompt v14 beats v13 on 212 replay points" — measured
before any user sees the change.

---

## Core Concepts (canonical vocabulary)

| Term | Meaning |
|---|---|
| **TrailSnapshot** | Frozen JSON export of one canvas: `canvases`, `sessions`, `nodes`, `edges`, `agent_threads`, `attunement_state`, `rejection_insights`, `ai_contributions`, `observer_structures`, `observer_edges` rows. Immutable once written. |
| **ReplayPoint** | One historical ghost turned into a test case: `as_of` timestamp, trigger node, `agent_role`, thread-message truncation index, the recorded ghost output, the recorded outcome, and the generativity label. |
| **Time-travel seeding** | Loading a local Supabase stack with snapshot rows filtered to `created_at <= as_of`, with the agent thread truncated to just before the recorded response turn — so `serialize()` rebuilds what the agent actually saw. |
| **CandidateConfig** | A named component variant: `{ label, promptName, promptVersion \| promptFile, modelId?, providerOptions?, serializerRef (submodule commit) }`. |
| **EvalRecord** | One (ReplayPoint × CandidateConfig) result: reconstructed context, candidate output, all metric scores, timings, cost. |
| **Generativity** | The north-star label, computed on *recorded* data: did human nodes follow the ghost's resolution that build on it (edges into/out of accepted ghost nodes, or subsequent human nodes semantically close to the ghost content)? Versioned as `generativity@vN`. |
| **Golden set** | A small, curated, anonymized set of high-value ReplayPoints held out from iteration and used as the CI regression gate. |

---

## Architecture

```
PRODUCTION Supabase ──extract──▶ datasets/<name>/snapshot.json   (frozen, gitignored)
                                        │
                                 build replay points
                                        ▼
                          datasets/<name>/points.jsonl
                                        │
              ┌─────────────────────────┤
              ▼                         ▼
   LOCAL Supabase  ◀──seed as-of──  replay runner ──▶ vendor serialize()  (REAL code)
   (vendor migrations)                  │                    │
                                        │             Langfuse prompt vN
                                        ▼                    ▼
                                  candidate model call (ai + @ai-sdk/google)
                                        │
                                        ▼
                    scoring: deterministic + generativity + LLM judge
                                        │
                              compare / report / Langfuse experiment
```

Two Supabase connections, deliberately separated:

- `PROD_SUPABASE_URL` + `PROD_SUPABASE_SERVICE_ROLE_KEY` — **extract only**,
  read-only usage.
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — the **local** stack
  (`npm run db:start`, runs the vendor repo's migrations). The vendor's
  `src/db/client.ts` reads these names, so the production serializer
  transparently reads the seeded local DB during replay.

---

## Repo Structure

```
thinking-canvas-evals/
├── src/
│   ├── extract/        # prod → TrailSnapshot
│   ├── replay/         # replay-point builder, time-travel seeder, context reconstruction
│   ├── run/            # candidate runner (prompt fetch, model call)
│   ├── score/          # deterministic metrics + generativity labeler
│   ├── judge/          # LLM judge + calibration
│   ├── compare/        # paired A/B, bootstrap CIs
│   ├── report/         # markdown reports, Langfuse experiment logging
│   ├── lib/            # shared: env, dataset io, embedding helpers
│   └── cli.ts          # commander CLI — every capability is a subcommand
├── datasets/           # gitignored — real user thinking, treat as sensitive
├── golden/             # anonymized golden set — the only dataset in git
├── reports/            # gitignored run outputs
├── vendor/
│   └── thinking-canvas-be/   # git submodule, PINNED — the code under test
├── CLAUDE.md           # this file
├── TASKS.md            # implementation order
└── GUIDELINES.md       # how to use this tool to improve ThinkingCanvas
```

Import backend code via tsconfig paths: `@tc/*` → `vendor/thinking-canvas-be/src/*`,
`@tc-types` → `vendor/thinking-canvas-be/types/index.ts`. Example:

```ts
import { serialize } from '@tc/serializer/index.js'
import type { AgentRole, AiContribution } from '@tc-types'
```

---

## Non-Negotiables (every task)

1. **Never re-implement backend logic.** Serialization, tier classification,
   rejection blocks, model registry — always imported from `vendor/`. If the
   harness needs backend code that isn't exported, change the backend repo, not
   this one.
2. **Never optimize for acceptance rate.** Generativity is the north star;
   the judge is its calibrated proxy. Any metric, gate, or report that ranks
   candidates by raw acceptance is a bug.
3. **No leakage.** As-of filtering must exclude the recorded ghost itself, its
   thread turn, its rejection insight, and every row created after `as_of`.
   A candidate must never see the outcome it is being scored against.
4. **Datasets are frozen and sensitive.** Snapshots contain real human thinking.
   `datasets/` and `reports/` are gitignored; only the anonymized `golden/` set
   is committed. Never paste snapshot content into issues, PRs, or prompts
   outside the runner.
5. **Everything versioned.** CandidateConfigs name a prompt version and a
   serializer commit. Metrics and the judge rubric carry versions
   (`generativity@v1`, `judge@v2`). A report that can't be reproduced is void.
6. **Prod is read-only.** The extract client must never write. Local Supabase
   is disposable (`npm run db:reset` between replay points is acceptable v1
   behavior; optimize later).
7. **Judge outputs are advisory until calibrated.** A judge version may only
   gate decisions after its correlation with generativity labels is measured
   and recorded (Task 9).

---

## Key Commands

```bash
npm run cli -- extract --canvas <id> --out datasets/<name>   # prod → snapshot
npm run cli -- points --dataset datasets/<name>              # snapshot → replay points
npm run cli -- label --dataset datasets/<name>               # generativity labels
npm run cli -- run --dataset <d> --candidate candidates/<c>.json
npm run cli -- compare --a runs/<a> --b runs/<b>             # paired A/B + report
npm run db:start        # local Supabase via vendor migrations
npm run db:reset        # wipe + re-migrate local stack
npm run typecheck
npm run test
```

---

## Backend Touchpoints (the API surface this repo consumes)

| Backend module | Used for |
|---|---|
| `@tc/serializer/index.js` → `serialize(thread, agentRole, canvas, options?)` | Context reconstruction — the heart of replay |
| `@tc-types` | All shared types (`AgentRole`, `ThreadMessage`, `AiContribution`, …) |
| `@tc/lib/llm.js` → `models`, `generateEmbedding` | Same model + embedding config as production |
| `@tc/lib/prompts.js` → `getPrompt(name, fallback)` | Production-labeled prompts; the runner also fetches *specific versions* via `@langfuse/client` directly |
| `vendor/thinking-canvas-be/supabase/migrations/` | Schema for the local replay stack |

Langfuse is also the fidelity oracle: production traces (via Mastra) record the
exact context sent at spawn time. Reconstruction correctness is validated by
comparing rebuilt contexts against those traces (Task 5).

> **Import-time gotcha:** `vendor/src/db/client.ts` creates its Supabase client
> at module load from `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. Those env
> vars must be set (the CLI loads `.env` first) before any `@tc/*` module is
> imported, or the process crashes on import.
