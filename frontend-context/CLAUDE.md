# ThinkingCanvas Web — Agent Navigation Index

> **This is the FRONTEND repo only.**
> Backend (thinking-canvas-api) is a separate repository deployed on Railway.
> Read this file first on every task. Load only the context files listed for your task type.

---

## What ThinkingCanvas Web Does

The canvas where a human thinks in nodes and edges. It renders the directed
graph (React Flow), writes user-created nodes/edges **directly to Supabase**,
notifies the backend of each canvas event, and listens on a single SSE stream
for ghost node pairs — the only thing the server ever pushes. Ghosts float
translucent above the canvas until the human accepts or rejects them. Nothing
crosses into the real canvas without a deliberate human action.

---

## Four Working Rules

1. **Think First** — Read relevant context files before writing any code.
2. **Simplicity** — Write the minimum code that satisfies the requirement.
3. **Surgical** — Change only what the task requires.
4. **Goal-Driven** — Every line must trace back to the task.

---

## Task Classification & Context Load Table

| Task | Load these files |
|---|---|
| Any canvas work (nodes/edges/React Flow) | `CORE-CONCEPTS.md` + `CANVAS-RENDERING.md` |
| Ghost nodes / SSE / streaming / accept-reject | `CORE-CONCEPTS.md` + `GHOST-STREAMING.md` |
| Calling the backend / payload shapes / endpoints | `API-CONTRACT.md` |
| Zustand stores / data flow / Supabase writes | `STATE-MANAGEMENT.md` |
| North star / session start / Session Complete / phase toggle | `CORE-CONCEPTS.md` + `SESSION-FLOWS.md` |
| Multi-canvas dashboard / canvas switching | `CORE-CONCEPTS.md` + `SESSION-FLOWS.md` |
| Auth / anonymous sessions / signup gate | `ARCHITECTURE.md` + `SESSION-FLOWS.md` |
| Billing / tiers / upgrade prompt | `ARCHITECTURE.md` |
| Deployment / env vars / service topology | `ARCHITECTURE.md` |
| Observer structure UI (anchors, per-edge accept) | `CORE-CONCEPTS.md` + `GHOST-STREAMING.md` |
| Coding conventions / comments / prohibited patterns | `CODING-STANDARDS.md` |
| New React Flow node or edge component | `CANVAS-RENDERING.md` + `.ai/skills/create-react-flow-node.md` |
| New Zustand store | `STATE-MANAGEMENT.md` + `.ai/skills/create-zustand-store.md` |
| New backend API call | `API-CONTRACT.md` + `.ai/skills/add-api-call.md` |
| Backend contract changed / types out of date | `.ai/skills/sync-contract-types.md` |
| External library question | `.ai/refs/EXTERNAL-DOCS.md` |
| What to build next / story order | `IMPLEMENTATION-ORDER.md` |

---

## Repo Structure

```
thinking-canvas-web/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx                # canvas dashboard (list + create canvas)
│   │   ├── canvas/
│   │   │   ├── new/page.tsx        # north star capture (original_intent, write-once)
│   │   │   └── [canvasId]/page.tsx # the canvas itself
│   │   ├── login/page.tsx
│   │   └── settings/page.tsx       # account + Stripe portal link
│   ├── components/
│   │   ├── canvas/
│   │   │   ├── Canvas.tsx          # React Flow wrapper — nodeTypes/edgeTypes registration
│   │   │   ├── NorthStarHeader.tsx # original_intent, always visible, never editable
│   │   │   ├── EdgeTypeSelector.tsx# logical | doubt | question on connect
│   │   │   ├── DebounceIndicator.tsx# pulsing dot while backend debounce window is open
│   │   │   ├── nodes/
│   │   │   │   └── HumanNode.tsx   # editable text, edge handles
│   │   │   └── edges/
│   │   │       ├── LogicalEdge.tsx
│   │   │       ├── DoubtEdge.tsx
│   │   │       ├── QuestionEdge.tsx# pulsing — signals Outer Subconscious may fire
│   │   │       └── GhostEdge.tsx   # dotted — connects ghosts to canvas
│   │   ├── ghost/
│   │   │   ├── GhostContextNode.tsx# 40-50% opacity, dashed border, role icon
│   │   │   ├── GhostQuestionNode.tsx
│   │   │   ├── GhostControls.tsx   # per-node accept / reject
│   │   │   └── RejectionReasonSelector.tsx
│   │   ├── observer/
│   │   │   ├── AnchorHighlight.tsx # Observer-highlighted existing nodes
│   │   │   ├── StructureOverlay.tsx# hover-revealed observation DAG
│   │   │   └── EdgeFeedbackSelector.tsx # not_related | wrong_direction | ...
│   │   ├── session/
│   │   │   ├── PhaseToggle.tsx     # diverging / converging manual override
│   │   │   ├── SessionCompleteModal.tsx # 3-screen flow
│   │   │   ├── ObserverSuggestions.tsx  # screen 1
│   │   │   └── UnresolvedThreads.tsx    # screen 2
│   │   └── ui/
│   │       └── UpgradePrompt.tsx   # shown when a Pro-only agent would have fired
│   ├── stores/                     # Zustand — one store per concern
│   │   ├── canvas-store.ts         # nodes, edges (the real graph)
│   │   ├── ghost-store.ts          # pending ghost pairs keyed by trigger node
│   │   ├── observer-store.ts       # observer structures + per-edge status
│   │   └── session-store.ts        # active session, phase, canvas meta
│   ├── hooks/
│   │   ├── use-ghost-stream.ts     # EventSource lifecycle + message dispatch
│   │   ├── use-canvas-persistence.ts # Supabase writes + POST /api/canvas-event notify
│   │   └── use-debounce-indicator.ts
│   ├── lib/
│   │   ├── supabase.ts             # browser client (anon key — RLS is the boundary)
│   │   ├── api.ts                  # typed fetch wrappers for every backend endpoint
│   │   └── logger.ts               # structured logging — never console.log directly
│   └── middleware.ts               # auth gate: session 2+ requires an account
├── types/
│   └── index.ts                    # MIRRORED from backend types/index.ts — never edited by hand
├── .ai/
│   ├── context/
│   ├── refs/
│   ├── skills/
│   └── features/
├── CLAUDE.md                       # This file
├── IMPLEMENTATION-ORDER.md         # Story order + context playbook
├── package.json                    # npm — not pnpm
└── tsconfig.json
```

---

## How to Find Things

| I want to... | Look in... |
|---|---|
| Add/modify a canvas node or edge component | `src/components/canvas/` |
| Change ghost node appearance or behaviour | `src/components/ghost/` |
| Change how SSE messages are handled | `src/hooks/use-ghost-stream.ts` |
| Change how nodes/edges persist | `src/hooks/use-canvas-persistence.ts` |
| Add/modify a backend call | `src/lib/api.ts` |
| Modify canvas state shape | `src/stores/canvas-store.ts` |
| Modify ghost pair state | `src/stores/ghost-store.ts` |
| Understand a backend payload | `types/index.ts` + `.ai/context/API-CONTRACT.md` |
| Session Complete flow | `src/components/session/` |
| Auth gate logic | `src/middleware.ts` + `src/lib/supabase.ts` |
| What the backend expects of the frontend | `.ai/context/API-CONTRACT.md` |

---

## Naming Conventions

| Layer | Pattern | Example |
|---|---|---|
| Components | PascalCase `.tsx` | `GhostContextNode.tsx` |
| Hooks | `use-` kebab-case file, `useCamelCase` export | `use-ghost-stream.ts` → `useGhostStream` |
| Zustand stores | kebab-case `-store.ts`, `useXStore` export | `canvas-store.ts` → `useCanvasStore` |
| TypeScript types | PascalCase — mirrored from backend | `SpawnDescriptor`, `GhostPair` |
| React Flow node types | camelCase string keys | `humanNode`, `ghostContext`, `ghostQuestion` |
| React Flow edge types | camelCase string keys | `logicalEdge`, `questionEdge`, `ghostEdge` |
| SSE message types | string literal — same as backend | `spawn` \| `chunk` \| `done` \| `ping` |
| Supabase tables | snake_case plural — owned by backend repo | `canvases`, `nodes`, `edges` |
| Git branches | `<type>/<short-title>-<timestamp>` | `feature/ghost-streaming-hook-2026-07-05T1430` |

> Branch naming — full spec in `CODING-STANDARDS.md`. Never use randomly generated branch names.

---

## Non-Negotiables (every task)

1. **Write-then-notify** — user nodes/edges are written directly to Supabase, THEN the backend is notified via `POST /api/canvas-event` with IDs only. Never send node content to the backend; never skip the notify.
2. **No Supabase Realtime** — never call `supabase.channel()`. The SSE stream is the only server push.
3. **Ghost structure comes from the SpawnDescriptor** — never invent ghost layout. Content arrives only via `chunk` messages targeted by `ghost_id`.
4. **One ghost pair per real node** — a new spawn for the same trigger node replaces the pending pair.
5. **Never auto-accept ghosts** — every acceptance is a deliberate click. Appreciation nodes are the sole exception: full opacity, no reject button, acknowledge only.
6. **`original_intent` is write-once** — captured at canvas creation, never editable again, always visible in the north star header.
7. **`types/index.ts` is mirrored from the backend** — never define contract types locally, never edit the mirror by hand (see `.ai/skills/sync-contract-types.md`).
8. **Tier enforcement is server-side** — the frontend only shows/hides UI (UpgradePrompt). Never gate logic on a client-side tier check alone.
9. **Anon key only in the browser** — never the service role key. RLS is the security boundary.
10. **Unknown SSE message types are ignored gracefully** — the protocol will grow (intervention-spectrum adds `waiting`/`offer`/`withdraw`). Never throw on an unrecognized `type`.
11. **Every hook, store, and API call logs via `logger`** from `src/lib/logger.ts` — never `console.log` directly.
12. **npm only** — no pnpm, yarn, or bun.

---

## Key Commands

```bash
npm run dev          # Start Next.js dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run tests
```

Backend dev server runs at `localhost:3001` (separate repo — `thinking-canvas-api`).

---

## Architecture Quick Reference

| Concern | Solution |
|---|---|
| Canvas rendering | React Flow (@xyflow/react) — custom node + edge types |
| Client state | Zustand — one store per concern |
| Canvas persistence | Frontend → Supabase direct writes (anon key + RLS) |
| Backend notification | `POST /api/canvas-event` with row IDs only |
| Ghost node delivery | SSE `GET /api/stream/:sessionId` — spawn → chunk → done |
| Ghost accept/reject | `POST /api/ghost-status` + frontend materializes accepted nodes |
| Auth | Supabase Auth — anonymous first, convert to permanent on signup |
| Payments | Stripe (backend owns the webhook; frontend links to portal) |
| Styling | Tailwind CSS |
| Deployment | Vercel |

---

## Current Build Status

**Implementation not yet started.** Build strictly in the order defined in
`IMPLEMENTATION-ORDER.md` — each story lists its dependencies and exactly which
context files to load. Feature stories live in `.ai/features/<name>/story.md`.

---

## Skills Reference

| Skill | File | Load when |
|---|---|---|
| Create React Flow node/edge | `.ai/skills/create-react-flow-node.md` | Adding any visual node or edge type |
| Create Zustand store | `.ai/skills/create-zustand-store.md` | Adding any store in `src/stores/` |
| Add backend API call | `.ai/skills/add-api-call.md` | Adding any call in `src/lib/api.ts` |
| Sync contract types | `.ai/skills/sync-contract-types.md` | Backend types changed / starting contract work |
