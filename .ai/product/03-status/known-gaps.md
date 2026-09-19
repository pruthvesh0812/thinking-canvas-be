---
last-verified: 2026-09-19
verified-against: src/index.ts · src/routes/intervention.ts · src/lib/auth.ts · src/lib/ownership.ts · src/pipeline/agent-pipeline.ts
stale-after-days: 30
referenced-from: FRONTEND-CONTRACT.md §11
---

# Known Gaps

> Product-status ledger of what is designed or half-wired but not yet fully
> live. The **backend-facing** view of the same audit lives in
> `.ai/context/FRONTEND-CONTRACT.md` §10 (designed, not built) and §11
> (recommended backend fixes) — this file is the product-level roll-up and is
> the numbering the intervention work refers to. Each row says who owns the
> remaining work: **BE** (backend), **FE** (thinking-canvas-frontend), or done.

| # | Status | Gap | Owner of remaining work |
|---|---|---|---|
| 1 | **Resolved 2026-09-19** | **Proactive AI path disconnected.** `interventionRoute` existed but was never mounted in `src/index.ts` (dropped in a route reorder, commit 1418bf4), so `POST /api/intervention/*` 404'd and `canvas/intervention.trigger` was never sent. The judge, Expander, Stress-Tester, Attunement, phase latch, receptivity and tier-locked upgrade offers were all unreachable — only Articulator (relate edge), Outer Subconscious (question edge) and Observer (session complete) ran. `interventionRoute` is now mounted behind `requireAuth` with `ownsSession` checks in every handler. | done (see #11 for the FE half) |
| 2 | **Resolved 2026-09-19** | No auth on Plane 2/3. `requireAuth` (`src/lib/auth.ts`) now verifies a Supabase JWT on every `/api` route; body-id routes ownership-check via `ownsCanvas`/`ownsSession` (`src/lib/ownership.ts`). | done |
| 3 | Open (P1) | Free tier reaches Outer Subconscious via question edges — tier is checked only in the debounced/judge path, not in `outer-sub-pipeline`. | BE |
| 4 | Open (P1) | `carry_forward_ids` accepted by the schema but ignored. | BE |
| 5 | Open (P2) | No `POST /api/stripe/checkout`; the webhook expects `metadata.user_id` set by whoever creates the subscription. | BE |
| 6 | Open (P2) | `interacted_at` validated but unused. | BE |
| 7 | Open | Observer structure writes + per-edge accept/reject not built (`observer_structures`/`observer_edges` never written; no `POST /api/observer-edge-status`). | BE |
| 8 | Partial | Phase transitions: `sessions.current_phase` was frozen at `diverging`. The judge path now advances it via `maybeAdvancePhase` (the intervention phase latch), which is what unlocks the Stress-Tester — but that only takes effect now that the proactive path (#1) is reachable. The old standalone `updatePhase()` remains uncalled. | BE (verify end-to-end once FE #11 lands) |
| 9 | Open | `ignored` pair status is typed (`GhostStatus`) but no code sets it; `ghost-status` accepts only accepted/rejected. | BE |
| 10 | Open | Velocity-adaptive debounce (docs say 8–25s adaptive; code is a fixed 10s per `session_id`). | BE |
| 11 | **Backend-ready 2026-09-19 — FE work outstanding** | **Frontend does not drive the intervention layer.** With #1 fixed the backend now accepts the decide→wait→generate handshake and emits the `waiting`/`offer`/`withdraw` SSE messages, but thinking-canvas-frontend does not yet call the routes or handle the messages. See "Frontend work needed" below. | FE |

---

## #11 — Frontend work needed in thinking-canvas-frontend

The backend intervention layer is now fully wired and reachable. Nothing else
proactive fires until the frontend does its half. Reference:
`.ai/context/intervention-layer/01-trigger-and-handshake.md` (the handshake) and
`07-streaming-protocol.md` (the SSE messages).

**1. Call the intervention routes (Plane 2).** All three require the Supabase
JWT (`Authorization: Bearer`), like every other `/api` route:

- `POST /api/intervention/trigger` — fire this when the FE's own cheap trigger
  ruleset passes (attention / action-class gate; the FE is the *only* side that
  sees raw cursor/dwell events, so maturity is deliberately **not** in this
  gate — that's the backend judge's call). Body: `{ canvas_id, session_id,
  node_id }`. Response: `{ offer_id }` (202). This is the entry point that
  replaces the retired `canvas/node.created` auto-fire — the backend does
  **not** re-trigger generation on node creation any more, by design.
- `POST /api/intervention/process` — fire this when the processing timer lapses
  or the user hits "process now". Body: `{ offer_id, session_id, canvas_id,
  reason }` where `reason` is `'manual'` (user was watching — pulled it forward
  or resumed a paused timer) or `'lapse'` (timer ran out on its own). This flag
  becomes the show ruleset's attention state, so send it honestly.
- `POST /api/intervention/dismiss` — fire this when the user waves the waiting
  offer off. Body: `{ offer_id }`. This is a *receptivity* signal, not a
  content rejection — it never feeds `rejection_insights`.

(There is also `POST /api/intervention/ghost-interaction` for accept/reject/
hover on an *old* ghost, which runs the Impact Check — wire it when the
old-ghost interaction UX is built.)

**2. Handle the new SSE messages in `src/hooks/use-ghost-stream.ts`.** The
stream already carries `spawn`/`chunk`/`node_type`/`done`; add the three
intervention messages (switch on `type`, ignore unknown types — don't throw):

- `waiting` → start the processing timer using the message's `timer_ms` (the
  backend tunes it by receptivity; do **not** hard-code the countdown) and show
  the ambient glow/waveform. Carries `{ offer: InterventionOffer, timer_ms }`.
- `offer` → render the low-intensity show (glow or sidebar card), choosing the
  surface from viewport position and the offer's `directness`. Carries
  `{ offer }`.
- `withdraw` → remove the waiting/shown offer with that `offer_id`. Carries
  `{ offer_id }`.

Key offers/ghosts by `(anchor_node_id, seq)` so a late stale message is ignored.

**3. Reuse the existing timer/glow UI.** The countdown + glow interaction
already exists as a demo in `src/hooks/use-intervention-demo.ts`. The remaining
work is wiring that UI to the real `waiting`/`offer`/`withdraw` stream and the
`/trigger` → `/process` | `/dismiss` calls above, rather than building the
surface from scratch.
