---
feature: "session-branching"
type: story
created: 2026-08-16
status: deferred
git_branch: "[future — not scheduled]"
depends_on: "intervention-spectrum, branching (specializes it — see Relationship)"
---

> **Deferred — future release.** Placeholder to capture the design intent and
> blast radius so it isn't lost. Needs its own planning/gatekeeper pass before
> any code. Not in scope for the session_number / single-active-session work
> that motivated writing this down (`src/routes/session.ts`, shipped
> 2026-08-16).

## Note to whoever picks this up (possibly future me)

Don't treat the "Recommended mechanism" / "recommended starting point" calls
below as settled — they were the best answer available in a single
discussion, not a verdict. Before writing a single line of implementation,
**re-derive this from scratch, and do it on ThinkingCanvas itself** — dogfood
the product on its own hardest pending design problem: open a canvas, drop
the sections below in as nodes, let the Expander/Stress-Tester/Observer loose
on it, actually diverge and converge rather than rubber-stamping what's
already written here. If the tool is worth anything, using it on this problem
should produce a better answer than the one draft below did.

At minimum, re-think:

1. **The optimal way to isolate node/edge visibility per branch** — is
   `branch_path UUID[]` actually the best mechanism, or just the first one
   that came to mind? Stress-test it against real fan-out (hundreds of
   forks on one canvas — does a GIN-indexed array-contains still hold up?)
   and against every read path in the Blast Radius table, not just the
   obvious ones.
2. **The optimal way to isolate context per branch** — the agent-thread
   question (copy-on-fork vs. filter-at-read) was left explicitly
   unresolved below. Don't default to "copy-on-fork" just because it was
   listed first. Weigh what happens to `rejection_insights`, receptivity,
   and Observer structures under each option too — the story below only
   worked through threads in detail.
3. **Optimize search and retrieval of context** — once visibility is
   correctly scoped, make sure it's not just correct but *fast*: what does
   a judge/canvas-map read cost on a canvas with a deep, wide branch tree?
   Does anything here want a different index, a cache, a precomputed view —
   this angle wasn't scrutinized at all in the first pass, only correctness
   was.
4. **Make sure the solution is actually complete — not half-baked.** Follow
   every consequence through, including the ones that are inconvenient:
   session_learnings, Observer cross-branch comparison, merge/prune, the
   single-active-session tension. A design that solves node/edge visibility
   but leaves threads hand-waved (as this draft does) is exactly the
   half-baked outcome to avoid — either resolve every open question below or
   have a real reason it's still open.
5. **Whatever else future-me notices that current-me didn't.** This list
   isn't exhaustive — it's what was visible from one conversation. Trust
   whatever new problems surface once this is actually being worked with
   real canvas data and real branch trees, not just described in prose.

## Relationship to `../branching/story.md`

That story is the general vision: fork from **any node**, mid-canvas, owning a
node/edge subtree. This story is narrower and concrete — fork only from a
**closed session** as a whole. It's a tractable first slice of the same idea,
not a competing design: a session-fork is a special case where the anchor is
"everything up to the session boundary" instead of one node. If node-anchor
branching is ever built, session-branching's lineage model (tree of sessions,
flat `session_number` + parent pointer) should still hold — a node-anchor
fork just needs to record which session it forked *within*, in addition to
which node.

**Naming collision to watch:** `src/tools/get-branch.ts` already uses "branch"
for a node-DAG subtree (`branch_root_node_id`) — an unrelated, pre-existing
meaning. Pick a different term in the actual FE/API vocabulary if both ship
("fork" for sessions vs. "branch" for the node tool, or vice versa) so support
conversations and code both stay unambiguous.

## What

From any **closed** session, start any number of new sessions that continue
from that point — siblings that each explore a different direction without
seeing each other's nodes. A session that was never branched keeps behaving
exactly as it does today (each "New Session" click auto-forks from the most
recently closed one — see Model below); branching only becomes visible when
the user deliberately picks an earlier closed session as the fork point.
Forks can nest to any depth — a fork is itself a normal closed session once
complete, forkable again like any other.

## Why

Today `sessions` is a flat timeline — `session_number` is derived purely from
creation order (`priorSessions.length + 1`), and there is exactly one useful
"next" session: whichever one you start after closing the current one. That
throws away a real thinking-tool need: sometimes the productive move after a
session is "try two different directions from here," not "keep going down
one." This is the same class of no-cognitive-atrophy value branching-proper
targets, scoped down to a boundary the product already has (session close)
instead of a boundary it doesn't yet track well (arbitrary node).

## The model

- **Lineage, not a separate "branch" entity.** A branch IS a path through the
  session tree — every session has at most one parent, `sessions` forms a
  tree, and "the branch a session belongs to" just means its root-to-self
  path. No new top-level entity needed.
- **`session_number` stays a flat, canvas-scoped monotonic integer** —
  unchanged from what's live today (`priorSessions.length + 1`, assigned in
  creation order regardless of tree position). Two sibling forks off the same
  parent still just get the next two integers in creation order (e.g. parent
  is session 2; fork now → session 5; fork again next week → session 6) —
  **not** `2.1` / `2.2`. Rationale (matches the earlier decision): a flat
  int stays trivially sortable/indexable and never collides as forks
  interleave with unrelated linear sessions elsewhere in the tree; a dotted
  scheme would need a per-parent child counter that's fiddly to keep race-free
  under concurrent forks and awkward to sort/compare across depths.
- **Lineage lives in a separate field**, not encoded into the number:
  `branched_from_session_id` (the FK — authoritative) +
  `branched_from_session_number` (denormalized copy, so the FE can render
  "forked from Session 4" without an extra join/lookup, same rationale as
  `session_number` itself). NULL on both = the canvas's root session.
  A hierarchical display label ("2.1", "2.1.1") is a **presentation** concern
  the FE can compute by walking the lineage graph — the backend exposes the
  raw parent pointers, not a pre-formatted path string, so relabeling never
  requires a migration.
- **Unlimited siblings, unlimited nesting.** Any closed session — root or
  fork — can be forked any number of times, to any depth. A full tree, not a
  one-level fan-out.
- **Default fork target = "just continue."** `POST /api/session/start`
  already has to pick *a* parent for every new session (needed for the
  session-boundary thread marker and, per below, for scoping). If the caller
  doesn't name one explicitly, default to the canvas's most-recently-closed
  session — that's today's linear behavior, unchanged. Explicit branching is
  opt-in: the FE passes `branched_from_session_id` to fork from an earlier
  closed session instead.

## Tension with the single-active-session invariant (shipped 2026-08-16)

`session/start` now enforces **at most one active session per canvas**
(returns the existing active session idempotently instead of creating a
sibling — see `src/routes/session.ts`). Branching doesn't require relaxing
this for v1: keep it. Branches are explored **one at a time** — close your
current session/branch before forking into (or resuming) another. This
sidesteps the much harder problem of concurrent-branch visibility (two open
sessions on the same canvas at once, each needing a live, isolated view) and
keeps the invariant exactly as-is. Split-view / simultaneous multi-branch
exploration is an explicit **non-goal** here — flag it as a later, separate
story if the product wants it; it changes the invariant, not just adds to it.

## The hard part: node/edge/thread visibility per branch

This is the part flagged as tricky and it's the real blast radius. Two
non-negotiables in `CLAUDE.md` are directly load-bearing here and both need
revisiting, not just extending:

- **#5 "Agent threads are per-canvas (`canvas_id`) — never per-session."**
  Branching needs per-**lineage** thread context: an agent's memory on Branch
  A must not include turns that only happened on Branch B, even though both
  share the same `canvas_id` and the same parent session. This is a direct
  reversal of #5's "never per-session," not an extension of it.
- Nodes/edges today are visible **canvas-wide across all sessions**
  (`CORE-CONCEPTS.md`: "`nodes.canvas_id` → node belongs to canvas, visible
  across ALL sessions") — deliberate today (single-user, no session-scoped
  privacy need existed). Branching breaks that assumption: a fork must see
  everything up to its fork point, plus only its **own** subsequent nodes —
  never a sibling branch's.

**Recommended mechanism — a materialized ancestor path.** Add
`sessions.branch_path UUID[] NOT NULL` — root-to-self inclusive, set once at
INSERT (`parent.branch_path || NEW.id`, or `ARRAY[NEW.id]` for a root) and
never touched again, since a session's parent never changes after creation.
Visibility for session X becomes `session_id = ANY(X.branch_path)` — a plain
indexable (GIN) array-contains filter, no recursive query on the hot path.
Chosen over a live `WITH RECURSIVE` walk (cheap once at fork time vs. paid on
every read) and over `ltree` (the codebase's existing convention is plain
`UUID[]` columns — `node_sequence`, `anchor_node_ids` — not a new extension).

**Where that scoping has to land** (today all of these filter by `canvas_id`
alone — every one needs a branch-aware variant or an added parameter):
| Area | Current | Needed |
|---|---|---|
| `src/db/nodes.ts` (`getAllByCanvas`, `getAllByCanvasWithContent`, `getRecentNodes`) | canvas-wide | scoped to the requesting session's `branch_path` |
| `src/db/edges.ts` (`getEdgesByCanvas`, `getBothExistingEdges`) | canvas-wide | same |
| `src/tools/*.ts` (all 8 cursor tools — `get_content`, `get_window`, `traverse_trail`, `get_big_picture`, `get_siblings`, `get_path`, `get_branch`, `semantic_promote`) | canvas-wide | same |
| `src/db/threads.ts` / `agent_threads` | one row per `(canvas_id, agent_role)`, unscoped | needs branch isolation — see below |
| `src/db/session-learnings.ts` | FE reads canvas-wide directly (`FRONTEND-CONTRACT.md` §3.3) | a fork should inherit only **its chosen parent's** learnings, not every learning ever produced on the canvas |
| Judge / Observer canvas-map reads (`getAllByCanvasWithContent` callers) | canvas-wide | same as nodes |
| Serializer tiers (`src/serializer/`) | reads off the above | inherits the fix once the DB layer is scoped |

**Agent thread isolation — two options, not resolved here:**
1. **Copy-on-fork (recommended starting point).** At fork time, duplicate the
   parent's `agent_threads` rows (one per agent role) into new rows scoped to
   the new branch — the fork gets its own independent copy (including
   `active_rejection_insight_ids`) to keep appending to. Simple mental model,
   no retrofitting existing message shapes, consistent with the "threads are
   append-only" assumption already in place. Cost: duplicated history:
   storage grows with fork count, and a correction made on one branch's
   thread never reaches a sibling that already forked off before it.
2. **Filter-at-read.** Keep one shared thread row per `(canvas_id,
   agent_role)`, tag every `ThreadMessage` with the `session_id` (or
   resolvable node → session) it was produced in, and filter the JSONB array
   down to the requesting branch's `branch_path` on every read. Avoids
   duplication but requires retrofitting `session_id` onto message shapes
   that don't carry it today (`ThreadMessage`'s assistant variants have no
   session field), and breaks `turn_index`-addressed lookups
   (`POST /api/ghost-status` indexes into the *whole* array today — a
   filtered view needs a different addressing scheme).

Pick one in the dedicated design pass this story defers to — don't decide it
here.

## What a fork inherits at creation

- **Node/edge state up to the fork point** — free once branch-path scoping
  lands (nodes/edges are already canvas-scoped rows; scoping the *read*, not
  duplicating the *data*, is sufficient — a fork doesn't need its own copies
  of parent nodes, just visibility into them).
- **Agent thread context**, isolated to the new branch only (see above) — the
  existing `session_boundary` marker turn mechanism still applies on top of
  whichever isolation approach is chosen, so agents can tell "this is a fork
  of Session N," not just "a new session started."
- **`session_learnings` carry-forwards from the chosen parent** — same
  Carry-Forward/Discard mechanic that seeds a normal next session today
  (`Session Complete Flow`, `CORE-CONCEPTS.md`), scoped to the parent actually
  forked from rather than to the whole canvas.

## Open questions (for the future planning pass)

- Copy-on-fork vs. filter-at-read for `agent_threads` (above) — pick one.
- Does `rejection_insights` need the same lineage scoping as threads, or does
  a hard/approach-pivot constraint reasonably apply canvas-wide regardless of
  branch? (Content-quality feedback probably still generalizes; connection
  feedback tied to a specific rejected `observer_edges` row may not.)
- `observer_structures`/`observer_edges` — do Observer structures need
  branch-scoping too, or is the Observer's cross-branch comparison actually a
  desired *feature* (spot connections a human wouldn't see across their own
  parallel explorations)?
- Concurrent multi-branch exploration (relaxing the single-active-session
  invariant) — explicitly deferred above; revisit only as its own story.
- Merge/prune semantics (promote a branch, discard siblings) — same open
  question `../branching/story.md` already carries; unresolved there too.
- Does forking need its own Zod schema / route field validation beyond
  "`branched_from_session_id` must reference a `status:'closed'` session on
  the same `canvas_id`," or is that check sufficient?

## Dependencies

Builds on the `session_number` + single-active-session work already shipped
(2026-08-16) — this story's numbering model is additive to that, not a
replacement. Conceptually downstream of `../branching/story.md`'s lineage
thinking; upstream of nothing today (branching-proper can adopt this story's
session-tree model rather than inventing its own).

## Task Breakdown

Deferred — a dedicated planning/gatekeeper pass produces the tasks before any
implementation begins, same as `../branching/story.md`. The agent-thread
isolation decision above should be resolved *in* that pass, not assumed.
