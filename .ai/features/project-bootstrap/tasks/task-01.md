---
feature: "project-bootstrap"
type: task
task_id: task-01
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Replace package.json with backend dependencies, replace tsconfig.json for Node.js, and delete all Next.js scaffold files.

## Files to Touch
```
REPLACE:
  package.json    → remove next/react/tailwind, add Hono/Mastra/Inngest/etc.
  tsconfig.json   → Node.js ESM target, no JSX

DELETE:
  src/app/favicon.ico
  src/app/globals.css
  src/app/layout.tsx
  src/app/page.tsx
  app/favicon.ico      (if present — from git tracked deletions)
  app/globals.css
  app/layout.tsx
  app/page.tsx
  next.config.*        (if present)
  postcss.config.*     (if present)
  tailwind.config.*    (if present)
```

## Target package.json

```json
{
  "name": "thinking-canvas-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "migrate": "supabase db push",
    "gen:types": "supabase gen types typescript --local > src/db/database.types.ts",
    "inngest:dev": "npx inngest-cli@latest dev"
  },
  "dependencies": {
    "@ai-sdk/google": "latest",
    "@mastra/core": "latest",
    "@upstash/redis": "latest",
    "@supabase/supabase-js": "latest",
    "hono": "latest",
    "inngest": "latest",
    "stripe": "latest",
    "zod": "latest",
    "langfuse": "latest"
  },
  "devDependencies": {
    "tsx": "latest",
    "typescript": "^5",
    "vitest": "latest",
    "@types/node": "^20"
  }
}
```

## Target tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "types"],
  "exclude": ["node_modules", "dist"]
}
```

## Depends On
None — this is the first task.

## Definition of Done
- [ ] `npm install` completes without errors
- [ ] No Next.js files remain in src/ or app/
- [ ] `npm run build` compiles (even with empty src/index.ts placeholder)
- [ ] `package.json` has all backend deps listed above
