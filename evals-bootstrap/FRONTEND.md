# FRONTEND — Does the Eval Harness Need One? (Decision + Context)

> Copied into the new repo by `init.sh`. Read before building any UI for the
> harness. TL;DR: **v1 needs no frontend.** When human-review volume justifies
> it, build a **local-only viewer inside this repo** (Phase B/C below) —
> not a Next.js app, not a separate repo.

---

## The decision, by job

Map every "we need a UI" impulse to this table before writing one:

| Job | Right tool | Build a FE? |
|---|---|---|
| Browse experiment runs, scores over time, per-item drill-down | **Langfuse UI** (Task 11 pushes runs there) | No — duplicating Langfuse is wasted work |
| Read an A/B verdict, CI, top wins/losses | Markdown report (Task 10) | No |
| Prompt version management / promotion | Langfuse prompt UI | No |
| See the **canvas graph as-of a replay point** (nodes, edges, trigger) | Nothing existing renders this | Yes — Phase B |
| Side-by-side recorded vs candidate ghost, with context excerpt | Markdown is painful for this | Yes — Phase B |
| Human review queue: spot-check judge calls, label edge cases, promote golden points | Needs interaction + keyboard flow | Yes — Phase C |

## Why not Next.js

Next.js earns its complexity through SSR, routing, auth, API routes, and
deployment. The viewer needs none of those:

- **No server-side anything.** The data is local JSONL/JSON files under
  `runs/` and `datasets/`.
- **No auth, no users.** It's you, on your machine.
- **Deployment is an anti-goal.** Datasets are real human thinking — the most
  sensitive data the product has. A local-only viewer makes "this never leaves
  the machine" structural instead of a policy. A deployable app is a standing
  invitation to accidentally host user cognition on Vercel.
- **No SEO, no hydration concerns, no app router ceremony.**

Revisit only if the harness becomes a hosted, multi-person team service
(shared review queues, comments, assignments). That is a different product —
decide it then, don't pre-build for it.

## Why inside this repo, not a separate one

The viewer is a *lens over this repo's file formats* (`EvalRecord`,
`ReplayPoint`, `TrailSnapshot`). Splitting it out means versioning those
schemas across repos for zero benefit — there is no separate deploy cadence,
team, or consumer. It lives in `viewer/` as an npm workspace and imports the
Zod schemas from `src/lib/` directly, so a schema change breaks the viewer at
typecheck time, not at runtime.

---

## Phasing

### Phase A (v1, Tasks 0–12) — no frontend
Langfuse UI + markdown reports. Ship the whole measurement loop first; a
viewer that renders unvalidated replay data is polish on top of nothing.

### Phase B — self-contained HTML reports (Task 13)
Upgrade the Task 10 report generator to *also* emit a single self-contained
`report.html` next to the markdown: inline CSS/JS, no server, openable from
the file system, shareable as one file.

Contents per compare: verdict header (win rate + CI), metric delta table, and
for each of the top-N wins/losses a **replay card**: a small read-only SVG
render of the as-of canvas graph (nodes as boxes with `direction_marker` +
summary, edges typed, trigger node highlighted), the recorded ghost and the
candidate ghost side by side, scores, and the judge rationale. Static
generation from `EvalRecord`s — a template function, not a framework.

### Phase C — interactive review viewer (Task 14)
When you're spending >30 min/week reading records, build `viewer/`:

- **Stack:** Vite + React + TypeScript. Graph via `@xyflow/react` (React Flow)
  or the Phase B SVG renderer if it's already good enough. No state library
  beyond React; no router beyond a query param.
- **Data access:** a ~50-line dev-server plugin (or `tc-eval serve`) exposing
  read-only `GET /runs/...`, `GET /datasets/...` and **one** write endpoint,
  `POST /review` — appending to `reviews/<run>/review.jsonl`.
- **Screens (only three):**
  1. **Run browser** — pick a run/compare, filter by metric, sort by score
     delta.
  2. **Replay review** — the Phase B card, interactive: pan/zoom graph,
     expand full serialized context, keyboard verdicts (`a` agree with judge,
     `d` disagree, `g` flag for golden, `n` next). Verdicts append to
     `review.jsonl`.
  3. **Golden queue** — points flagged `g`, with the anonymization checklist;
     "promote" shells out to `tc-eval golden add`.
- **Review data feeds back:** `review.jsonl` disagree-rates are the input to
  judge recalibration (Task 9) — the viewer is part of the measurement loop,
  not decoration.

### Explicitly out of scope (any phase)
Dashboards/time-series (Langfuse), prompt editing (Langfuse), live production
monitoring (backend's concern), anything requiring a database or auth.

---

## Non-negotiables for the viewer

1. **Local-only.** Binds to `127.0.0.1`; no build target that produces a
   deployable app; snapshot content never leaves the machine.
2. **Read-only over run/dataset files** except the single `review.jsonl`
   append path. The viewer never mutates records, labels, or golden sets
   directly.
3. **Schemas imported from `src/lib/`** — never redeclared in `viewer/`.
4. **Keyboard-first review.** The point is throughput on human judgment; if a
   review takes more than a few seconds of mouse work, the screen is wrong.
