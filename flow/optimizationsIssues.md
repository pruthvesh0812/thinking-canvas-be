# Optimization issues

Things that work correctly today but are slower or heavier than they need to be. Not bugs. Fix them when a real run is slow or expensive,
and measure first. One entry per item.

Status values: `open`, `done (commit)`.

---

## 1. `retrieveS1` makes many separate database calls

- **Added:** 2026-10-31 (walkthrough, Stone 6)
- **Where:** `src/context/retrieve-s1.ts:30-129` and `walkAncestors` (line 135), through the data source (`src/context/db-source.ts`, `src/db/*`)
- **What happens:** one call per step: load the focus, load the edges touching it, load the neighbours, then the ancestors one level at a
  time (two calls per level, for the edges and for the nodes, up to 6 levels), then one for the notes. A deep parent chain means a dozen or
  more round trips to the database in a row, one after another.
- **Why it is fine for now:** a typical S1 run has a short chain, and the model call takes far longer than these reads.
- **First thing to batch if runs get slow:** fetch the whole chain in one query (a recursive query, or one database function that returns the
  focus, neighbours and ancestors together), and start the independent calls together instead of one after the other. Measure the time
  spent in retrieval first (the run log already records the tokens; add retrieval duration).
- **Status:** open
