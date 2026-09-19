---
feature: "project-bootstrap"
type: story
created: 2026-07-05
status: draft
git_branch: "[set at implementation: feature/project-bootstrap-<timestamp>]"
---

## What
A running Next.js App Router skeleton with every foundation piece the later
stories assume: Tailwind, React Flow + Zustand installed, `lib/logger.ts`,
env plumbing, and the route shells.

## Why
Every subsequent story assumes this exact repo shape (see CLAUDE.md → Repo
Structure). Do not skip pieces to ship faster — a missing logger or env var
slows every story after.

## Context to Load
`ARCHITECTURE.md` + `CODING-STANDARDS.md`

## Depends On
none — first story.

## Blast Radius
Whole repo (greenfield).

## Files to Touch
```
CREATE:
  package.json (npm; next, react, @xyflow/react, zustand, @supabase/supabase-js,
                @supabase/ssr, tailwindcss)
  src/app/layout.tsx, src/app/page.tsx (placeholder dashboard)
  src/app/canvas/new/page.tsx, src/app/canvas/[canvasId]/page.tsx (shells)
  src/app/login/page.tsx, src/app/settings/page.tsx (shells)
  src/lib/logger.ts          (structured wrapper — bans raw console.log)
  .env.example               (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / _API_URL)
  tsconfig.json ('@/' path alias), .gitignore
COPY IN:
  CLAUDE.md, IMPLEMENTATION-ORDER.md, .ai/  (this context package)
```

## Contract Impact
None yet — but verify `GET {NEXT_PUBLIC_API_URL}/health` responds from local
dev as the exit smoke test.

## Risks
- React Flow + Next.js SSR: canvas pages must be client components; verify no
  hydration warnings with an empty `<ReactFlow>` mounted.

## Definition of Done
`npm run dev` serves all route shells without errors; an empty React Flow
canvas renders on `/canvas/test`; `logger.info` outputs structured JSON;
`/health` smoke test documented in README.

## Task Breakdown
NONE — implement directly from this story.
