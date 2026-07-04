# GUIDELINES — Using the Eval Harness to Improve ThinkingCanvas

How to turn eval runs into shipped improvements without fooling yourself.
The harness produces numbers; these guidelines are what make the numbers mean
something.

---

## The North-Star Rule

**Never rank candidates by acceptance rate.** A prompt that maximizes
acceptance converges on agreeable, easy-to-accept ghosts — which is exactly the
cognitive-atrophy failure the product exists to prevent. The Prime Directive
("does this require a cognitive response?") defines the real objective, and the
harness operationalizes it as:

1. **Generativity** (`generativity@vN`) — measured on recorded trails: did
   human thinking follow the contribution? This is ground truth.
2. **Judge score** — the calibrated proxy used for candidates (whose future you
   can't observe). Valid only while its calibration against generativity holds.
3. **Constraint compliance / format validity / jump-distance band** — hard
   gates, not ranking signals.

A rejected ghost followed by three new human nodes did its job. An accepted
ghost nobody built on did not. Read every report with that sentence in mind.

---

## Workflow 1 — Changing an agent prompt (the common case)

1. Create the new prompt version in Langfuse (same `prompt_name`, e.g.
   `expander-system-prompt`) — do **not** move the `production` label yet.
2. Write two candidate files: `baseline.json` (current production version) and
   `candidate.json` (the new version). Same model, same serializer commit —
   isolate the variable.
3. Run both on a working dataset of **≥100 replay points** for that role,
   spanning several users and both phases (diverging/converging).
4. `compare`. Ship-gates, all required:
   - zero new NEGATIVE-CONSTRAINT violations and no `format_validity` regression;
   - judge win-rate 95% CI does not include ≤50% (i.e. the candidate is
     distinguishably better, not just non-worse — for a pure refactor of the
     prompt, "CI overlaps 50%" is acceptable);
   - jump-distance stays in band (a candidate that wins the judge by making
     bigger, flashier leaps is violating the 1–2 jump rule — check this
     explicitly).
5. Read the 5 biggest wins **and** the 5 biggest losses in the report. If a
   loss reveals a failure mode the metrics didn't catch, fix the metric or the
   rubric before shipping — that finding is worth more than the ship.
6. Run the golden set as final gate. Then move the `production` label in
   Langfuse. The label move *is* the deploy (backend fetches by label).
7. Log the decision: link the compare report in the Langfuse prompt version
   notes.

## Workflow 2 — Changing the serializer (or tiers, rejection block, rules)

Same as Workflow 1, but the variable is the submodule commit: run A with
`vendor/` at the current backend main, run B with `vendor/` at the branch
commit. Prompts pinned to identical versions in both. This answers questions
like "does widening Tier 2 to 5 nodes improve Stress-Tester output?" with data
instead of taste. Note the run manifest records the serializer commit — a
compare between mismatched prompt versions AND serializer commits is invalid
(two variables), and the tooling should refuse it.

## Workflow 3 — Attunement & Orchestrator (no generation needed)

These components predict rather than generate, so evaluate them as classifiers
over snapshots (see TASKS "Later" — build when needed):

- Attunement: for each `attunement_state` row, did the ghost fired under it
  succeed (generativity)? Did `phase_shift_suggested` precede an actual phase
  flip? Report calibration of `confidence`.
- Orchestrator: per (cognitive_mode, edge_type, phase) cell, generativity by
  routed role — the cells where a different role consistently outperforms the
  routed one are routing bugs you can now see.

## Workflow 4 — Cadence

| When | Do |
|---|---|
| Every prompt/serializer PR | Golden-set gate (CI, automatic) |
| Before any `production` label move | Workflow 1/2 full compare |
| Monthly | Extract fresh snapshots → new working dataset (trails age as the product changes) |
| Monthly | Re-run judge calibration; recalibrate if correlation drops |
| Quarterly | Refresh golden set: retire stale points, add new roles/behaviors; re-baseline |

---

## Dataset Discipline

- **Frozen means frozen.** Never edit a snapshot; extract a new dataset.
  The manifest hash is what makes two runs comparable.
- **No leakage, verified not assumed.** The as-of rules (Task 5) are the
  correctness core of the whole harness. When touching seeding code, re-run the
  Langfuse-trace fidelity check before trusting any subsequent report.
- **Diversity beats volume.** 100 points from one enthusiastic user measure
  that user, not the product. Spread across users, canvases, roles, phases,
  and session depth (early-session and late-session points behave differently).
- **Golden is holdout.** The moment you iterate a prompt *against* the golden
  set, it stops being a gate and becomes training data. Iterate on working
  datasets; golden is touched only by CI and final ship checks.
- **Privacy.** Snapshots are real human thinking — among the most sensitive
  data this product has. `datasets/` never enters git, reports quote excerpts
  only as needed for review, and anything promoted to `golden/` goes through
  anonymization. Aggregate across users in anything shared publicly.

---

## Reading Results Honestly

- **Paired, or it didn't happen.** Only compare runs over the same replay
  points. The tooling enforces intersection; if the intersection is small,
  extract more data instead of squinting at 30 points.
- **CIs over point estimates.** "58% win rate, CI 51–65%" is a ship;
  "58%, CI 44–71%" is "collect more data."
- **The judge drifts.** It's a model reading a rubric. Recalibrate on schedule,
  pin its version in every manifest, and spot-read 10 random judged records
  per compare — if you disagree with 3+, fix the rubric before believing the
  run.
- **Failed gates are findings.** A candidate that violates constraints or
  leaves the jump band is telling you something about the prompt (or about a
  gap in serializer context). File it in the backend repo; the eval harness is
  upstream of fixes, not just a scoreboard.
- **Cost is a metric.** Records carry token counts and latency. A 2% judge win
  at 3× latency is not a win for a product whose ghosts must feel alive.

---

## How this feeds the bigger loop

Each shipped, eval-gated improvement tightens the product; each production
cycle generates richer trails (with Task 0 provenance) that make the next eval
sharper. Keep the flywheel honest by writing one line per ship into the backend
repo's changelog: *what changed, which report justified it, what the golden
baseline moved to*. That log is the V(n) → V(n+1) record — the evidence that
the trails are, in fact, building the next version.
