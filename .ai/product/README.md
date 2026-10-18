---
last-verified: 2026-09-19
verified-against: both repos (thinking-canvas-be @ feature/jwt-auth-ownership-checks, thinking-canvas-frontend @ feature/auth-implementation) — code, migrations, git history, and every .ai/ doc
stale-after-days: 30
audience: every AI agent and human working on ThinkingCanvas — engineering, product, marketing, sales, support, design, investors
---

# ThinkingCanvas — Product Context (start here)

> **This folder is the single source of product truth for ThinkingCanvas.**
> It explains *what the product is, why it exists, how it works (frontend and
> backend), who it is for, what is actually live, where it is weak, and what
> could kill it.* It is written for **any** agent, not just engineers.
>
> Engineering-level detail (code paths, schemas, contracts) lives in
> `.ai/context/` (backend) and the frontend repo's `.ai/context/`. This folder
> points into those, but it never requires them. A marketing or support agent can
> work from this folder alone.

---

## How to use this folder (for AI agents)

1. **Always load** [`00-product-at-a-glance.md`](./00-product-at-a-glance.md). It is one page
   and gives you enough to avoid saying anything wrong about the product.
2. Then load **only** the files your task needs, using the routing table below.
3. **Before you claim a feature exists**, check [`03-status/feature-status.md`](./03-status/feature-status.md).
   The product vision is ahead of the code. Promising a designed-but-unbuilt feature to a
   customer or in marketing copy is the most likely way to cause harm with this context.
4. Use the exact words from [`01-foundation/glossary.md`](./01-foundation/glossary.md). The vocabulary is part
   of the product.

---

## Routing table: what to load for your job

| If you are… / your task is… | Load (in addition to `00-product-at-a-glance.md`) |
|---|---|
| **Marketing**: copy, campaigns, landing page, social, launch | `01-foundation/vision-and-intent.md` · `04-market/positioning-and-messaging.md` · `04-market/audiences-and-use-cases.md` · `03-status/feature-status.md` (claims check) |
| **Marketing**: competitive / battlecard | `04-market/positioning-and-messaging.md` · `04-market/competitive-landscape.md` |
| **Customer support**: answering users, troubleshooting | `06-playbooks/customer-support.md` · `02-how-it-works/user-experience.md` · `03-status/feature-status.md` · `02-how-it-works/accounts-and-plans.md` |
| **Sales / partnerships / investor narrative** | `01-foundation/vision-and-intent.md` · `04-market/*` · `05-risks/killers.md` |
| **Product / roadmap / prioritisation** | `01-foundation/principles.md` · `03-status/*` · `05-risks/*` |
| **Design / UX** | `01-foundation/principles.md` · `02-how-it-works/user-experience.md` · `02-how-it-works/intervention-model.md` |
| **Engineering**: any task (before the engineering docs) | `01-foundation/principles.md` · `02-how-it-works/system-architecture.md` · `03-status/known-gaps.md`, then the repo's `CLAUDE.md` |
| **Prompt / agent behaviour work** | `01-foundation/principles.md` · `02-how-it-works/ai-roles.md` · `02-how-it-works/intervention-model.md` |
| **Pricing / billing / plans** | `02-how-it-works/accounts-and-plans.md` · `05-risks/killers.md` (economics) |
| **Risk review / strategy / "should we build X?"** | `01-foundation/principles.md` · `05-risks/loopholes.md` · `05-risks/killers.md` |
| **Writing any user-facing text** | `01-foundation/glossary.md` · `04-market/positioning-and-messaging.md` (voice section) |
| **Maintaining this folder** | `06-playbooks/for-ai-agents.md` |

---

## The hierarchy

```
.ai/product/
├── README.md                          ← you are here: entry point + routing
├── 00-product-at-a-glance.md          ← ALWAYS LOAD. One page. Pitch, facts, status, red lines.
│
├── 01-foundation/                     WHY — the invariants. Changes rarely.
│   ├── vision-and-intent.md           the problem (cognitive atrophy), the intent, the origin, the bet
│   ├── principles.md                  prime directive, ownership split, the principle set, 3 pillars
│   └── glossary.md                    canonical vocabulary + words to never use
│
├── 02-how-it-works/                   WHAT & HOW. Product-level, FE + BE.
│   ├── user-experience.md             the full user journey, screen by screen, gesture by gesture
│   ├── ai-roles.md                    the 5 AI roles + infrastructure (attunement, judge, learning)
│   ├── intervention-model.md          WHEN and HOW LOUDLY the AI speaks (consent gates, timer, glow)
│   ├── system-architecture.md         how FE and BE fit together; stack, data model, pipelines
│   └── accounts-and-plans.md          anonymous-first auth, sign-up, tiers, pricing, billing
│
├── 03-status/                         WHAT IS REAL TODAY. Changes often; re-verify.
│   ├── feature-status.md              live / built-but-unreachable / designed / deferred
│   └── known-gaps.md                  verified bugs and gaps, with severity + fix pointers
│
├── 04-market/                         WHO & WHY THEY'D CARE.
│   ├── audiences-and-use-cases.md     ICPs, jobs-to-be-done, detailed scenarios, anti-personas
│   ├── positioning-and-messaging.md   category, pillars, voice, approved/forbidden claims
│   └── competitive-landscape.md       alternatives, how we differ, where we lose
│
├── 05-risks/                          WHERE IT BREAKS.
│   ├── loopholes.md                   design, UX, technical, and business weaknesses in the product
│   └── killers.md                     existential threats, early-warning signals, mitigations
│
└── 06-playbooks/                      HOW TO ACT.
    ├── customer-support.md            FAQs, troubleshooting trees, tone, escalation, don't-promise list
    └── for-ai-agents.md               rules for any AI agent on ThinkingCanvas + how to keep this folder true
```

**Isolation rule:** each file stands on its own. Cross-references exist to help you go
deeper, but a file never *depends* on another one to be understood. This lets an agent load
one file and act on it.

**Stability gradient:** `01-foundation` is the most stable layer and `03-status` is the most
volatile. When two files disagree, trust `03-status` about *what exists* and
`01-foundation` about *what should exist*.

---

## Relationship to the other docs

| Doc | Role | Relationship to this folder |
|---|---|---|
| `.ai/context/references/ThinkingCanvas_FoundationPrinciples.md` | Long-form philosophy, v0.1 (2026-06-21) | This folder condenses it and brings it up to date. Its technical parts predate the judge, which has replaced the Orchestrator. |
| `.ai/context/*.md` (backend) | Engineering context, one file per concern | Load it for code work. This folder gives you the product-level "why" first. |
| `.ai/context/intervention-layer/` | Canonical engineering spec of the intervention layer | `02-how-it-works/intervention-model.md` is its product-level summary. |
| `.ai/context/FRONTEND-CONTRACT.md` | FE↔BE integration contract | `02-how-it-works/system-architecture.md` summarises it. |
| `.ai/features/*/story.md` | Build plans per feature | `03-status/feature-status.md` records which ones actually landed. |
| Frontend repo `.ai/context/*.md` | FE engineering context | Same as the backend engineering docs. |
| Frontend repo `canvas.html` | Interactive UX study: "When the AI raises its hand" | The visual reference for `intervention-model.md`. |
