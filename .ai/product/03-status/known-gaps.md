---
last-verified: 2026-09-19
verified-against: code in both repos + git history (commit refs inline)
stale-after-days: 14
audience: product, engineering, support escalation, anyone prioritising work
---

# Known Gaps: Verified Bugs, Holes, and Drift

> Every item was checked against code on 2026-09-19, not taken from docs. Severity: **P0** breaks the core product promise · **P1** blocks launch or causes user-visible harm · **P2** correctness or hygiene.
> When you fix one, delete its row and update `feature-status.md`.

---

## Product-breaking

### #1 · P0 · The Expander and Stress-Tester never fire (the proactive AI is disconnected)
- **What:** The intervention pipeline (`agentPipeline`, id `intervention-pipeline`) triggers only on `canvas/intervention.trigger`. That event is sent only by `src/routes/intervention.ts`, and **`interventionRoute` is imported but never mounted in `src/index.ts`**. Meanwhile `canvas-event` still emits `canvas/node.created`, which **no Inngest function consumes** anymore.
- **How it happened:** Task-04 (`61f2da2`) mounted the route. The `chore` commit `1418bf4` (2026-07-19) reordered the route mounts and dropped `app.route('/api', interventionRoute)`. It looks accidental. The frontend was also never built to call `/api/intervention/trigger` or to handle `waiting`/`offer`/`withdraw`.
- **Impact:** The product's default experience (write thoughts, and the AI expands and challenges them at the right moment) doesn't exist. The free plan's headline role (Expander) is dead. The judge, attunement, phase latch, receptivity, show ruleset, and upgrade offers are all unreachable. Users only get AI by learning two pen gestures.
- **Fix:**
  1. Mount the route after `requireAuth`, and add ownership checks to its handlers (they were written before auth existed).
  2. Build the frontend trigger ruleset, the `/trigger`, `/process`, and `/dismiss` calls, and handlers for the `waiting`/`offer`/`withdraw` messages (the timer, glow, and card UI already exist as a demo).
  3. Decide whether to keep a temporary consumer for `canvas/node.created` in the meantime.

### #2 · P0 (business) · No way to pay, and no plan enforcement on live paths
- **What:** There's no checkout endpoint, payment link, or upgrade UI, and `/settings` is a stub. `getAvailableAgents` is called only in the unreachable intervention pipeline. The outer-sub, articulator, session-complete (Observer), and rejection-insights pipelines check no tier.
- **Impact:** $0 revenue path. Free users get Pro-designated roles, and turning enforcement on later will visibly take features away.
- **Fix:** `POST /api/stripe/checkout` (setting `metadata.user_id`), or a Stripe Payment Link as v1. Tier gates in each immediate pipeline. The frontend `UpgradePrompt`. A grandfathering decision.

## Launch blockers

### #3 · P1 · Auth and ownership checks are unmerged, and coupled across repos
- The backend's `requireAuth` and ownership checks (`6964a8e`) and the frontend's token-on-every-call change (`4d2dda5`) both live on feature branches. **Merge and deploy them together.** The backend alone breaks the current frontend (401s), and the frontend alone leaves the API open.
- Until merged, the API is unauthenticated: anyone who knows a canvas or session UUID can post events or read a session's SSE stream.

### #4 · P1 · The Observer's designed interaction isn't built
- `runObserver` produces validated leveled structures, but session-complete flattens the observation *nodes* into `session_learnings` cards (contradiction → "contradiction", everything else → "question"). Anchors and edges are lost.
- `observer_structures` / `observer_edges` are never written, `POST /api/observer-edge-status` doesn't exist, and the re-think loop can't be triggered.
- **Impact:** the Pro flagship's most distinctive interaction ("pull the thread yourself, edge by edge") is invisible.

### #5 · P1 · No telemetry: success can't be measured
- Neither repo has product analytics or error tracking. The product's success signals (reject rate, acceptance-then-build-on, return sessions, dwell before accept) can't be observed. The data mostly exists in tables (`agent_threads` statuses, `ai_contributions`, `sessions`), but nothing aggregates it. See `05-risks/killers.md`.

### #6 · P1 · Guest data loss
- Anonymous users who clear storage or switch device lose their canvases, with no recovery path. The sign-up prompt appears only at the first Session Complete.

## Correctness and hygiene

| # | Sev | Gap | Where |
|---|---|---|---|
| 7 | P2 | `carry_forward_ids` is validated but ignored by the backend. The frontend writes carry-forward `session_learnings` directly (a documented asymmetry). | `types/index.ts:519`, `routes/session.ts` |
| 8 | P2 | Ghost `ignored` status is never set; `interacted_at` is validated but unused | `routes/ghost-status.ts` |
| 9 | P2 | The CORS default is `http://localhost:9000` in code, but docs and FE assume 3000. It works only if `FRONTEND_URL` is set. | `src/index.ts` |
| 10 | P2 | The `doubt` edge is in the design (Foundation Principles, CORE-CONCEPTS) but has no pen; users can't express doubt as a relation | FE `PenRack.tsx`, `canvas-store.ts` |
| 11 | P2 | Intervention route handlers take `canvas_id`/`session_id` from the body without ownership checks. Harmless while unmounted; **must be fixed before mounting.** | `src/routes/intervention.ts` |
| 12 | P2 | The Open Threads rail's live-thread list only renders mock threads | FE `OpenThreadsRail.tsx` |
| 13 | P2 | The demo intervention hook ships in the production canvas (inert unless the mock node ID exists) | FE `Canvas.tsx`, `use-intervention-demo.ts` |

## Documentation drift (fix via the `update-ai-context` skill)

| Doc | Says | Reality |
|---|---|---|
| BE `CLAUDE.md` "Current Build Status" | Intervention Spectrum "designed but NOT implemented"; `updatePhase` uncalled | Backend built and merged (July 2026), but unreachable (#1). A phase latch exists. |
| FE `CLAUDE.md` "Current Build Status" | "Implementation not yet started" | 78 commits: canvas, ghosts, sessions, auth, set-aside all built |
| BE `ARCHITECTURE.md` | Routes unauthenticated; route list omits intervention; "Orchestrator" routing table | Auth on a branch; the judge replaced the Orchestrator |
| BE `FRONTEND-CONTRACT.md` §10.3, §8 | Phase frozen; Stress-Tester blocked by phase | The latch exists. The real blocker is #1. |
| FE `CORE-CONCEPTS.md` | "Expander fires on new node after pause"; Orchestrator | Not true today (#1) |
| `FoundationPrinciples.md` | Orchestrator; 4 edge types | The judge; `relate` edge added |
| BE `.ai/features/sdk-delivery-filter/`, `.claude/commands/java_standards.md`, `liquibase_check.md`, `code_review.md` ("help-center-v2") | — | Artefacts from an unrelated Spring Boot project. Agents should ignore them. |
