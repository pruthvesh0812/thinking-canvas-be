# Implementation Order & Context Playbook — thinking-canvas-web

> Read this before starting ANY story. It answers two questions:
> **what to build next**, and **how to use the `.ai/` ecosystem so every story
> starts with full knowledge and zero wasted tokens.**

---

## Part 1 — The Build Order

Build strictly in this order. Each story's file lists its exact scope, files,
contract impact, and definition of done.

| # | Story | Delivers | Depends on | Context to load |
|---|---|---|---|---|
| 1 | `project-bootstrap` | Next.js skeleton, Tailwind, logger, env, route shells | — | ARCHITECTURE + CODING-STANDARDS |
| 2 | `contract-layer` | Mirrored types, Supabase client, typed api.ts | 1 | API-CONTRACT + sync/add-api-call skills |
| 3 | `canvas-core` | Nodes on canvas, write-then-notify loop live | 2 | CORE-CONCEPTS + CANVAS-RENDERING + STATE-MANAGEMENT |
| 4 | `edge-system` | 4 edge types, selector, routing flags, question pulse | 3 | CORE-CONCEPTS + CANVAS-RENDERING + STATE-MANAGEMENT |
| 5 | `ghost-streaming` | SSE hook, ghost store, ghosts appear + stream | 4 | CORE-CONCEPTS + GHOST-STREAMING + CANVAS-RENDERING |
| 6 | `ghost-interaction` | Accept/reject, rejection reasons, materialization | 5 ⚠gap#1 | CORE-CONCEPTS + GHOST-STREAMING + API-CONTRACT |
| 7 | `session-lifecycle` | North star capture, phase toggle, Session Complete, carry-forward | 6 | CORE-CONCEPTS + SESSION-FLOWS |
| 8 | `canvas-dashboard` | Multi-canvas home, create/open flow | 7 | CORE-CONCEPTS + SESSION-FLOWS |
| 9 | `auth` | Anonymous-first, conversion, session-2+ gate | 8 | ARCHITECTURE + SESSION-FLOWS |
| 10 | `billing-and-tiers` | Tier UI, UpgradePrompt, Stripe links | 9 ⚠gap#4 | ARCHITECTURE + API-CONTRACT |
| 11 | `observer-structure-ui` | Anchors, DAG reveal, per-edge consent | 7 ⚠gap#2 — **backend-blocked** | CORE-CONCEPTS + GHOST-STREAMING + API-CONTRACT |

### Why this order

- **1→2 before any UI:** the backend already exists — coding against its real
  contract from day one is the entire reason it was built first. Story 2 is
  cheap and de-risks everything after.
- **3→4→5→6 is the core value spine:** create → connect → ghost appears →
  human decides. Each story is independently demoable, and 5 is the first
  moment the product *feels* like the product.
- **7 before 8/9:** Session Complete is a dependency of the auth story's
  product design (the signup prompt fires after the first complete) and of the
  dashboard's open-canvas flow (carry-forward).
- **11 floats:** it depends only on story 7 plus backend work. Slot it wherever
  the backend gap closes — don't hold 8-10 for it.

### The milestone checkpoints

| After story | You can honestly demo |
|---|---|
| 3 | "I can think in nodes and it persists" |
| 6 | **The core thesis** — AI offers, human decides, canvas grows |
| 7 | A complete session arc with learning carried forward |
| 10 | A sellable product |

### Cross-repo gaps to watch (full detail: API-CONTRACT.md → Known Gaps)

| Gap | Blocks | Action |
|---|---|---|
| #1 thread_id/turn_index not on the stream | story 6's ghost-status call | coordinate backend enrichment of `done`/`spawn` **before starting story 6** |
| #2 no observer-edge-status route | story 11 | backend adds route + structure read path |
| #3 create-only canvas events | edit/delete fidelity (stories 3+) | backend intervention-spectrum task-06; frontend just leaves seam comments |
| #4 no checkout endpoint | story 10 | v1 = Stripe Payment Link |
| #5 accepted-ghost enrichment undecided | story 6 (quality, not blocking) | needs a backend decision; document in PR |
| #6 raw markers on one stream (context ghost only) | **story 5** — the ghost store must parse `[NODE_TYPE:]`/`[QUESTION]`/`[ARTICULATION]` and route the question text itself | build the parser now (GHOST-STREAMING → Content Delivery); a backend server-side split would later simplify it |
| #6b SSE closes after every `done` | story 5 (reconnect is normal; overlapping ghosts truncate) | tolerate reconnect-per-ghost; flag backend hold-open |
| #7 free tier still gets Outer-Sub on question edges | story 10 (UpgradePrompt logic) | don't gate the question-edge UI on tier until backend gates the pipeline |

---

## Part 2 — The Context Playbook

The `.ai/` ecosystem exists to eliminate two failure modes: **knowledge gaps**
(agent doesn't know the ghost protocol, invents one) and **token waste** (agent
loads six files to change a button). Use it like this:

### The per-task ritual

```
1. CLAUDE.md               → classify the task, read its row in the Load Table
2. Load ONLY those files   → they are scoped to be sufficient; trust the table
3. Story file              → .ai/features/<story>/story.md is the scope contract
4. Contract work?          → API-CONTRACT.md + verify against the backend repo
                             if anything smells stale (backend code outranks docs)
5. New library surface?    → fetch its llms.txt from .ai/refs/EXTERNAL-DOCS.md
                             BEFORE writing library-specific code
6. Repeatable task type?   → follow the matching .ai/skills/ file step by step
7. Implement               → CODING-STANDARDS.md non-negotiables apply to every line;
                             comment the contract seams and multi-phase functions
8. Verify the DoD          → the story's Definition of Done is the exit test,
                             end-to-end against a running local backend
```

### Rules that keep the ecosystem effective

- **Don't load speculatively.** The load table was written after the context
  files — it reflects what each file actually covers. Fixing a ghost animation
  does not need API-CONTRACT.md; adding an endpoint call does not need
  CANVAS-RENDERING.md.
- **The story is the scope.** If mid-implementation you discover work the story
  doesn't cover, that's a new story or a story amendment — not silent scope creep.
- **Docs are versioned truth — keep them true.** Every context file carries
  `last-verified` frontmatter. If you change something a context file
  describes (a store's shape, a flow, a protocol handler), update the file and
  its date **in the same PR**. A stale context file is worse than none — the
  next agent will trust it.
- **Gaps get flagged, never fudged.** When the backend contract is missing
  something (Known Gaps table), the move is: note it in the story PR, leave a
  contract-seam comment at the affected code, coordinate the backend change.
  Never invent an endpoint, an event, or a workaround protocol.
- **The backend repo is a context source too.** For any contract ambiguity,
  read `thinking-canvas-api`'s `types/index.ts` and `src/routes/` — five
  minutes there beats an hour of guessing. Then fix the doc that let you down.
- **One story, one branch, DoD before merge.** Branch naming per
  CODING-STANDARDS.md (`feature/<short-title>-<timestamp>` — never
  auto-generated names).

### When the architecture changes

Adopting/replacing a library, changing a flow or protocol handler, adding a
store, or adding/removing a non-negotiable ⇒ update the affected
`.ai/context/` file(s) + CLAUDE.md's tables in the same PR. New repeatable
task pattern ⇒ add a `.ai/skills/` file. This mirrors the backend repo's
`update-ai-context` discipline.
