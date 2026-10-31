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

## 4. The run-agent concurrency key ignores the focus nodes, so the same agent on a DIFFERENT focus has to wait

- **Added:** 2026-10-31 (walkthrough, Stone 4)
- **Where:** `src/pipeline/run-agent.ts:63` (`concurrency: { key: 'event.data.canvas_id + "-" + event.data.agent', limit: 1 }`)
  versus `src/lib/block-rules.ts` (`whyBlocked` / `focusOverlaps`), which the handler uses.
- **Issue:** the handler's lock is per canvas + agent + focus: it only refuses a run whose focus OVERLAPS a run already going, so the same
  agent may run at the same time on different nodes. The worker's concurrency key is only canvas + agent, with limit 1. So a second run of
  the same agent on a different focus is accepted by the handler (202) but then waits in Inngest behind the first run, even though it was
  allowed to run in parallel. The two layers disagree. (The story originally chose canvas + agent; the later rule "same agent, different focus
  is fine" was decided at the handler and never carried over here.)
- **TODO:** put the focus into the concurrency key.
  - Add a `focusKey` to the event data: the sorted focus node ids joined together, or the word `canvas` when the focus is empty (canvas-wide).
  - Key becomes canvas + agent + focusKey, still limit 1.
  - The handler lock already refuses overlapping focus sets, so an exact-match key is enough for the worker: two runs with different
    focus sets can then run in parallel.
  - Add a test that two runs with different focus produce different keys and the same focus the same key (extract the key builder to a small pure function).
- **Status:** open


## 5. `session_id ?? ''` in the run worker could publish to an empty channel

- **Added:** 2026-10-31 (walkthrough, Stone 5)
- **Priority: Low**
- **Why Low:** it cannot realistically happen today.
  - The handler checks `session.canvas_id === canvas.id` before the run is created, so the run starts with a real session id.
  - `agent_runs.session_id` only becomes NULL if the session row itself is deleted while the canvas still exists
    (the column is `ON DELETE SET NULL`). Nothing in the code deletes sessions (`closeSession` only sets a status), and
    `nodes.session_id` / `edges.session_id` reference sessions with no cascade, so the database refuses to delete a session that has
    nodes or edges. If the whole canvas is deleted, the run row is deleted too, so the worker finds no run and skips.
  - The `?? ''` is only there to satisfy TypeScript, because the column is declared nullable.
- **Where:** `src/pipeline/execute-run.ts:70` (`const sessionId = run.session_id ?? ''`)
- **Issue:** if `session_id` were ever NULL, the worker would publish every message to the channel `canvas:stream:` (empty session id).
  Nobody listens there, so the whole run would stream into the void and the user would see nothing, with no error.
- **TODO:** a tiny hardening, one line: replace `?? ''` with an explicit failure. If `run.session_id` is null, fail the run with a clear error
  (and skip publishing) so a null can never silently publish to an empty channel. Optionally add a test: a run with `session_id: null` fails with that error.
- **Status:** open

## 6. A focus node deleted after the request just disappears, and the frontend is never told

- **Added:** 2026-10-31 (walkthrough, Stone 6)
- **Where:** `src/context/retrieve-s1.ts:42-46`. It throws only when NONE of the focus nodes can be loaded (line 43). The worker also
  does not re-check the focus before announcing the run (see `hiddenIssues.md` issue 6).
- **Issue:** the handler (Stone 2) checks that every focus node exists when the request is accepted. If one of them is deleted or set aside
  before the worker retrieves, `retrieveS1` silently carries on with the rest and the answer is built for fewer nodes than the user
  asked about. The user is never told that part of their focus was dropped. (If ALL are gone, the run fails, but with a generic
  "could not produce a usable answer".)
- **TODO:** the error must be conveyed to the frontend.
  - In `retrieveS1`, when some focus nodes are missing, do not drop them silently: either fail the run with a specific error, or carry on and
    report which ones were dropped (decide which; failing is simpler and safer).
  - Make that reason reach the frontend: the `structure_error` message today carries one generic text. Add a machine-readable
    `code` (for example `focus_node_gone`) plus the ids, so the frontend can say "the node you asked about was deleted".
  - Update `FRONTEND-CONTRACT.md` §12.2 and add tests (partial focus missing, all focus missing).
- **Related:** `hiddenIssues.md` issue 6 (worker never checks the run is still wanted). Fixing that check at the start of the run covers the
  same case earlier, before `structure_start`.
- **Status:** open
