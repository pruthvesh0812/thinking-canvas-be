---
last-verified: 2026-07-17
verified-against: intervention-spectrum task-08 (receptivity + purge)
stale-after-days: 30
referenced-from: intervention-layer/README.md
---

# 05 · Receptivity & Retention

> How the layer learns *timing* (without polluting the content-learning channel),
> and why offers are thrown away. Code: `src/lib/intervention.ts`
> (`nextReceptivity`, `timerMsFor`), `src/db/sessions.ts`
> (`applyReceptivityResponse`, `getReceptivity`), `src/db/intervention-offers.ts`
> (purge helpers), `src/pipeline/session-complete.ts`.

---

## What is done

### The receptivity model

`sessions.receptivity` is a single decayed number in `[0, 1]`, neutral at `0.5`.
Every time an offer reaches a terminal state, the way the user responded is folded
in:

| Response | Meaning | Δ |
|---|---|---|
| `manual` | hit "process now" — pulled the offer forward | +0.12 |
| `dismissed` | explicitly waved the offer off | −0.15 |
| `ignored` | the timer hard-timed-out (tab abandoned) | −0.10 |

Before applying the delta, the stored score **decays toward neutral** on a 6-hour
half-life (`nextReceptivity`). A bad afternoon fades before the next session, so the
aggregate reflects a *recent pattern*, not a permanent grudge.

Receptivity tunes two things:

- **Timer length** (`timerMsFor`): 10s default, 5s when receptivity is high — a
  receptive user gets a shorter wait. The chosen `timer_ms` rides on the `waiting`
  message so the FE renders the right countdown.
- **Show intensity** (`decideDirectness`): below a low threshold, an offer is forced
  to `subtle` regardless of attention state — we back off from someone who's been
  brushing us away.

### The offer lifecycle

The judge does **not** return an offer — it returns a *decision*. When the decision
is mature, the pipeline **builds and persists** an `intervention_offers` row from
it. That row is the durable handle every later step references by `id` / `seq`:

```
judge mature ─▶ create (status=waiting) ─▶ waiting published ─▶ parked
      ▲                                                            │
      └──────────── re-judge on change ◀── process/go ◀───────────┘
                                              │
                                    generate ─▶ show (status=shown,
                                                directness + headline set)
                                              │
                             user acts ─▶ pulled | dismissed | superseded | expired
```

### Retention — offers are ephemeral

The offer is **operational state, not a permanent record.** At any terminal status,
its receptivity signal is folded into the aggregate **first**, and then the row
becomes eligible for deletion:

- **`session-complete`** purges every resolved offer for the session
  (`purgeResolvedForSession`).
- A **TTL sweep** (`purgeAbandonedWaiting`, 15 min) cleans up any `waiting` rows
  whose `waitForEvent` timeout should have expired them but didn't (e.g. a crashed
  worker).

The permanent "the AI helped here" record lives on the **thread** (`ghost_pair`) and
the **`AiContribution`** audit — never on the offer.

---

## The trap to avoid (the whole point of §8)

**An ignored or deferred offer is NOT a rejected idea.** Deferring a timer means
*"not now / I'm busy,"* not *"that idea was bad."* So the layer keeps two learning
channels strictly separate:

| Signal | What it means | Where it goes |
|---|---|---|
| **Offer-response** (dismiss / defer / ignore / process-now) | timing / receptivity | **receptivity aggregate only** |
| **Content accept/reject** (on a materialised ghost) | idea quality | **Rejection Insights Engine** |

Nothing in the receptivity path ever writes `rejection_insights`. Keeping these
channels clean is the subtle correctness point of the feature — mixing them would
teach the AI that a busy user hates its ideas.

---

## Curation as a rolling signal

Not every curation action is a trigger. A single mid-flow node-move (#5) is
incidental → show-only. But an accumulated **interaction-texture** signal — several
moves + a delete + a dwell in a short window — reads as the user *consolidating*,
which is a genuine converging signal that legitimately triggers the judge (and makes
the Stress-Tester likely eligible). The frontend computes this texture (it feeds the
trigger ruleset); the backend receives the aggregate. It is the action-side sibling
of Attunement's content-side reading.

---

## Relation to the frontend

- The **timer length** the FE renders comes from the backend (`timer_ms` on
  `waiting`) — receptivity-tuned, not a hard-coded constant on the FE.
- The FE reports the three timing responses that feed receptivity: "process now"
  (`/process` with `reason: manual`), dismiss (`/dismiss`), and the natural lapse /
  abandonment (`/process` with `reason: lapse`, or simply never calling it → the
  backend's hard timeout counts it as `ignored`).
- The FE computes the **interaction-texture** signal locally and folds it into its
  own trigger ruleset; the backend only ever sees the resulting trigger.

---

## Key constraints

- **Offer-response never writes `rejection_insights`.** This is the one rule that,
  if broken, quietly corrupts the content-learning loop.
- **Fold the receptivity signal *before* purging** — every terminal transition
  updates the aggregate first, then the row may be deleted.
- **Offers are ephemeral** — never treat `intervention_offers` as a historical
  record; the permanent trail is the thread + `AiContribution`.
- **The offer must be durable through the wait** — it is persisted precisely because
  a parked run can outlive a worker; don't move it in-memory.
