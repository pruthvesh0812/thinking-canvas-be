---
feature: "text-context-capture"
type: story
created: 2026-10-16
status: in-progress — schema, RPC, config, types and docs built (rev 3); agent consumption, the "?" and live updates deliberately deferred
git_branch: "feature/pivot-text-context-capture-2026-10-16T1703"
source: "Text-Only Context Capture — Requirements (Oct 16, 2026, @Pruthvesh) · frontend: thinking-canvas-frontend .ai/features/text-context-capture/ (schema.md rev 3, backend-requirements.md, frontend-requirements.md)"
---

## What
The backend half of the frontend's text-only context capture: tables for user notes, their links and attachments, a stable node number, edge labels, removal reasons, a settings table — plus, in the same change, removal of the Intervention Spectrum so the product no longer carries it.

## Why
Product pivot: typing users had no place to put the "why" behind a node, so agents saw only labels. Voice and text are meant to share one context store. The Intervention Spectrum (judge → offer → consent timer) is no longer part of the product, as of now, and its schema and code were in the way.

## Blast Radius
- **Removed (migration `20261016000001`, destructive):** `intervention_offers`, `sessions.latest_seq`/`receptivity*`, `canvases.canvas_version`, `allocate_session_seq`, the fingerprint triggers — and the intervention route, offer streaming, judge, intervention/impact pipelines, `waiting`/`offer`/`withdraw`, `.ai/context/intervention-layer/`. `canvas-event` still *accepts* delete / set-aside / restore events but only acknowledges them.
- **Added (`20261016000002`, then reconciled to rev 3 by `20261017000001`):** `context_entries`, `context_links`, `context_attachments`, `component_removals`, `system_config`, `nodes.seq` + `canvases.next_node_seq`, `edges.label`, the RPC `create_context_entry`, shared types in `types/index.ts`.
- **Migrations are additive on purpose:** `20261017000001_context_capture_rev3.sql` is a NEW file rather than an edit of `20261016000002_context_capture.sql`, so it is safe whether or not the earlier one was ever applied; it also migrates any rows the earlier one created. If `20261016000002` is confirmed never applied anywhere, the two can be squashed before merge.

## Status against the frontend's requirements (their numbering)
| # | Requirement | Status |
|---|---|---|
| B1 | `context_entries` | **Done** — client id, soft delete, `content` nullable for attachments, hard ceiling 3000 + live limit from `system_config` (trigger, insert + edit) |
| B2 | `context_links` | **Done** — `target_type`, `origin_status` OWNED/MOVED (`shortcut` dropped), `canvas_id` + `updated_at`, composite FK to the entry, partial unique active-link index, trigger retiring links when a node/edge row is deleted |
| B3 | `nodes.seq` | **Done** — trigger + monotonic counter, backfilled; hardened vs the sketch in `schema.md` (an upsert of an existing node neither renumbers it nor burns a number; a client-supplied value is ignored; renumbering raises) |
| B4 | `component_removals` | **Done** — with `component_label` snapshot and `created_by`; insert + select only |
| B5 | `context_attachments` | **Table done** — one file per entry, clients insert `pending` only and can't update. **No bucket, no scan** (decided later) |
| B6 | RPCs + notify events | **Half**: `create_context_entry` built. **No** `delete_/restore_context_entry` (note delete = set `deleted_at`, links untouched) and **no notify events** (agents read live; live updates are out) |
| B7 | `system_config` | **Done** — seeded, read-only for clients |
| B8 | "?" on edges (`edges.clarification_*`, SSE) | **Deferred** — the rule will be an LLM call; revisit with the LLM work |
| B9 | Undo | No backend work — in-memory on the frontend; RLS allows the updates |
| B11 | Live updates (SSE) | **Not for v1** (decided) |
| B12 | Agents read notes / `agent_context` view | **Deferred** — to be discussed with the agent redesign. The view must be `security_invoker` (or revoke grants) |
| B13 | `edges.label` | **Done** (≤80 chars). Not yet shown to agents |
| — | Auth on `/api` routes | **Separate story** |

## Where the frontend must differ from its own rev 3 docs
(Full hand-off with the recommended build order: [`frontend-handoff.md`](./frontend-handoff.md).)

1. **Note delete/restore:** write only `context_entries.deleted_at` — don't flip links; `restoreEntry` needs no live-target list. There are no `delete_/restore_context_entry` RPCs.
2. **`create_context_entry`:** `p_links` is a JSON array (`jsonb`), not `jsonb[]`; needs ≥1 link; types are `CreateContextEntryArgs`.
3. **No `canvas-event` notify for any context write**, and no `context.*` event types exist.
4. **No `edges.clarification_*` column and no `edge_clarification` / `context_changed` SSE message** — keep the local stand-in for the "?" and the `storage`-event tab sync.
5. **Note length:** the DB enforces `system_config` `context.note_max_chars` and fails with `23514` — handle it as "keep the draft, show the message".
6. **No client hard-delete** of entries/links/attachments; attachments inserted by clients must be `pending`.
7. **Replace the `nodes.seq` trigger sketch in `schema.md` §2.4** with the hardened one in `20261016000002_context_capture.sql`.

## Verification
`tsc --noEmit` clean; `vitest` 9/9. Migrations applied over the full existing chain on a scratch Postgres 16 (stubs for `auth.*` and pgvector), including the path "`20261016000002` applied with data, then `20261017000001`", and exercised with assertions: seq rules, entry/link/attachment constraints, the live length limit (raise, lower, garbage value), in-place move, note delete/restore leaving links alone, node/edge delete retiring links, `create_context_entry` (atomic, idempotent retry, completes a half-finished write, rejects leave nothing behind, refuses another user's id), RLS (no client deletes, can't self-clean a file, config read-only, two-user isolation), canvas cascade. **Not covered:** pgvector, real Supabase roles, PostgREST's own request handling (e.g. how it passes a JSON array to the RPC). `database.types.ts` was hand-edited — regenerate when convenient.

## Left behind on purpose
Attunement, `sessions.current_phase` + `updatePhase()` (no caller), `lib/tier.ts`, the Expander and Stress-Tester agents (no trigger — `node.created` still sends `canvas/node.created`, which nothing subscribes to), and the model tables that still list an Orchestrator. The `branching` and `session-branching` stories still reference intervention concepts.

## Open Questions
1. Agent side: what drives agents and how they read notes (B12), eager vs lazy rolling summary, the `agent_context` view.
2. The "?" on edges — LLM-decided; which edge types, what signal.
3. Attachments: bucket name/path convention, scan mechanism, size/type limits (`attachment.*` keys not seeded yet).
4. Auth for `/api` routes (own story) — more pressing once anything on those routes triggers scans or relays.
