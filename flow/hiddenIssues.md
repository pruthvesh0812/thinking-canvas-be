# Hidden issues

Things found while walking the code that fail quietly, or can trap a user, and are NOT fixed yet.
One entry per issue. Add the date, where it lives, what really happens, and a suggested fix. Fix them in one go later.

Status values: `open`, `fixed (commit)`, `wontfix (why)`.

---

## 1. Route: every unexpected error becomes a flat `500` with no detail

- **Found:** 2026-10-31, walking Stone 1 (`agentRunRoute`)
- **Where:** `src/routes/agent-run.ts:39-42` (also the same shape in `src/routes/ghost-status.ts`)
- **What happens:** if anything throws inside `handleAgentRun` (database down, a bug), the route catches it and answers
  `{ "error": "internal error" }` with status 500. Expected failures (bad payload, already running) are fine: they come back as
  proper 4xx from the handler. Only the unexpected ones are silent.
- **Why it matters:** the frontend cannot tell "try again" from "this will never work", and the only trace is one log line.
  The log keeps `error.message` only, not the stack, so finding the real cause is slow.
- **Suggested fix:** log the stack too; include a short request id in the 500 body and the log line so a user report can be matched
  to a log; (optional) let the handler return a `retryable` flag for known transient errors.
- **Status:** open

## 2. Route: malformed JSON looks like a "missing field" error

- **Found:** 2026-10-31, Stone 1
- **Where:** `src/routes/agent-run.ts:20` (`await c.req.json().catch(() => null)`), same pattern in `ghost-status.ts`
- **What happens:** a body that is not valid JSON is turned into `null`, then Zod fails on `null` and the user gets
  `400 invalid payload` with issues like "expected object, received null". That points at the wrong problem.
- **Suggested fix:** answer a clear `400 { error: "body is not valid JSON" }` before validating.
- **Status:** open

## 3. A run can be stuck `queued` forever, which locks the agent on that focus

- **Found:** 2026-10-31, while reading Stone 1 and the handler it calls
- **Where:** `src/routes/agent-run-handler.ts:72-75`. `createRun` saves the run as `queued`, THEN `sendRunRequested` sends the Inngest event.
- **What happens:** if the send fails (Inngest down, network), the handler throws, the route answers 500, but the run row stays
  `queued`. `canAgentFire` counts `queued` as active (`src/db/agent-runs.ts:43`), so that agent is refused on that focus (`409 run_in_progress`)
  until someone fixes the row by hand. No worker will ever pick it up, because no event exists.
- **Suggested fix:** if the send throws, mark the run `failed` before rethrowing (or send first inside a transaction-like order);
  AND add an expiry: treat a run as inactive if it has been `queued`/`running` longer than a limit (see issue 4).
- **Status:** open

## 4. A run can be stuck `running` forever if the worker dies mid-run

- **Found:** 2026-10-31, same reading
- **Where:** `src/pipeline/execute-run.ts`. Normal failures are caught and the run is marked `failed`, but a process crash, a redeploy
  or a killed worker never reaches that code. The Inngest function has `retries: 0` on purpose (`src/pipeline/run-agent.ts`), so nothing re-runs it.
- **What happens:** the row stays `running`, and `canAgentFire` blocks that agent on that focus with `409 run_in_progress`.
- **Suggested fix:** a staleness rule in `getActiveRuns` / `whyBlocked` (a run older than N minutes does not block), and/or a small
  cleanup job that marks stale `queued`/`running` rows `failed`. Pick N from the real model latency.
- **Status:** open
