---
last-verified: 2026-07-05
verified-against: backend ARCHITECTURE.md (2026-06-20) + backend src/index.ts (CORS, port, routes)
stale-after-days: 30
---

# ARCHITECTURE.md

> **Load this when:** Working on deployment, env vars, auth, billing, service
> topology, or anything touching how the frontend talks to the outside world.

---

## Two Separate Repos

| Repo | Description | Deployment |
|---|---|---|
| `thinking-canvas-web` | Frontend — this repo | Vercel |
| `thinking-canvas-api` | Backend — separate repo | Railway |

Independent repos, no shared packages. Both use **npm**. Contract types are
kept in sync by mirroring (see `.ai/skills/sync-contract-types.md`), not by a
shared workspace.

---

## Service Topology (frontend's view)

```
Browser (Next.js app — this repo)
  ├── Supabase (direct, anon key + RLS)
  │     ├── READS:  canvases, sessions, nodes, edges, session_learnings,
  │     │           observer_structures/edges, subscriptions
  │     ├── WRITES: canvases (insert-only), nodes, edges,
  │     │           sessions.current_phase, accepted ghost nodes (owner:'ai')
  │     └── AUTH:   anonymous sign-in → convert to permanent on signup
  │     ⚠ NO Realtime channels — ever.
  │
  ├── Backend API (Railway, Hono — NEXT_PUBLIC_API_URL)
  │     ├── POST /api/canvas-event      (notify after every Supabase write)
  │     ├── GET  /api/stream/:sessionId (SSE — the only server push)
  │     ├── POST /api/ghost-status
  │     ├── POST /api/session/start | /api/session/complete
  │     └── GET  /health
  │
  └── Stripe (portal/checkout links only — webhook is backend-owned)
```

The backend's CORS is pinned to exactly one origin (its `FRONTEND_URL` env var).
Local dev: frontend on `:3000`, backend on `:3001`.

---

## Environment Variables

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe. RLS is the security boundary. |
| `NEXT_PUBLIC_API_URL` | Backend base URL (Railway; `http://localhost:3001` locally) |

**Never** put the Supabase service role key, Stripe secret key, or any backend
secret in this repo — `NEXT_PUBLIC_*` vars ship to the browser.

---

## Auth Flow

```
Session 1 (anonymous): supabase.auth.signInAnonymously() — full canvas access, no friction
First Session Complete: "Create account to save and continue"
  → convert the anonymous user to permanent (updateUser email/password, or
    linkIdentity for Google OAuth) — SAME user id, so RLS rows carry over
    with no data migration
Session 2+: middleware.ts redirects unauthenticated users to /login
```

Auth methods: Google OAuth (primary) + email/password. All via Supabase Auth
(`@supabase/ssr` for the middleware/server side).

RLS model: `auth.uid() = user_id` on `canvases`, cascading to everything under
it. If a query returns empty when data clearly exists, suspect a missing/wrong
session token before suspecting the query.

---

## Billing (frontend responsibilities)

| Concern | Where it lives |
|---|---|
| Subscription state | `subscriptions` table (backend keeps it in sync with Stripe webhooks) |
| Tier gating of agents | Backend Orchestrator — server-side, always |
| Upgrade prompt | Frontend — shown when a Pro-only agent would have fired |
| Start a subscription | Stripe Payment Link / Checkout (see API-CONTRACT Known Gap #4) |
| Manage/cancel | Stripe Customer Portal link on `/settings` |

The frontend never computes entitlement — it renders what the `subscriptions`
row says and lets the backend enforce.

---

## Deployment

- **Vercel**, zero-config Next.js. Env vars set per environment (preview/prod).
- Preview deployments will fail SSE/API calls unless the backend's `FRONTEND_URL`
  CORS origin matches — test contract changes against local backend, not previews.
- No server-side secrets in this repo means no serverless functions with
  privileged access: anything privileged belongs in the backend repo.
