---
last-verified: 2026-07-05
stale-after-days: 60
---

# Skill: Sync Contract Types from the Backend

> Run this when: starting any story that touches the backend contract, when a
> backend change is announced, or when `types/index.ts` disagrees with observed
> backend behaviour.

---

## Why mirroring (not a shared package)

The two repos deploy independently (Vercel / Railway) with no shared workspace
— a deliberate decision (see backend ARCHITECTURE.md). The cost is drift risk;
this skill is the discipline that keeps the mirror honest.

---

## Procedure

1. **Fetch the backend's `types/index.ts`** (repo: `thinking-canvas-api`,
   `main` branch).
2. **Copy it verbatim** into this repo's `types/index.ts`, replacing the file.
   - Exception: this repo does not ship `zod` runtime validation in MVP. Keep
     the Zod schemas ONLY if `zod` is already a dependency; otherwise strip the
     schema exports and keep the inferred types as hand-expanded `type`
     declarations that match them exactly.
3. **Update the provenance header** at the top of the file:

```typescript
// MIRRORED from thinking-canvas-api/types/index.ts
// source commit: <backend commit sha>   synced: <date>
// Do not edit by hand — re-run .ai/skills/sync-contract-types.md
```

4. **Compile** (`npm run build`). Every new compile error is a real contract
   change — fix call sites deliberately, don't cast them quiet.
5. **Diff-check API-CONTRACT.md** — if endpoints, message types, or payloads
   changed, update `.ai/context/API-CONTRACT.md` (including the Known Gaps
   table: gaps get closed, new ones get added) and bump its `last-verified`.
6. **Frontend-only types stay out** — UI state types (`GhostPairState`, store
   interfaces) live beside their stores/components, never in the mirror file.

---

## Red flags that mean "stop and talk cross-repo"

- A mirrored type would force the frontend to violate a non-negotiable
  (e.g. a new field only obtainable via Realtime).
- The backend added an SSE message type the dispatcher doesn't handle — add a
  handler or an explicit documented ignore, never silence.
- A Known Gap in API-CONTRACT.md was closed backend-side — schedule the
  frontend story that was blocked on it.
