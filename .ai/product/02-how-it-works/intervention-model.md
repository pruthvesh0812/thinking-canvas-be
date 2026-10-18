---
last-verified: 2026-09-19
verified-against: .ai/context/intervention-layer/* (canonical engineering spec) · .ai/features/intervention-spectrum/DESIGN.md · src/routes/intervention.ts · src/index.ts (route NOT mounted) · FE use-ghost-stream.ts (ignores waiting/offer/withdraw) · FE canvas.html interaction study
stale-after-days: 30
audience: product, design, prompt work, marketing (the "respectful AI" story), support (why the AI is quiet)
---

# The Intervention Model: When and How Loudly the AI Speaks

> ⚠️ **Status:** the backend for this is fully built (intervention-spectrum tasks 01–08, July 2026). It is **not reachable** in the live app: `POST /api/intervention/*` isn't mounted in `src/index.ts`, and the frontend neither calls `/trigger` nor handles `waiting` / `offer` / `withdraw`. The only live AI paths are the two explicit edge gestures and Session Complete. **Describe this as the product's design, not as current behaviour.**
>
> Engineering spec: `.ai/context/intervention-layer/`. Visual walkthrough: the frontend repo's `canvas.html` ("When the AI raises its hand").

---

## The idea in one paragraph

Before the intervention layer, the AI worked as a binary: on every qualifying event it either dropped a full ghost pair next to your focus, or stayed silent. Even at 40% opacity, **putting structure on the screen unasked is an interruption**. The intervention model makes help **graduated, consensual, and lazy**. It first decides *whether* anything is worth saying. It then *asks for permission* with a quiet timer, generates only after that, and finally chooses *how loudly* to present the result. That is a second consent gate in front of accept/reject.

> Nothing barges in. The AI arrives as light you can ignore.

---

## Two axes, two gates

| Axis | Question | Who answers |
|---|---|---|
| **Trigger** | Should the AI generate anything at all right now? | Frontend's cheap attention gate → backend **judge** |
| **Show** | Now that something exists, how loudly should it appear? | Backend **show ruleset** + frontend viewport |

```
            TRIGGER                     SHOW / present               ACCEPT
canvas ─▶ [ judge: mature? ] ─timer─▶ [ generate + show ] ─▶ [ accept / reject ]
           decide to help              PRESENTATION gate          CONTENT gate
                                       (new)                      (the Ghost Threshold)
```

- **Presentation gate:** "may the AI show up right now?" Deferring means *not now*, never *bad idea*.
- **Acceptance gate:** "may this idea join my canvas?" This is the original ghost accept/reject.

---

## The flow: decide → wait → generate → show

1. **Trigger (frontend).** The frontend alone sees raw behaviour (cursor, dwell, the class of each action). It posts a trigger only when a genuine attention signal occurs. It **doesn't** judge maturity.
2. **Attunement + judge (backend, eager).** Is there a specific place where a specific role's move lands? If not, **silence**, and nothing is shown. If so, the judge picks the **single best** role and locus.
3. **Waiting (the consent timer).** The frontend shows a small **"noticed something"** ring (default **10s**, **5s** for a receptive user) with **pause** and **now**. No content tokens have been spent yet. The user can:
   - let it **lapse** → generate, shown *subtly* (they were busy thinking)
   - press **now** → generate, shown *directly* (they were waiting)
   - **pause/defer** → *"Not a rejection: tells the system you're busy, so it eases off."*
   - walk away → a hard timeout after 10 minutes quietly expires it
4. **Re-judge if the canvas changed** during the wait. A cheap version counter detects change. An unchanged canvas reuses the verdict; a changed one re-judges or withdraws.
5. **Generate (lazy).** Only now does the chosen role stream its ghost pair.
6. **Show.** The backend stamps **directness** (`direct` / `subtle`) and a one-line **headline** derived from what was actually produced (e.g. *"Worth a look when you're free: I found a tension between this node and an earlier one."*). The frontend decides the surface:

| | Anchor node **in view** | Anchor **off-screen** |
|---|---|---|
| **direct** | strong glow on the node | a normal sidebar card |
| **subtle** | faint glow | a quiet sidebar card |

**Glow-first arrival always applies.** Even a direct show starts faint, and hovering reveals the pair. Clicking a sidebar card pans the canvas to the node.

---

## What counts as a signal (the action taxonomy)

| Class | Examples | Trigger? | Show held content? | Why |
|---|---|---|---|---|
| **Flow** (heads-down) | typing, creating nodes and edges, toolbox click | no | no | Mid-thought. Don't touch. |
| **Curation** (eyes on structure) | moving a node, deleting a node/edge, hovering a node | no* | yes | Looking at the structure, so it's safe to surface what's held. |
| **Deliberate** (help-seeking) | sticky notes, dwelling on the toolbox, hovering an AI edge label | yes | yes | An intentional "help me". |
| **Ghost interaction** | accepting/rejecting/hovering an older ghost | via Impact Check | yes (+ a warning if stale) | Changes context, so staleness has to be checked. |

\* A **burst** of curation (several moves, a delete, a dwell) reads as *consolidating*, a converging signal that may legitimately trigger.

Explicit gestures (**Question** and **Relate** edges) bypass all of this and fire immediately. They're direct requests.

---

## Learning *when* to speak: receptivity

- Each session carries a **receptivity** score from 0 to 1, starting at 0.5. **"Now"** raises it (+0.12). **Dismiss** lowers it (−0.15). **Ignore/timeout** lowers it (−0.10). It decays back toward neutral with a 6-hour half-life, so a bad afternoon doesn't become a permanent grudge.
- High receptivity means shorter timers. Low receptivity forces **subtle** presentation however attentive the user seems in the moment. The AI backs off from someone who has been brushing it away.
- **The load-bearing rule:** timing signals feed **receptivity only** and never Rejection Insights. Otherwise the AI would learn that a busy user hates its ideas.

---

## Staleness: the Impact Check

Each offer records the canvas version it was born from, and a database trigger bumps that version on any node or edge change (including re-parenting). When the user interacts with an old ghost, or deletes something it depended on, the system compares versions:
- **Unchanged** → show it as is.
- **Changed + hover** → show it **with a warning** ("this may not capture your latest change: regenerate?").
- **Changed + accept/reject** → re-trigger with the new context, or land it with a warning if something is already in flight.

Future: instead of discarding a superseded idea, offer it as a **branch** ("a valid path from here, independent of your later nodes"). See `03-status/feature-status.md` → Branching.

---

## Concurrency guarantees (why it won't feel glitchy)

- **One live intervention per session.** A newer trigger supersedes the older one (`withdraw`).
- Monotonic per-session sequence numbers plus a **version guard at publish** mean a stale run can't overwrite a newer one.
- Offers are **ephemeral** operational state, purged at Session Complete (after their receptivity signal is folded in) or by a 15-minute sweep. The permanent record of "the AI helped here" lives in the agent thread and the `ai_contributions` audit.

---

## Plans inside the intervention model

If the judge's best move is on a higher plan, **nothing is generated**. The user gets a subtle **upgrade card** anchored to the right place: *"there's a deeper move available here; upgrade to unlock it."* A weaker role is never substituted. This is the designed conversion surface. It's unreachable today, and there's no checkout to convert into.

---

## Why this matters for the business (not just UX)

- **Respect:** interruption tracks how much the user signalled they wanted help.
- **Cost:** a user who ignores the timer costs one judge call, not a full generation. Content generation happens only when wanted. This is the main lever on unit economics.
- **Trust:** silence is honest. When the ring appears, something real is ready, not "thinking about whether to think".
- **Differentiation:** "an AI that asks before it speaks" is a clear, demonstrable contrast with assistants that interrupt.
