# 02 — Data Model

All tables live in Supabase Postgres. Names are **proposed**; reconcile with existing tables
(see README). Columns marked *(new)* are the ones this design adds if a table already exists.

Enable extensions: `vector` (pgvector).

## `canvases`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| title | text | Used in the "canvas intent" prompt layer. |
| goal | text null | The canvas's root question / purpose, if the product captures it. |
| summary | jsonb null | *(new)* Rolling structured summary. File 04. |
| summary_updated_at | timestamptz null | *(new)* |
| summary_incremental_count | int default 0 | *(new)* Incremental updates since last full rebuild. |
| token_count_total | int default 0 | *(new)* Sum of `nodes.token_count` + edge label tokens. Used by routing (file 05). |

## `nodes`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| canvas_id | uuid fk | Index. |
| text | text | Node body. |
| title | text | *(new, or derived)* Short form used in title/stub tiers. If the product has no title field, derive: first line, truncated to ~80 chars, computed in `embed-node`. |
| type | text | Node type enum, see below. |
| x, y | float | **UI only.** Never used for retrieval, scoring, or prompts. |
| embedding | vector(N) null | *(new)* N depends on the embedding model (open question, file 13). |
| content_hash | text null | *(new)* Hash of `text` at last embedding. Lets the embed job skip unchanged text. |
| token_count | int null | *(new)* Token count of `text` (approximate tokenizer is fine). |
| created_by | text | `user` \| `agent` |
| created_by_run | uuid null | *(new)* `agent_runs.id` if created by an agent. |
| updated_at | timestamptz | |

### Node type enum [PROPOSED]
`idea`, `question`, `claim`, `evidence`, `task`, `note`.
Keep it small. If the product already has node types, use those.

## `edges`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| canvas_id | uuid fk | Index. |
| src | uuid fk → nodes | Index. |
| dst | uuid fk → nodes | Index. |
| type | text | Edge type enum, see below. **Required.** |
| label | text null | The user's stated reason for the connection, free text. |
| origin | text | `user` \| `agent` \| `implicit` |
| status | text | `accepted` \| `suggested` \| `rejected` |
| created_by_run | uuid null | `agent_runs.id` if created by an agent. |
| updated_at | timestamptz | |

Indexes: `(canvas_id)`, `(src)`, `(dst)`, `(canvas_id, status)`.

### Edge type enum [PROPOSED — finalize before building the edge picker]

One vocabulary is shared by **three places**: the user's edge picker in the UI, agent output
(file 09), and agent edge policies (file 07). They must stay identical.

| type | Reads as | Symmetric? |
|---|---|---|
| `elaborates` | **src** adds detail to / is a sub-point of **dst** (src is the child) | no |
| `supports` | **src** is evidence or argument for **dst** | no |
| `contradicts` | **src** conflicts with **dst** | treat as yes |
| `depends_on` | **src** requires **dst** (dst is a prerequisite/assumption of src) | no |
| `example_of` | **src** is an example of **dst** | no |
| `questions` | **src** raises a question about **dst** | no |
| `alternative_to` | **src** is an alternative to **dst** | yes |
| `relates_to` | generic connection; the label carries the meaning | yes |

### Direction convention [DECIDED in principle, PROPOSED in detail]

**Every edge reads as a sentence: `src <type> dst`.**

Consequences that code depends on:
- **Hierarchy:** parent/child is expressed by `elaborates`. The **child is `src`**, the
  **parent is `dst`**. "Children of X" = incoming `elaborates` edges to X. "Parent of X" =
  outgoing `elaborates` from X.
- **Assumptions/prerequisites of X** = outgoing `depends_on` from X.
- **Things that depend on X** (what breaks if X changes) = incoming `depends_on` to X.
- **Evidence for X** = incoming `supports` to X.
- **Existing examples of X** = incoming `example_of` to X.
- Symmetric types (`contradicts`, `alternative_to`, `relates_to`) are traversed in both
  directions regardless of how they are stored.

Enforce the convention in the UI (the picker must phrase choices as sentences from the source
node), in agent output validation (file 09), and in any import code.

## `canvas_events`

Feeds the "recent activity" signal. Populated by a **Postgres trigger** on `nodes` and `edges`,
not by the client.

| Column | Type | Notes |
|---|---|---|
| id | bigserial pk | |
| canvas_id | uuid | Index `(canvas_id, at desc)`. |
| node_id | uuid null | |
| edge_id | uuid null | |
| kind | text | `node_created`, `node_text_updated`, `edge_created`, `edge_deleted`, ... |
| actor | text | `user` \| `agent` |
| at | timestamptz | |

Notes:
- **Do not log position-only changes** (x/y updates) as events. Positions are not used for
  reasoning, and they would flood "recent activity". The trigger should compare old/new text.
- **Retention [DECIDED]: never delete operation history.** Every canvas operation is future
  training data (decision log #32). The recent-activity query only reads the newest rows via the
  `(canvas_id, at desc)` index, so table size does not slow it down. If the table ever must be
  slimmed, move old rows to an archive table instead of deleting them.
- Position-only changes are excluded from `canvas_events` (above). If position history is ever
  wanted for training, log it to a separate table so it never pollutes recent activity.

## `thread_notes`

One-line memory of what each agent run contributed. Canvas-scoped (matches the product's
canvas-scoped persistent threads; reuse the existing thread table if one exists).

| Column | Type |
|---|---|
| id | uuid pk |
| canvas_id | uuid |
| run_id | uuid fk → agent_runs |
| note | text |
| created_at | timestamptz |

## `agent_runs`

One row per agent invocation. This is both the job record and the **logging table** that
powers evaluation (file 12) and learning (file 11). Do not skip the logging columns.

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| canvas_id | uuid | |
| focus_node_id | uuid | |
| agent | text | `expander` \| `stress_tester` \| `synthesizer` \| `structurer` \| `critic` (reconcile with existing agents) |
| task | text | Preset action id or free text. |
| task_kind | text | `preset` \| `free_text` |
| status | text | `queued` \| `running` \| `done` \| `failed` |
| scope | text | `S1` \| `S2` \| `S3` (file 05) |
| scope_source | text | `preset` \| `jev` |
| scope_confidence | float null | Jev confidence if classified by Jev. |
| budget_category | text | `small` \| `medium` \| `large` |
| strategy | text | `neighborhood` \| `whole_canvas` \| `skeleton` \| `traversal` |
| shape | text null | Response shape chosen (existing Jev shape classifier). |
| loaded_nodes | jsonb | `[{id, tier: full|title|stub, reason, hop}]` — what the agent was shown. |
| context_snapshot | text | The exact prompt sent (or a pointer to storage if large). |
| context_tokens | int | |
| expand_context_calls | jsonb | Node ids the agent fetched via `expand_context`. |
| output | jsonb | Raw validated agent output. |
| referenced_node_ids | uuid[] | Existing node ids the output referenced. |
| outcome | jsonb null | Later: which output nodes/edges the user kept, edited, deleted, accepted. |
| error | text null | |
| created_at / finished_at | timestamptz | |

## Optional cache table — `jev_edge_decisions` [OPTIONAL, file 11]

| Column | Type |
|---|---|
| action | text (preset action id) |
| agent | text |
| edge_id | uuid |
| edge_updated_at | timestamptz |
| target_updated_at | timestamptz |
| level | int (0/1/2) |
| confidence | float |
| created_at | timestamptz |

Primary key: `(action, agent, edge_id)`. Valid only if the stored `*_updated_at` values still
match the current rows.

## pgvector index notes

- Every vector query is scoped to one `canvas_id`. Per-canvas node counts are small (hundreds to
  low thousands), so an **exact scan filtered by `canvas_id`** is fast and returns correct
  results. Start there.
- An HNSW index (`vector_cosine_ops`) with a `canvas_id` filter can return *fewer* rows than
  requested because filtering happens after the approximate search. Only add HNSW if exact
  scans become slow, and if so enable pgvector's iterative index scans or over-fetch.
