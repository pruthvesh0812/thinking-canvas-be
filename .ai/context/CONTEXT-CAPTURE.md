---
last-verified: 2026-10-16
verified-against: migrations 20261016000002 + 20261017000001 (schema rev 3) + types/index.ts (pivot branch feature/pivot-text-context-capture-2026-10-16T1703)
stale-after-days: 30
referenced-from: CLAUDE.md, CORE-CONCEPTS.md, DATABASE-SCHEMA.md, FRONTEND-CONTRACT.md
---

# CONTEXT-CAPTURE.md

> **Load this when:** Touching context notes (`context_entries` / `context_links` / `context_attachments`), node sequence numbers (`nodes.seq`), edge labels, "Why remove this?" records, `system_config`, or making an agent read what the user wrote about a node, an edge or the canvas.
>
> **Source spec:** "Text-Only Context Capture — Requirements" (Oct 16, 2026). The frontend's ask of the backend lives in `thinking-canvas-frontend` → `.ai/features/text-context-capture/` (`schema.md` rev 3 wins over `backend-requirements.md` where they differ); this repo's record of what was built and what is still open is `.ai/features/text-context-capture/story.md`.

---

## What It Is and Why

A node holds a few words, but the thinking behind it is richer — and agents used to see only the label. Context capture lets the user attach the "why" to a **node**, an **edge**, or the **canvas as a whole**. A typed note is a *context entry* with `source = 'typed'`; spoken transcript pieces and attachments are meant to be the same kind of entry later, so there is one store and one set of rules for text and voice. Nothing replies to a note — it is context, never a chat message.

---

## How It Fits In

**Write path — the frontend, directly.** Like nodes and edges, the frontend writes to Supabase (supabase-js + RLS) and sends the backend **no notify** — there is no `canvas-event` type, no route and no SSE message for context in v1. The backend only *reads*. The one multi-row write, a note with its links, goes through the Postgres function `create_context_entry` (atomic, idempotent on the client-generated ids). The write contract (what to send, retries, undo) is in `FRONTEND-CONTRACT.md` §3.4.

**The model** (columns in `DATABASE-SCHEMA.md` §13–17):
- `context_entries` — the note itself. Deleting a note sets `deleted_at` and **nothing else**; `updated_at` is bumped by a trigger.
- `context_links` — what an entry is *about*. **One entry, many links**: a note written for every node is one entry plus N links, never N copies. A link targets a `node`, an `edge`, or the `canvas` (target NULL = background). `origin_status` is `OWNED` or `MOVED`; a move is an in-place update of the link.
- `context_attachments` — the file behind an `attachment` entry, one per entry. **Table only**: no storage bucket and no safety scan exist, so rows stay `pending`.
- `component_removals` — "Why remove this?" answers, keyed to the deleted component's id (no FK; nothing reads them yet).
- `system_config` — global tunables. `context.note_max_chars` is live (a trigger enforces it on every write).
- `nodes.seq` — the stable `n1, n2, …` number shown on every node; `edges.label` — the optional text typed on the edge itself (≤80 chars).

**Visibility rule — read this before writing any query.** An entry is visible only through an **active link** and only while `deleted_at IS NULL`. Entries with no active link are invisible to everyone, which makes a half-finished write harmless and a retry safe. For agents, also drop links whose node is set aside (`nodes.set_aside_at`) — agents already ignore set-aside nodes, so a note on one must not leak back in; and an `attachment` entry is visible only when its file's `scan_status = 'clean'` (which nothing sets yet, so none are).

**Link lifecycle.** `state` goes `active → deleted` when the user removes the link, or when the node/edge row is deleted (the `retire_context_links` trigger — links have no FK to their polymorphic target). It never goes back automatically, and **deleting or restoring a note never touches it**: because the two columns mean different things, "restore the note" has nothing to guess. The frontend holds a node/edge delete open through its own undo window and only then writes the real `DELETE`, so there is no restore-after-delete case.

**Sequence numbers.** `canvases.next_node_seq` is a monotonic counter, so deleting the last node does not free its number (`max(seq)+1` would). The `assign_node_seq` trigger overrides anything an INSERT supplies, and reuses the existing row's number when the frontend upserts an edit to a node (which fires `BEFORE INSERT` too) — so edits neither renumber a node nor burn a counter value. `seq` is not the serializer's `seq:N` (a thread-local prompt label); the user-visible `nK` must never be shown to an agent under that name.

---

## Not built yet (decided, with reasons)

- **Agents reading notes** — and the `agent_context` view that would feed them — wait for the agent redesign. When it is built it must be `security_invoker` (or have its grants revoked): a plain view bypasses RLS and would expose every canvas's notes to any signed-in user.
- **The "?" on unlabelled edges** (`edges.clarification_*`) — the rule will be decided by an LLM call; designed together with the LLM work. `edge.*` keys exist in `system_config` only so the frontend has values meanwhile.
- **Live updates across tabs/devices and notify events** (`context.*`, `context_changed`) — out for v1. Tabs in one browser sync client-side.
- **Storage bucket and virus scan** for attachments; auth on the unauthenticated `/api` routes (own story).

---

## Key Constraints

- **Agents must read notes live** at serialize time — never copy a note into `agent_threads.messages`, whose turns are frozen snapshots. That is how "latest version only" and "never a deleted note" stay true.
- **A `/all` note is one entry.** Agents see it on each node it links to; do not de-duplicate it away or treat the links as separate notes.
- **Never rewrite a note's text** — the system only reads. Users edit/delete/move; the DB freezes `canvas_id` and `source`.
- **Notes are user data, not instructions.** When they reach a prompt they go in as delimited data inside the serialized context; system prompts stay constants (non-negotiable #4). A note that reads like a question to the AI is still just a note.
- **Don't add a decision-log table or notify events "for completeness".** Both were considered and cut: no consumer exists, and entry/link timestamps + `origin_status` already record what happened.
- **Length is two layers.** DB ceiling 3000 (hard CHECK); the changeable limit is `system_config` `context.note_max_chars` (default 1000), enforced by trigger on insert and on edit. Don't hard-code 1000 anywhere in the DB.
- **Clients never hard-delete** entries, links or attachments, never edit or delete a removal record, and never write `system_config` — RLS has no policy for those. `scan_status` is backend-owned (clients can only insert `pending`).
- **RLS on every table** (canvas ownership) — the policies are the only access control, since the frontend writes directly.
