# Issues with TODOs

Issues the owner decided to track, each with the TODO that fixes it. Not fixed yet unless marked.
(Silent failures found while reading code live in `hiddenIssues.md`; this file is for issues that already have a decided TODO.)

Status values: `open`, `fixed (commit)`.

---

## 1. `POST /api/agent/run` does not check that the user owns the canvas

- **Added:** 2026-10-31 (walkthrough, Stone 2)
- **Where:** `src/routes/agent-run-handler.ts` (checks 2 to 6), `src/routes/agent-run.ts`
- **Issue:** the handler checks that the canvas exists, that the session belongs to that canvas, and that the focus nodes are on that canvas.
  It never checks WHO is calling. There is no login check on this route at all, so anyone who knows a canvas id, a session id and
  a node id can start an agent run on someone else's canvas, spend their model budget and make ghosts appear on their stream.
- **Related:** the same gap is already in the old audit: `FRONTEND-CONTRACT.md` §11 row 1, "No auth on Plane 2/3". It affects every
  `/api` route (`canvas-event`, `ghost-status`, `session`, `stream`), not only this one.
- **TODO:**
  - Look at this properly: decide the auth approach (the audit suggests verifying the Supabase JWT from the `Authorization: Bearer` header
    on all `/api` routes, and a token query parameter for the `EventSource` stream).
  - Then add an ownership check: the verified user id must equal `canvas.user_id` (the handler already loads the canvas in check 2).
  - Add tests: no token gives 401, a token for another user gives 403, the owner passes.
- **Status:** open

## 2. If sending the run event fails, the run stays `queued` and the lock is never released

- **Added:** 2026-10-31 (walkthrough, Stone 2). Same finding as `hiddenIssues.md` issue 3.
- **Where:** `src/routes/agent-run-handler.ts:72-75` (`createRun`, then `sendRunRequested`)
- **Issue:** `createRun` saves the run as `queued`, then the Inngest event is sent. If the send throws, the route answers 500, but the
  `queued` row stays. `canAgentFire` counts `queued` as active (`src/db/agent-runs.ts:43`), so that agent is refused with `409 run_in_progress`
  on that focus, with nothing that will ever finish or clear the run.
- **TODO:** if the event send fails, do not leave a queued run behind: undo the run (mark it `failed` with the send error, so the log keeps
  the reason and the lock is released) and return a 500 to the caller. Add a handler test: `sendRunRequested` throws, then the run is not
  left `queued` and the status is 500.
- **Status:** open

## 3. The 409 does not say WHY the agent is blocked

- **Added:** 2026-10-31 (walkthrough, Stone 3)
- **Where:** `src/lib/guards.ts:10-32` (`canAgentFire` drops the reason and returns only true/false),
  `src/routes/agent-run-handler.ts:67-69` (always answers the same 409 message)
- **Issue:** `whyBlocked` knows which of two reasons applies: `run_in_progress` (a run is still going) or
  `ghosts_pending` (earlier ghosts are still undecided). The caller never sees it. The frontend gets one generic
  409 and cannot tell the user the right thing: "wait, it's running" versus "accept or reject the earlier ghosts first".
- **TODO:** tell the frontend the reason.
  - Make `canAgentFire` return the reason (for example `{ allowed: false, reason }`) instead of a bare boolean.
  - Include it in the 409 body as a `code` field (`run_in_progress` or `ghosts_pending`), keeping a human-readable `error` text.
  - Update `FRONTEND-CONTRACT.md` §12.1 so the frontend shows the matching message:
    `ghosts_pending` -> "Accept or reject the earlier response first", `run_in_progress` -> "Still working on it".
  - Add handler tests for both codes.
- **Status:** open
