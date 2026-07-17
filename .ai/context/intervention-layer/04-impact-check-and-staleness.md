---
last-verified: 2026-07-17
verified-against: intervention-spectrum task-01 (fingerprint), task-06 (canvas sync), task-07 (Impact Check)
stale-after-days: 30
referenced-from: intervention-layer/README.md
---

# 04 · The Impact Check & Staleness

> Every offer is born from a snapshot of the canvas. If the canvas moves under it,
> the offer might be stale. The Impact Check catches that. Code:
> `src/lib/intervention.ts` (`checkImpact`), `src/routes/intervention.ts`
> (ghost-interaction), the impact pipeline in `src/pipeline/agent-pipeline.ts`,
> `src/routes/canvas-event.ts`.

---

## What is done

### The context fingerprint

`canvases.canvas_version` is a plain integer bumped by a **Postgres trigger on both
`nodes` and `edges`** — on every insert, update, and delete. It is a
*change-detector*, never stored content. Every offer stamps the fingerprint it was
born from into `context_fingerprint`.

Comparing the two integers answers one cheap question: *has the canvas changed since
this offer was made?*

```
none      → fingerprints equal    → the offer is still current
material  → fingerprints differ   → something changed; the offer may be stale
```

The trigger fires on **edges too**, deliberately: a re-parent is a *delete edge A–C
+ create edge B–C*. A node-only counter (node count, max updated-at) would miss it.

### Two jobs the fingerprint powers

1. **Wake-time re-judge** (see [`01-trigger-and-handshake.md`](./01-trigger-and-handshake.md)) —
   at generation, unchanged snapshot → reuse the cached route; material change →
   re-judge or abort. This also caps judge cost: an unchanged snapshot reuses the
   prior verdict instead of re-running the strong model.

2. **Ghost-interaction impact** — when the user accepts, rejects, or hovers an
   *existing* ghost, or deletes a depended-on node/edge, the layer checks whether
   the held offer still reflects reality.

---

## Ghost-interaction cases (matrix 12–15, 24)

`POST /api/intervention/ghost-interaction` handles accept/reject/hover on an OLD
ghost. It compares the offer's fingerprint to the canvas's current one:

- **none** → show as-is; the caller proceeds with its normal accept/reject/hover.
- **material + hover** → return the offer **with a warning** ("this may not capture
  your latest change — regenerate?"), no re-trigger.
- **material + accept/reject** →
  - if an intervention is already in flight for the session → land the ghost **with
    a warning** (don't interrupt the run that's already going);
  - otherwise → **re-trigger** a fresh judgement (fire `canvas/intervention.trigger`
    with a new `offer_id`), because there's nothing in flight to disturb.

## Delete-impact (matrix 5, 7, 8)

Deletes never *spawn* a new offer on their own — they only check whether an offer
already in flight is now stale. `src/routes/canvas-event.ts` fires
`canvas/intervention.impact` on `node.deleted` / `edge.deleted`, and the
**impact pipeline** (`interventionImpactPipeline` in `agent-pipeline.ts`) runs the
Impact Check across the session's in-flight offers:

- a **node** delete scopes to offers actually anchored to the vanished node;
- an **edge** delete can't be scoped that way (the row and its endpoints are already
  gone), so it falls back to the coarse fingerprint check across every in-flight
  offer.

On a material verdict the offer's headline is **warned in place** (the warning is
appended) and re-published — not withdrawn. Over-warning is safe; under-warning is
the risk, so the coarse fallback errs toward warning.

---

## Why it is done this way

- **Staleness is a real correctness bug.** A user accepts a ghost, then reworks the
  node it was about; landing the old ghost silently would be wrong. The Impact
  Check makes "the canvas moved" a first-class, detectable state.
- **A version counter is the cheapest honest detector.** We only need to know
  *whether* something changed, not *what* — so an integer bumped by a DB trigger is
  perfect, and it can never drift out of sync with the actual writes.
- **This generalises the old rule.** The previous "2 new nodes without interaction
  → ignore the ghost" heuristic becomes a real staleness model, and it is the same
  check the concurrency version guard leans on
  (see [`06-concurrency-and-versioning.md`](./06-concurrency-and-versioning.md)).

---

## Relation to the frontend

- The FE must **persist all mutations to Supabase** — not just creates, but edits,
  deletes, and re-parents — and *then* notify via `/api/canvas-event`. The
  fingerprint only catches what was actually written; a delete the FE never
  persisted is invisible to it. (Cross-repo: the FE isn't built yet; this is a
  standing dependency.)
- The ordering contract is **write-to-Supabase → then notify**. The backend always
  reads post-write state.
- A **material + warning** response is a prompt the FE surfaces to the user
  ("regenerate?") — the backend supplies the copy, the FE renders the choice.
- An **edit** (`node.updated`) must re-run enrichment (summary + embedding), not
  just bump the fingerprint — a create-time summary goes stale when the text
  changes. `canvas-event.ts` already does this.

---

## Key constraints

- **The fingerprint is a change-detector, never content** — never stuff node text
  or hashes of content into it; the integer counter is the whole design.
- **The trigger must stay on both `nodes` and `edges`** — dropping the edge trigger
  reintroduces the re-parent blind spot.
- **Deletes warn; they don't silently withdraw** a shown offer — the user should be
  told their held suggestion may be stale, not have it vanish.
