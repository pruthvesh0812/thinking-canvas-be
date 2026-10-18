---
feature: "text-context-capture"
type: frontend-handoff
created: 2026-10-17
for: thinking-canvas-frontend (branch ccr-dffed412-k09857, or branch from it)
backend_branch: "thinking-canvas-be → feature/pivot-text-context-capture-2026-10-16T1703 (not merged to main yet)"
status: backend P0 + P1 data layer is BUILT; this tells you what to start with and where it differs from your rev 3 docs
supersedes: "frontend-requirements.md Phases 2–3 wherever they disagree with this file"
---

# Frontend handoff — the context-capture backend is built

## TL;DR — start here
1. **Do Phase A now** (it needs no database): align your `localStorage` stand-in to rev 3 **as the backend actually built it** — five corrections below, most importantly: *deleting/restoring a note touches only `deleted_at`*.
2. **Get a database that has the schema** (Phase B0) — someone must apply three backend migrations; one is destructive. Do it locally first.
3. **Mirror the types, then swap the repository** to Supabase (Phase B). That is the real finish line for v1.
4. Then the small P1 items that are ready: `system_config`, `component_removals`, edge `label`, `seq` from the DB (Phase C).
5. **Leave alone** (deliberately not built yet): the backend-decided "?" on edges, live updates over SSE, attachments upload/scan, agents reading notes. See "Do NOT build".

## Read first
In **thinking-canvas-be**, on the branch above (fetch it; it is not on `main`):
1. `.ai/features/text-context-capture/story.md` — what was built, what was cut, and the 7 places the backend differs from your docs.
2. `.ai/context/FRONTEND-CONTRACT.md` **§3.4** — the write rules, action by action (canonical).
3. `.ai/context/DATABASE-SCHEMA.md` §13–17 — every column and constraint.
4. `.ai/context/CONTEXT-CAPTURE.md` — the model and the visibility rule.
5. `types/index.ts` — the shared types you mirror (`ContextEntry`, `ContextLink`, `CreateContextEntryArgs`, …).

---

## What the backend now provides
| Thing | State |
|---|---|
| `context_entries`, `context_links` | Built. You write them directly (RLS = canvas owner). |
| `create_context_entry` (Postgres function, `supabase.rpc`) | Built — the one atomic write for a note + its links (+ a file row). |
| `nodes.seq` (+ `canvases.next_node_seq`) | Built. DB-assigned `n1, n2…`; never reused or renumbered. Backfilled for old nodes. |
| `component_removals` | Built. Insert + select only. |
| `system_config` | Built and seeded (8 keys). Read-only for you. |
| `edges.label` | Built (≤ 80 chars). You write it. |
| `context_attachments` | **Table only** — no storage bucket, no safety scan. |
| Agents reading notes | **Not built.** Notes are stored and shown to the user only. |

No `canvas-event` notify exists for any of this. **Nothing context-related goes through `POST /api/canvas-event`.**

---

## Where the backend differs from your rev 3 docs (read this twice)
1. **Note delete/restore = `deleted_at` only.** Don't flip links on delete; `restoreEntry` needs no live-target list. There are **no** `delete_context_entry` / `restore_context_entry` functions.
2. **`create_context_entry` takes `p_links` as a JSON array** (`jsonb`), not `jsonb[]`, and requires **≥ 1 link**.
3. **No `context.*` notify events** and no `canvas-event` changes. Don't add `canvasEvent` wrappers for context.
4. **No `edges.clarification_status`, no `edge_clarification` / `context_changed` SSE messages.** The "?" will be decided by an LLM call later — keep your local stand-in exactly as it is.
5. **Note length is enforced by the database** from `system_config` → `context.note_max_chars` (default 1000; hard ceiling 3000). Over the limit → Postgres error `23514`.
6. **You cannot hard-delete** entries, links or attachments (no RLS policy); attachments you insert must be `pending` and can't be updated.
7. **Your `schema.md` §2.4 `nodes.seq` trigger sketch is superseded** by the hardened one in the backend migration (an upsert of an existing node keeps its number and burns none; a number you send is ignored).

Also decided: link origin is `OWNED | MOVED` only (no `shortcut`); the audit log stays dropped.

---

## Phase A — align the stand-in (no database needed) — START HERE
Follow your own `frontend-requirements.md` Phase 1 list, **with these changes**:

| Your Phase 1 item | Do instead |
|---|---|
| `deleteEntry`: `deleted_at` **and** links → `deleted` | **`deleted_at` only.** |
| `restoreEntry(entryId, liveTargetIds)` reactivates links | **Clear `deleted_at` only.** No `liveTargetIds`. |
| Replace `dismissedEdgePrompts`/`edgePromptQueue` with `clarificationByEdge` + `setEdgeClarification` | **Skip.** Leave the local "?" logic as it is today. |
| `saveNote` always `OWNED`; drop `viaShortcut` | Keep as planned. |
| `moveNote` updates the link in place, `origin_status='MOVED'` | Keep. If the entry already has an active link on the destination, set the moved link `state='deleted'` instead (the DB would reject a duplicate with `23505`). |
| `markTargetLinksDeleted` stand-in for the trigger | Keep (the DB trigger does it for real in Phase B). |
| `ComponentRemoval` row | Keep, with `component_label`. |
| `ContextEntry.content: string \| null`, `ContextAttachment` type-only | Keep. |
| Re-key settings to `context.*` / `edge.*`, add `loadSystemConfig()` | Keep (Phase C fills it). |

Rename in code: `target_kind`→`target_type`, `origin`→`origin_status`; links gain `canvas_id` and `updated_at`.

**Done when:** `npx tsc --noEmit` and `npm run lint` clean; no `target_kind`, `origin:`, `logDecision`, `setEntryLinks` left under `src/`; `test.md` updated (product owner tests — don't test on your own).

---

## Phase B0 — a database that has the schema (needs the backend owner)
Three migrations on the backend branch, in order:
1. `20261016000001_drop_intervention_layer.sql` — **destructive** (drops the intervention tables/columns).
2. `20261016000002_context_capture.sql`
3. `20261017000001_context_capture_rev3.sql`

Apply them to a **local** Supabase first (`npm run migrate:local` in thinking-canvas-be), not the shared project. Don't point real persistence at a project until the owner has applied them. If you already see a `context_entries` table, check `supabase migration list` — only the third may be missing.

## Phase B — mirror types, swap the repository
1. **Mirror types:** run `.ai/skills/sync-contract-types.md` against the backend branch.
   - **Added:** `ContextSource`, `ContextTargetType`, `ContextOriginStatus`, `ContextLinkState`, `ContextEntry`, `ContextLink`, `ContextAttachment`, `AttachmentScanStatus`, `ComponentRemoval`, `SystemConfigRow`, `CreateContextEntryArgs`; `Node.seq`, `Canvas.next_node_seq`, `Edge.label`.
   - **Removed:** `InterventionOffer`, `InterventionStatus`, `InterventionDirectness`, the `waiting`/`offer`/`withdraw` members of `RedisMessage`, `Canvas.canvas_version`, `Session.latest_seq`/`receptivity`/`receptivity_updated_at`. (`JudgeMapNode` was renamed `ContentMapNode`; backend-internal.)
   - Your `types/database.types.ts` mirror also drops `intervention_offers` and gains the new tables.
   - Then delete `src/lib/context-contract.ts`. Only `types/index.ts` references the removed intervention types in your `src/`, so nothing else should break.
2. **Supabase repository** behind the same interface (keep the `localStorage` one for mock mode). Calls below.
3. **Hydration** (`use-canvas-hydration.ts`) and **node numbers** — below.

### The writes, action by action
```ts
// Save a note — also /all (many links), the canvas bar (one canvas link), an edge note
const { data: entry, error } = await supabase.rpc('create_context_entry', {
  p_entry: { id: entryId, canvas_id, session_id, source: 'typed', content },
  p_links: [{ id: linkId, target_type: 'node', target_id: nodeId }],   // origin_status defaults to 'OWNED'
})
// canvas note: { id, target_type: 'canvas' }  (no target_id)      /all: one link per node

// Edit
await supabase.from('context_entries').update({ content }).eq('id', entryId)

// Delete a note / undo — ONLY this column, never the links
await supabase.from('context_entries').update({ deleted_at: new Date().toISOString() }).eq('id', entryId)
await supabase.from('context_entries').update({ deleted_at: null }).eq('id', entryId)

// Move a note / undo (in place)
await supabase.from('context_links').update({ target_id: newId, origin_status: 'MOVED' }).eq('id', linkId)
// undo: update back to the previous target_id + origin_status.   On 23505 → set that link { state: 'deleted' } instead.

// "Why remove this?"
await supabase.from('component_removals').insert({ canvas_id, session_id, component_type: 'node', component_id, component_label: 'n4 · Pricing', reason })

// Edge label
await supabase.from('edges').update({ label }).eq('id', edgeId)

// Settings (once, on canvas load)
const { data } = await supabase.from('system_config').select('key, value')
```
- **Generate the uuids yourself** (entry and each link). A retry with the same ids **completes** a half-finished write and never duplicates. The retry returns the *stored* entry — it does **not** apply changed text, so don't change `content` between retries of the same create (use an edit instead).
- Don't send `author_id` (defaults to the signed-in user) or `created_at`/`updated_at`.
- Content is stored exactly as sent (never trimmed or rewritten).

### The reads (hydration)
Two flat queries — links carry `canvas_id` precisely so you don't need a join:
```ts
const entries = await supabase.from('context_entries').select('*').eq('canvas_id', canvasId).is('deleted_at', null)
const links   = await supabase.from('context_links').select('*').eq('canvas_id', canvasId).eq('state', 'active')
// then keep only links whose entry_id is in `entries`
```
- **A note is visible only through an active link, and only while its entry has `deleted_at = null`.** A deleted note still has *active* links, so you must drop links whose entry isn't in the non-deleted set. Badge counts and the panel list must both come from this same join.
- PostgREST returns at most 1000 rows per request by default; page with `.range()` if a canvas could exceed it.
- Add `seq` to the node select if you list columns explicitly (a `*` select already has it).

### Node numbers (`nodes.seq`)
- **Never send `seq`** — any value is discarded. Read it back: `supabase.from('nodes').upsert(row).select('id, seq')` (same for `.insert`). Your edit path is an upsert: re-saving an existing node returns its **existing** number.
- Ghost-accepted AI nodes get a number too. Duplicated nodes get a **new** one.
- Remove the browser-side assigner for real canvases (keep it for mock mode).

### Errors to handle
| Code | Means | Do |
|---|---|---|
| `23514` | Note over the limit (`note is longer than N characters`), or a bad create (`an entry needs at least one link`, blank text) | Keep the draft; show the message |
| `23505` | Duplicate active link (move onto a target the entry already has), or a second file on one entry | For a move: mark the moved link deleted |
| `42501` | An insert / `create_context_entry` was refused by RLS — the canvas or entry id isn't yours | A bug on your side; log it |
| `P0001` | You changed `canvas_id`, `source` or `seq` | A bug on your side |

**Silent no-ops:** an `UPDATE` or `DELETE` that RLS hides does **not** error — it changes 0 rows and returns success. That includes any attempted hard-delete of an entry, link or attachment (nothing is deleted). Add `.select()` to writes where you need to know a row was really changed.

Failed writes keep the draft and offer Retry, as today.

**Link targets are not validated** against nodes/edges (the node may not be saved yet), so a note on a just-created node won't be rejected — and a link to a node that never gets saved just sits there harmlessly.

**Node/edge deletes:** keep deferring the real DELETE past your undo window. The DB then marks that component's links `deleted` for you — don't flip link state yourself, and update your store from the result.

**Done when:** a note survives a reload and shows in another browser; the badge equals the DB; `/all` is one entry with N links and one undo removes it; a node's number survives delete→new node (never reused); mock mode still works offline.

---

## Phase C — small items that are ready now
- **`system_config`:** `loadSystemConfig()` reads the table once on canvas load (env vars stay as fallback). Keys: `context.composer_max_lines`, `context.canvas_bar_max_lines`, `context.hash_autocomplete_rows`, `context.note_max_chars`, `context.panel_note_collapsed_lines`, `context.removal_prompt_visible_ms`, `edge.clarification_delay_ms`, `edge.needs_you_max_visible`. Values are JSON numbers. `context.note_max_chars` is what the DB enforces — your composer should use the same number.
- **`component_removals`:** insert into the real table (one row per id for a group delete).
- **Edge labels:** `edges.label` exists (≤ 80 chars). The inline label editor can be built now; a labelled edge never shows a "?".

---

## Do NOT build (removed or deliberately deferred)
- **The "?" via the backend** — no `edges.clarification_*`, no `edge_clarification` SSE message. Local stand-in stays; an LLM will decide it later.
- **Live updates via SSE** (`context_changed`) — out for v1. Keep the `storage`-event tab sync.
- **Notify events** (`context.created` …) — don't exist.
- **Attachments upload/preview** — the table exists but there is no bucket and no scan; nothing is served. Types only.
- **Anything for agents reading notes** — not built yet; the backend says so in the contract.
- **The Intervention Spectrum.** It was removed from the backend: no `/api/intervention/*` routes (they were already unmounted), no `waiting`/`offer`/`withdraw` stream messages, no judge. Your client-side **demo** (`use-intervention-demo.ts`, `mock-intervention-scenario.ts`, `DebounceIndicator.tsx`, the "Run the intervention" button in `Canvas.tsx`) is self-contained and never called the backend, so it still runs — but it demonstrates something no longer in the product. Decide with the product owner whether to delete it; do it in a **separate change**, not this one.
- **Ghosts on node creation.** Nothing in the backend runs an agent when a node is created any more (the Expander / Stress-Tester have no trigger). Only edges produce ghosts (Articulator on a `relate` edge between existing nodes, Outer Subconscious on a `question` edge). Don't wait on a ghost after creating a node.

---

## What to add to `test.md` for the product owner
- **Real persistence:** save a note on a node → reload → still there; open the canvas in a second browser → same notes and same badge counts.
- **`/all`:** one note on every node; one undo removes it everywhere; deleting one node leaves it on the others.
- **Delete / undo:** delete a note, delete its node, undo the note delete → the note returns only where its node still exists.
- **Move:** move a note, undo → back; move onto a node that already has that note → no duplicate, no error shown to the user.
- **Length:** change `context.note_max_chars` in `system_config` (service role) → the composer limit and the DB limit follow; an over-limit save keeps the draft and shows the message.
- **Numbers:** delete the highest-numbered node, create another → the new number is higher, never reused; edit a node's text → its number does not change.
- **Failure:** go offline mid-save → draft kept, Retry works, and the retry doesn't duplicate.

## Not tested on the backend side (tell the backend owner what you find)
The migrations and the function were tested against a plain Postgres 16 with RLS, **not** against a real Supabase project: not verified are how supabase-js/PostgREST passes the JSON array to `create_context_entry`, the real `authenticated` role for anonymous sign-ins, and the Supabase Postgres version. If the first real round trip misbehaves, report it rather than working around it.

## Questions the backend still needs from you / the product owner
1. Do AI nodes (accepted ghosts) show an `nK` number? (They get one in the DB.)
2. Is the intervention demo to be deleted?
3. Edge labels: build the editor in this round or later?
