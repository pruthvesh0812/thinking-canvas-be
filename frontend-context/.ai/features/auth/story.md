---
feature: "auth"
type: story
created: 2026-07-05
status: draft
git_branch: "[set at implementation: feature/auth-<timestamp>]"
---

## What
Anonymous-first auth: silent anonymous sign-in on first visit, account
creation prompt after the first Session Complete, anonymous→permanent
conversion (same uid), and the middleware gate for session 2+.

## Why
Zero-friction first session is a product decision — the user must feel the
value before being asked for an email. RLS also silently returns empty result
sets without a valid auth session, so this story unblocks real multi-user data.

## Context to Load
`ARCHITECTURE.md` + `SESSION-FLOWS.md`

## Depends On
canvas-dashboard

## Blast Radius
Supabase client (SSR variant), middleware (new), login page, Session Complete
screen 3, dashboard.

## Files to Touch
```
CREATE:
  src/middleware.ts               (session 2+ gate on /canvas/*)
  src/components/auth/SignupPrompt.tsx  (post-first-Session-Complete)
MODIFY:
  src/lib/supabase.ts             (@supabase/ssr browser/server split)
  src/app/login/page.tsx          (Google OAuth + email/password)
  src/components/session/SessionCompleteModal.tsx (screen 3 → SignupPrompt)
```

## Contract Impact
- Supabase Auth only: `signInAnonymously()`, `linkIdentity` (Google) /
  `updateUser` (email+password) for conversion — same uid, so all RLS rows
  carry over with **no data migration**.
- No backend endpoints. RLS policies live in the backend repo's migrations.

## Risks
- Anonymous session loss (cleared storage) orphans the canvas — surface the
  signup prompt copy honestly ("create an account to keep this").
- Middleware must not gate `/` or `/login`; only `/canvas/*` and only when the
  user already has ≥1 closed session and no permanent account.

## Definition of Done
First visit: canvas works with zero prompts. After first Session Complete:
signup prompt; converting via Google or email keeps every existing canvas.
Second canvas/session without an account → redirected to /login. RLS verified:
user B cannot read user A's canvas by URL.

## Task Breakdown
NONE — implement directly from this story.
