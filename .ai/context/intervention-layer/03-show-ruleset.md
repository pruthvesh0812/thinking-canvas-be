---
last-verified: 2026-07-17
verified-against: intervention-spectrum task-07 (show ruleset)
stale-after-days: 30
referenced-from: intervention-layer/README.md
---

# 03 · The Show Ruleset

> Once something is generated, *how loudly* do we present it? Code:
> `src/lib/intervention.ts` (`decideDirectness`, `authorHeadline`,
> `upgradeHeadline`), applied in the `finalize` step of
> `src/pipeline/agent-pipeline.ts`.

---

## What is done

After generation, the backend stamps the offer with two things and publishes it:

1. **`directness`** — `'direct'` or `'subtle'`.
2. **`headline`** — a one-line, plain-language summary of what the agent produced.

The frontend then crosses `directness` with a fact only it knows — **is the anchor
node in the viewport or off-screen** — to pick the actual surface:

| | Anchor **in view** | Anchor **off-screen** |
|---|---|---|
| **direct** | high-intensity glow on the node + ghost-edge ends | a normal card in the sidebar |
| **subtle** | low-intensity glow | a low-intensity sidebar card |

Glow-first **arrival** always holds: nothing barges in fully-formed. The ghost
arrives faint; hover reveals it.

### Directness is a function

```
directness = f(attention state, show-rule, receptivity)
```

- **attention state** — `waiting` (the user hit "process now" / was watching) →
  lean **direct**; `thinking` (the timer lapsed on its own) → lean **subtle**,
  protect the flow. This comes straight from the `reason` on `/process`
  (see [`01-trigger-and-handshake.md`](./01-trigger-and-handshake.md)).
- **show-rule** — a per-action override. The standard generate-at-show path uses
  `'standard'`; the hover-an-old-ghost case uses `'always_direct'` (the hover *is*
  the reveal request).
- **receptivity** — a recently-unreceptive user is forced back down to `subtle`
  no matter how attentive they look this instant (see
  [`05-receptivity-and-retention.md`](./05-receptivity-and-retention.md)).

### The headline

The backend authors the sidebar-card headline because **only the backend knows what
the agent actually produced**. `authorHeadline()` reads the agent's own
`[NODE_TYPE: …]` tag out of its output and maps it to a friendly line — e.g. a
`contradiction` becomes *"Worth a look when you're free — I found a tension between
this node and an earlier one."* If the tag is missing it falls back to the node
type pre-assigned in the spawn descriptor.

---

## Why it is done this way

- **The split is deliberate.** The backend owns *what* (the result, the directness,
  the headline) because it alone has the content and the attention state. The
  frontend owns *where* (glow vs card) because it alone knows viewport position.
  Neither side can do the other's half.
- **Interruption scales with intent.** A user who asked ("process now") gets a
  direct surface; a user whose timer merely lapsed gets a quiet one. Loudness
  tracks how much the person signalled they wanted it.
- **The card is a jump-off, not a wall of text.** The headline is one line;
  clicking the card pans the view to the anchor, which then glows. The detail lives
  on the canvas, not in the sidebar.

---

## Relation to the frontend

- The backend sends `{ directness, anchor_node_ids, headline }` on the `offer`
  message; the FE picks glow-vs-card from viewport position and renders the
  intensity. The backend never dictates pixels.
- **Clicking a sidebar card pans to the anchor** and triggers the glow — that
  navigation is an FE behaviour driven by `anchor_node_ids`.
- A **tier-locked** pick arrives as an offer whose headline is the upgrade line
  (`upgradeHeadline()`); the FE renders it as a conversion surface on the card
  rather than as content.

---

## Tier-locked offers

When the judge's best pick is outside the user's plan, there is no generation at
all. The pipeline still creates an offer, sets it straight to `shown` with
`directness: subtle` and the upgrade headline, and publishes it. The user sees a
card that says, in effect, *"there's a deeper move available here — upgrade to
unlock it,"* anchored to the right place on the canvas. See
[`02-the-judge.md`](./02-the-judge.md) for why we never substitute a weaker agent.

---

## Key constraints

- **Backend sets `directness` + `headline`; frontend picks the surface.** Don't
  move viewport logic to the backend or content logic to the frontend.
- **Glow-first arrival is universal** — even a `direct` show arrives faint and
  reveals on hover. Never render a fully-formed AI node unbidden.
- **The headline is derived from the agent's real output**, not a generic string —
  it must reflect what actually landed.
