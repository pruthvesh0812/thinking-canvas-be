---
last-verified: 2026-09-19
verified-against: code in both repos (not docs). BE branch feature/jwt-auth-ownership-checks-2026-09-19T1127 @ 6964a8e; FE branch feature/auth-implementation-2026-09-18T1219 @ ff1d618
stale-after-days: 14
audience: everyone — the claims check. Marketing and support MUST consult this before stating a capability.
---

# Feature Status: What Is Real Today

> **Legend**
> ✅ **Live**: a user can reach it end to end in the running apps.
> 🟡 **Live with caveats**: works, but differs from the design in a way users would notice.
> 🟠 **Built, not reachable**: the code exists, but no user action reaches it.
> 🔴 **Designed, not built**: documented design only.
> ⚪ **Deferred / future**: a captured idea, not scheduled.
>
> **Stage:** pre-launch. Everything below is judged from the code. There is no sign of a production deployment, real users, analytics, or CI in either repo.

---

## Canvas and thinking surface

| Feature | Status | Notes |
|---|---|---|
| Multi-canvas dashboard | ✅ | List, create, rename. No delete (intended for MVP). |
| North-star capture (immutable `original_intent`) | ✅ | Enforced by RLS. There's no edit UI, by design. |
| Create, edit, and delete human nodes | ✅ | Group select (Cmd/Ctrl marquee), group delete with one confirmation |
| Node position and size persistence | ✅ | Since 2026-08-11 |
| Pens: **Logical**, **Question**, **Relate** | ✅ | `relate` added 2026-09-05 |
| `doubt` edge | 🔴 (UI) | In the data model and the design; no pen in the UI |
| `associative` edge | 🔴 | Reserved for AI; nothing produces it |
| Edge bend handles, delete, handle-side persistence | ✅ | |
| Backdrops (Paper / Grid / Blackboard + tints) | ✅ | |
| Phase toggle (diverging ⇄ converging) | 🟡 | Persists to the session, but with the Expander and Stress-Tester unreachable it has no visible effect on AI output |
| Pulsing "AI is reading" debounce indicator | 🟡 | Suggests an incoming response that normal node writing never produces today |
| Sticky notes, toolbox dwell triggers | 🔴 | In the intervention design's action matrix only |

## AI roles

| Role / capability | Status | How it's reached |
|---|---|---|
| **Articulator** (2–3 readings) | ✅ | **Relate** edge between two existing nodes, immediately |
| **Outer Subconscious** | ✅ | **Question** edge, immediately. Not plan-gated (Pro in the design). |
| **Observer**, as Session Complete cards | 🟡 | Runs async at "I'm done" and writes `session_learnings`. Output is flattened to "question"/"contradiction" cards, not the designed interactive structure. Not plan-gated. |
| **Observer** interactive structure (anchors, hover-reveal, per-edge accept/reject, re-think) | 🔴 (UI + route) | The agent can produce and validate structures, and the tables exist, but nothing persists them, there's no `observer-edge-status` route, and there's no UI |
| **Expander** | 🟠 | Only reachable through `/api/intervention/trigger`, which isn't mounted, and the frontend never calls it. **Writing nodes produces no AI response.** |
| **Stress-Tester** | 🟠 | Same as the Expander. The phase latch that enables it is built. |
| **Judge** (maturity + single-best routing) | 🟠 | Built July 2026; on the unreachable path |
| **Attunement layer + phase latch** | 🟠 | Runs only inside the intervention pipeline |
| **Rejection Insights** (negative constraints) | ✅ | Rejecting a context ghost with a reason. Not plan-gated (Pro in the design). |
| Ghost streaming (spawn → chunk → node_type → done) | ✅ | One held-open SSE connection per session; attributed `done` |
| Accept / reject **per node** in a pair | ✅ | |
| Accepted AI nodes enriched as first-class context | ✅ | `ghost.accepted` event |
| **Set aside / restore / delete** AI nodes | ✅ | Set-aside nodes are excluded from all AI reasoning (verified in tools, vector search, serializers) |
| `ignored` ghost status (2 new nodes without interaction) | 🔴 | Typed but never set for ghosts. Receptivity has its own `ignored` response. |
| Velocity-adaptive debounce (8–25s) | 🔴 | Moot while the proactive path is unreachable |

## Intervention layer (consent timer, glow, cards, receptivity)

| Piece | Status |
|---|---|
| Backend: trigger → judge → `waiting` → `waitForEvent` → re-judge → generate → `offer` | 🟠 Built (tasks 01–08); route unmounted |
| Show ruleset (directness + backend-authored headline) | 🟠 |
| Impact Check / canvas-version fingerprint | 🟠 / partial: `canvas-event` deletes and set-asides do emit `canvas/intervention.impact`, and the impact pipeline is registered |
| Receptivity model and offer purge | 🟠 |
| Concurrency / supersession / version guard | 🟠 |
| Frontend: timer ring, pause/now, glow, sidebar card | 🟡 **Demo only**: `use-intervention-demo.ts` drives a mock scenario on a seeded node; `use-ghost-stream.ts` ignores `waiting`/`offer`/`withdraw` |
| Visual spec | ✅ `canvas.html` interaction study in the frontend repo |

## Sessions and memory

| Feature | Status |
|---|---|
| Session start (idempotent, single active session per canvas, returns `session_number`) | ✅ |
| Per-canvas agent memory with session-boundary markers | ✅ |
| "I'm done" → 3-screen Session Complete modal | ✅ |
| Unresolved threads (open question edges, empty nodes, open contradictions) → carry forward / discard | ✅ (the frontend writes carry-forwards directly; the backend ignores `carry_forward_ids`) |
| SessionLanding ("Continue thinking" / browse the past) | ✅ |
| History view / time travel over past sessions | ✅ |
| Open Threads rail | 🟡 Past sessions are real. The live "open threads" list is populated only in mock mode. |

## Accounts, security, billing

| Feature | Status |
|---|---|
| Anonymous-first sign-in | ✅ |
| Google OAuth + email conversion (same user ID) | ✅ *(FE feature branch, unmerged)*; needs Supabase provider configuration per environment |
| Session 2+ requires an account | ✅ *(FE branch)* |
| Account page (verify, password, sign out) | ✅ *(FE branch)* |
| API requires a Supabase JWT + ownership checks | ✅ *(BE feature branch, unmerged; must ship together with the FE token change)* |
| Stripe webhook → subscriptions | ✅ (code); ⚠️ no way to create a subscription |
| Checkout / payment link / upgrade prompt / settings billing | 🔴 |
| Server-side plan enforcement on live paths | 🔴 (only in the unreachable pipeline) |
| Power tier / cognitive profile | ⚪ v1.5 |

## Future (deferred, not scheduled)

| Idea | Where the design lives |
|---|---|
| Branching (fork from any node; rescue superseded AI ideas as branches; re-divergence; per-branch phase) | `.ai/features/branching/story.md` |
| Session branching (fork a new session from a closed one) | `.ai/features/session-branching/story.md` |
| Cognitive profile, thematic patterns | Foundation Principles Part IX |
| Multiplayer / shared canvas (coaches, therapists, teams) | Open; needs real-time collaboration architecture |
| Grounded Outer Subconscious (knowledge graph / GraphRAG) | Open |
| Cross-canvas synthesis | Open |
| Export / sharing a canvas | Not designed anywhere |
| Mobile / touch canvas | Not designed anywhere |
| Onboarding / tutorial for the pens | Not designed anywhere |

---

## What a user can truthfully be told the product does today

> Map your thinking as connected nodes around a fixed goal. Draw a **Question** line when you sense a connection you can't name, and an AI brings a cross-domain perspective plus a question. Draw a **Relate** line between two thoughts, and the AI offers 2–3 ways to articulate the link. Accept, reject (and teach), or ignore every suggestion; nothing joins your map without your click. When you're done, the Observer reviews your whole canvas and surfaces what it noticed, and your unresolved threads carry into your next session.

**Don't claim yet:** "AI expands your ideas as you write", "stress-tests your plan", "knows when you're converging", "asks before it interrupts", "Pro plan", "upgrade", "interactive Observer structures", "branching".
