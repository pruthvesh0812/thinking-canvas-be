---
last-verified: 2026-09-19
stale-after-days: 60
audience: founder, strategy, investors, product prioritisation — and any agent asked "should we build X?"
---

# Killers: What Could Kill ThinkingCanvas

> A **killer** is a threat that, left alone, ends the product. It isn't a bug but a way the whole bet could fail. Each entry has **why it's lethal**, **early-warning signals** (what to measure), and **mitigations**. Ranked by likelihood × severity at the current stage (pre-launch, September 2026).
>
> ⚠️ Almost every early-warning signal below **can't be measured today** because there's no telemetry (known gap #5). Fixing that is itself a top mitigation.

---

## K1. Users never feel the click: the value doesn't land in session one
**Likelihood: high · Severity: fatal**

- **Why it's lethal:** The product's value only exists *inside* a real thinking session, and the ideal first session lands at least one moment where an AI nudge opens something the user couldn't see. Today the proactive AI doesn't fire (gap #1), so a new user who writes nodes gets **a blank whiteboard with a locked goal**. Many will leave before discovering the Question and Relate pens, and a product about "the click" can't survive users who never click.
- **Early-warning signals:** % of first sessions with at least 1 ghost shown · % with at least 1 ghost accepted · time to first ghost · session-1 → session-2 return rate · % of users who ever draw a Question or Relate edge.
- **Mitigations:** fix gap #1 first; a guided first canvas that invites one Question edge within 60 seconds; optimise time to first ghost; demo scenarios built on the user's own problem.

## K2. The effort paradox: people don't want to think harder
**Likelihood: medium-high · Severity: fatal**

- **Why it's lethal:** The value proposition is *more cognitive work, done better*. Most software wins by removing effort, and the market has spent three years learning that AI means less effort. If the target users feel ThinkingCanvas is **homework**, they'll return to the chatbot that just answers, even while agreeing with the philosophy. Agreement isn't adoption.
- **The two ways it fails:**
  1. **Too much friction:** every contribution demands work, and users feel drained. Churn.
  2. **Too little friction:** the product relaxes, lets users rubber-stamp, and becomes an answer machine with extra steps (loophole A1). It then loses to real answer machines.
- **Early-warning signals:** sessions per week per active user · median session length trending down · "can it just…?" feedback · acceptance rate climbing above ~70% with time-to-accept falling (drifting toward an answer machine) · rejection rate above ~80% (too far or too much).
- **Mitigations:** target users whose *job* is thinking (founders, strategists), where the effort is the work they already do; make the effort **feel good** through momentum, visible progress, and appreciation moments; lead marketing with the *arrival* ("you figured it out") rather than the effort; keep the ideal band (users reject some, accept some, build on what they accept) as the core product health metric.

## K3. The nudges aren't good enough: generic, obvious, or wrong
**Likelihood: high · Severity: fatal**

- **Why it's lethal:** The entire product experience is a handful of AI contributions per session. With so few interactions, **each one carries the brand**. A generic reframe ("Have you considered the user's perspective?") or a confidently wrong **reference** (a named concept that doesn't exist, or doesn't mean that) destroys trust faster than a chatbot's error does, because the product *claims* to be a thoughtful partner. Content roles run on the cheapest model (flash-lite), and the 1–2 jump rule is unmeasured (loophole A8).
- **Early-warning signals:** rejection reasons by role (a spike in "too abstract" means distance is off; repeated rejections mean it's generic) · ghosts ignored entirely · qualitative "that was obvious" feedback · Langfuse eval scores.
- **Mitigations:** build an eval set now (real canvases with rated nudges); run A/B tests on content models (flash-lite vs flash) per role, since quality may be worth the cost here; ground or soften `reference` claims; treat prompts as core product, with versioning and evaluation, not as config.

## K4. Commoditisation: a frontier lab or incumbent ships "Socratic canvas mode"
**Likelihood: medium · Severity: high**

- **Why it's lethal:** OpenAI, Anthropic, Google, Miro, or Notion could ship a spatial canvas where the AI asks rather than answers, as a *feature*, to hundreds of millions of existing users. Distribution beats philosophy. The individual pieces (ghosts, question prompts) are easy to copy.
- **Early-warning signals:** incumbent announcements of "thinking partner" or "Socratic" modes, canvas features in chat products, or tutor modes spreading beyond education.
- **Mitigations:** the moat is **commitment and compounding**, not features. Specifically: the per-canvas learning loop (rejection insights, receptivity, the future cognitive profile) gets better with every session; the trail data model; the gesture language; and a brand that *means* "you stay the author". Move fast on the cognitive profile once there's data. Consider integrations (bring your thinking from Notion or Obsidian) rather than competing on storage.

## K5. Unit economics: the thinking AI costs more than $19
**Likelihood: medium · Severity: high**

- **Why it's lethal:** Each event can mean several model calls: a summary plus an embedding per node; attunement plus a **high-thinking judge** per trigger; high-thinking Outer Subconscious and Observer calls; content generation. There's a free tier, frictionless anonymous accounts, **no rate limits, and no plan enforcement** (loophole B1). One abusive script, or a popular free tier, can outspend revenue. Gemini pricing is outside our control.
- **Early-warning signals:** cost per active user per week · cost per session · the share of cost from free users · judge-call vs generation ratio (lazy generation should keep generation well below trigger count).
- **Mitigations:** rate limits and plan gates before any public launch; the intervention model's lazy generation (a timer nobody approves costs one judge call, not a generation) is the structural cost control, so ship it; cache judge verdicts on an unchanged canvas (already built via the fingerprint); cap free-tier usage per day.

## K6. Philosophical drift: becoming just another AI whiteboard
**Likelihood: medium · Severity: fatal to differentiation**

- **Why it's lethal:** Every short-term pressure pushes toward abandoning the Prime Directive. Users asking "just summarise it", investors asking for "AI-generated maps", demos that need to look impressive, and competitors filling screens with output all pull the same way. Each concession seems small. Together they turn ThinkingCanvas into Miro-AI-lite, competing on features against companies with 1000× the distribution.
- **Early-warning signals:** roadmap items that pass the "is it useful?" test but fail the "does it make the human think more?" test; features that add AI *output* rather than *prompts for thought*; copy that says "generate".
- **Mitigations:** `01-foundation/principles.md` is the constitution, so run every proposal through it; reshape rather than reject (e.g. "export *my* outline" instead of "AI writes the doc"); keep this file and the principles loaded in every product agent's context.

## K7. Building the cathedral before the congregation
**Likelihood: high (currently observed) · Severity: high**

- **Why it's lethal:** Pre-launch, the codebase has sophisticated machinery: a judge, a consent-timer handshake, receptivity with half-life decay, version guards, an Impact Check, and Observer DAG validation. Much of it is **unreachable by users**, and there's **no telemetry to learn whether any of it matters**. Meanwhile the basics of a launchable product are missing: billing, rate limits, merged auth, onboarding, and deployment. Time spent perfecting unvalidated mechanisms is time not spent learning whether anyone wants the core loop. It's a runway and motivation risk.
- **Early-warning signals:** weeks since the last real user session · the ratio of design-doc commits to user-facing shipped changes · features merged but unreachable.
- **Mitigations:** define the smallest launchable loop (gap #1 fix, auth merge, rate limits, onboarding for the pens, basic telemetry, Stripe Payment Link) and **put it in front of 10–20 target users**. Use them, not documents, to decide which of the designed layers to ship next. The session-branching story's own advice applies: *dogfood the product on its own hardest problem.*

## K8. A trust or privacy failure
**Likelihood: low-medium · Severity: fatal**

- **Why it's lethal:** Users put their **most sensitive, unfinished strategic thinking** into ThinkingCanvas: pivots, client problems, personal decisions. Any leak, or any perception that the thinking is used to train models or is read by others, ends the relationship permanently, and word travels among founders and consultants. Today `main` has an unauthenticated API where SSE streams are readable by UUID (loophole B5). Node content is sent to Google's API. No privacy policy or data terms exist in the repos.
- **Early-warning signals:** security review findings; user questions about data use; enterprise or consultant prospects asking for a DPA.
- **Mitigations:** merge the auth branches before any public exposure; publish clear data terms (what's sent to Gemini, retention, no-training settings in the provider agreement, verified with legal); a data export and deletion path; treat "your thinking is yours" as a *security* promise, not just a philosophical one.

## K9. Single-user in a collaborative world
**Likelihood: medium · Severity: medium-high**

- **Why it's lethal:** Budgets for knowledge-work tools increasingly sit with teams, and team tools spread virally. A single-user tool has to win every user individually (loophole C3) and can't enter team budgets. Multiplayer is also architecturally hard here: there's no Realtime by design, and the per-canvas threads, receptivity, and consent model all assume one mind.
- **Mitigations:** keep individual depth as the wedge (people think alone first); add **sharing a trail** (read-only replay) before real-time collaboration; design multiplayer as "one thinker, invited observers" before "many editors".

## K10. Execution bandwidth and bus factor
**Likelihood: medium · Severity: high**

- **Why it's lethal:** Git history shows one human author across both repos, with AI agents writing most commits. That's a force multiplier, but also concentration risk. Architectural knowledge sits in one person plus documents (hence this folder). Scope (5 agents, 2 repos, an intervention layer, and deferred branching) is large relative to capacity.
- **Mitigations:** ruthless scope focus (K7); keep this context folder and the engineering docs *true*, since they are the institutional memory; favour reversible, simple choices.

---

## The product-health metric set (instrument these first)

| Metric | Healthy band (initial hypothesis) | Guards against |
|---|---|---|
| First-session ghost shown | ≥ 80% of first sessions | K1 |
| Time to first ghost | < 3 minutes | K1 |
| Session 1 → session 2 return (same canvas) | ≥ 30% | K1, K2 |
| Ghost acceptance rate | ~30–60% | K2 (too high means rubber-stamping; too low means bad nudges) |
| Build-on rate (a human node follows an accepted AI node) | ≥ 50% of acceptances | K2, loophole A1 |
| Rejection reasons by role | no single role above 50% "too abstract" | K3 |
| Model cost per active user per week | < 20% of the plan price | K5 |
| Session Complete rate | ≥ 40% of sessions | loophole A4 |

These are hypotheses to be replaced by real baselines. The data mostly exists already (`agent_threads` ghost-pair statuses, `ai_contributions`, `sessions`, `rejection_insights`); what's missing is aggregation and event capture on the frontend.
