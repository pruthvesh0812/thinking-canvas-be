---
feature: "agent-implementations"
type: task
task_id: task-03
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Implement Observer and Outer Subconscious — the two deep-thinking agents that use `models.fast()` (gemini-2.5-flash) from `src/lib/llm.ts` with `providerOptions: { google: models.thinking('high') }` (thinkingBudget 8000) passed at call-site.

## Files to Touch
```
CREATE:
  src/agents/observer.ts            → bird's eye spatial map + drift detection
  src/agents/outer-subconscious.ts  → cross-domain associative leap
```

## Observer agent

```typescript
// Model: models.fast() (gemini-2.5-flash) + providerOptions: { google: models.thinking('high') }
// Tools: get_big_picture, get_content, traverse_trail, get_siblings
// Trigger: continuous + Session Complete
// Job: bird's eye spatial map + drift detection vs original_intent (north star)
// Serialization: summaries only for Tier 2+ — never full content (sees everything, briefly)
// Ghost history: own responses only, as summaries
```

Observer outputs: spatial observation about the canvas as a whole. It spots:
- Drift from original_intent (north star)
- Themes emerging across separate branches
- Dead ends or over-compressed areas

At Session Complete: queued observations become suggestions the user can accept or dismiss.

## Outer Subconscious agent

```typescript
// Model: models.fast() (gemini-2.5-flash) + providerOptions: { google: models.thinking('high') }
// Tools: get_content (only — no trail, no window)
// Trigger: question edge drawn between two nodes (edge_type='question')
// Stateless — no thread history (like Articulator)
// Job: cross-domain associative leap across all human knowledge
// Output: pattern | reference | reframe + a question node
```

Outer Subconscious is the most creative agent. It receives:
- The node at the start of the question edge
- The unlabeled question edge itself
- No thread history — pure associative reasoning

## High thinking config

```typescript
import { models } from '../lib/llm.js'

// model instance — thinking OFF by default
model: models.fast()

// at call-site (stream/generate options) — thinkingBudget: 8000 ('high')
providerOptions: { google: models.thinking('high') }
```

## Depends On
task-02 must be complete (parallel agents — can implement simultaneously, but same story).

## Definition of Done
- [ ] Both agents use `models.fast()` with `providerOptions: { google: models.thinking('high') }` passed at call-site
- [ ] Observer serialization receives summary-only view of Tier 2+ (enforced by serializer rules)
- [ ] Outer Subconscious is stateless — `threadType: 'stateless'` in serializer rules
- [ ] System prompts are constants
- [ ] `npm run build` compiles
