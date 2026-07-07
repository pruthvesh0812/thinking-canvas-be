---
feature: "contract-layer"
type: story
created: 2026-07-05
status: draft
git_branch: "[set at implementation: feature/contract-layer-<timestamp>]"
---

## What
The typed seam to the outside world: mirrored contract types, the Supabase
browser client, and `lib/api.ts` wrappers for every implemented backend endpoint.

## Why
Every canvas story calls through this layer. Building it first — against the
backend's real code — is what prevents the speculative-contract drift the
backend-first decision was made to avoid.

## Context to Load
`API-CONTRACT.md` + `.ai/skills/sync-contract-types.md` + `.ai/skills/add-api-call.md`

## Depends On
project-bootstrap

## Blast Radius
`types/`, `src/lib/` — no UI.

## Files to Touch
```
CREATE:
  types/index.ts        (mirrored from backend — run sync-contract-types.md,
                         record the backend commit sha in the header)
  src/lib/supabase.ts   (browser client, anon key; NO Realtime usage)
  src/lib/api.ts        (canvasEvent, ghostStatus, sessionStart, sessionComplete
                         + ApiError; one wrapper per endpoint, nothing invented)
```

## Contract Impact
Touches every endpoint in API-CONTRACT.md. Do NOT write wrappers for
endpoints that don't exist yet (observer-edge-status — Known Gap #2).

## Risks
- Zod dependency decision (mirror keeps schemas only if zod is installed —
  see sync-contract-types.md step 2). Decide once, note it in the mirror header.

## Definition of Done
`npm run build` clean; a scratch page can round-trip `POST /api/session/start`
against a locally running backend and log the `session_id`; grep confirms no
`supabase.channel` and no raw `fetch` outside `api.ts`.

## Task Breakdown
NONE — implement directly from this story.
