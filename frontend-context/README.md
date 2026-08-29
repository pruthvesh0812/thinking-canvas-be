# Frontend AI Context — Transplant Package

This directory is the complete AI context ecosystem for **thinking-canvas-web**
(the frontend repo). It was authored inside the backend repo because the
frontend repo did not exist yet — the backend is the source of truth for the
API contract, and this package was written against the backend's actual
implemented routes, types, and streaming protocol (not the older design docs).

## How to use this package

1. Create the `thinking-canvas-web` repo (Next.js App Router + TypeScript).
2. Copy the **contents** of this directory into the frontend repo root:

```
thinking-canvas-web/
├── CLAUDE.md                  ← from here
├── IMPLEMENTATION-ORDER.md    ← from here
└── .ai/                       ← from here (context/ refs/ skills/ features/)
```

3. Delete this `frontend-context/` directory from the backend repo once
   transplanted (or keep it until the frontend repo is bootstrapped).

## What's inside

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Frontend navigation index — agents read this first, every task |
| `IMPLEMENTATION-ORDER.md` | Build order for all stories + the context-usage playbook |
| `.ai/context/` | Task-scoped context files (load per the CLAUDE.md table) |
| `.ai/refs/EXTERNAL-DOCS.md` | Library docs + llms.txt URLs |
| `.ai/skills/` | Step-by-step guides for repeatable frontend task types |
| `.ai/features/` | One story per feature, in implementation order |

## Verification provenance

Contract facts (endpoints, payloads, SSE message shapes, known gaps) were
verified against the backend repo at the commit this package was authored on —
see the `verified-against` frontmatter in each context file. When the backend
contract changes, re-sync via `.ai/skills/sync-contract-types.md`.
