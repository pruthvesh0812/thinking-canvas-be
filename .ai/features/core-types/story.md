---
feature: "core-types"
type: story
created: 2026-06-09
status: draft
---

## What
Create `types/index.ts` with all shared TypeScript types, and the Zod validation schemas for all API route inputs.

## Why
Every layer — DB, agents, pipelines, routes — imports from `types/index.ts`. Without shared types, each file defines its own, causing drift and duplication (a non-negotiable violation per CODING-STANDARDS.md).

## Blast Radius
| Component | Impact |
|---|---|
| `types/index.ts` | Single source of truth — all other src files import from here |
| All routes, pipelines, agents | Import types from here — no local definitions |

## Files to Touch
```
CREATE:
  types/index.ts   → all shared types + Zod schemas
```

## Types to Define

```typescript
// Enums
type AgentRole = 'expander' | 'stress_tester' | 'observer' | 'outer_subconscious' | 'articulator'
type ContextNodeType = 'reframe' | 'mirror' | 'pattern' | 'reference' | 'contradiction' | 'appreciation'
type EdgeType = 'logical' | 'doubt' | 'question' | 'associative'
type DirectionMarker = 'establishes' | 'questions' | 'contradicts' | 'explores'
type GhostStatus = 'pending' | 'accepted' | 'rejected' | 'context_accepted' | 'question_accepted' | 'ignored'
type RejectionReason = 'too_abstract' | 'too_technical' | 'skip_for_now'
type InsightSeverity = 'hard_block' | 'approach_pivot' | 'temporal_deferral'
type CognitiveMode = 'exploratory' | 'transitional' | 'declarative'
type SessionPhase = 'diverging' | 'converging'

// Core domain types
type Canvas, Session, Node, Edge

// Agent thread types
type ThreadMessage, AgentThread

// Streaming types
type SpawnDescriptor, RedisMessage (spawn | chunk | done)

// Rejection types
type RejectionInsight, InsightPoint

// API payload types (Zod schemas for route validation)
const canvasEventSchema, ghostStatusSchema, sessionStartSchema, sessionCompleteSchema
```

## Supabase Migration
No.

## Inngest Events
No.

## Risks
- Types must match the DB schema from `database-foundation` story exactly
- `SpawnDescriptor` shape is contract with frontend — any change breaks streaming

## Task Breakdown
NONE — implement directly from this story. Load CANVAS-SYNC.md (for SpawnDescriptor + RedisMessage), CORE-CONCEPTS.md (for domain model), AGENT-PIPELINE.md (for thread message shape) before writing.
