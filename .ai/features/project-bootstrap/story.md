---
feature: "project-bootstrap"
type: story
created: 2026-06-09
status: draft
---

## What
Replace the Create Next App scaffold with a Hono + TypeScript + Inngest backend — correct package.json deps, npm scripts, tsconfig, directory structure, and the empty Hono app entry point.

## Why
The repo was initialized with `create-next-app` but this is a Node.js API server (Hono), not a Next.js app. Nothing else can be built until the project scaffold is correct.

## Blast Radius
| Component | Impact |
|---|---|
| `package.json` | Replaced — all Next.js deps removed, backend deps installed |
| `tsconfig.json` | Replaced — Node.js target, no JSX |
| `src/app/` | Deleted — Next.js files removed |
| `src/index.ts` | Created — Hono app entry point |
| `.npmrc` | Keep if present — may pin registry |

## Files to Touch
```
DELETE:
  src/app/favicon.ico
  src/app/globals.css
  src/app/layout.tsx
  src/app/page.tsx
  app/favicon.ico  (if still present in root)
  app/globals.css
  app/layout.tsx
  app/page.tsx

REPLACE:
  package.json    → backend deps + scripts
  tsconfig.json   → Node.js config

CREATE:
  src/index.ts    → Hono app skeleton (no routes yet — just health check)
  .env.example    → all required env vars listed
```

## Supabase Migration
No — this story has no DB changes.

## Inngest Events
No new events — Inngest is installed but not wired to any functions yet.

## Risks
- `next.config.js` / `postcss.config.js` / `tailwind.config.ts` may exist — delete them too
- `.npmrc` file exists in repo — check its content before overwriting; it may pin the npm registry

## Task Breakdown
- **task-01:** Replace package.json + tsconfig.json, delete Next.js files, install backend deps
- **task-02:** Create src/index.ts (Hono skeleton) + .env.example
