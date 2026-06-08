---
feature: "inngest-pipelines"
type: story
created: 2026-06-09
status: draft
---

## What
Implement all 5 Inngest pipeline functions in `src/pipeline/` — the durable, debounced agent orchestration functions that wire attunement → routing → streaming → thread persistence.

## Why
The pipelines are the backbone of the system. They receive canvas events, debounce user activity, route to the correct agent, publish the ghost streaming protocol to Redis, and persist the thread to Supabase. Without them, no AI responses are generated.

## Blast Radius
| Component | Impact |
|---|---|
| `src/pipeline/agent-pipeline.ts` | Main debounced pipeline — all user node creation |
| `src/pipeline/articulator-pipeline.ts` | Immediate — edge between existing nodes |
| `src/pipeline/outer-sub-pipeline.ts` | Immediate — question edge drawn |
| `src/pipeline/rejection-insights.ts` | Immediate — ghost rejection processed |
| `src/pipeline/session-complete.ts` | Triggered by session complete API |
| `src/index.ts` | Must register all functions in Inngest serve handler |

## Files to Touch
```
CREATE:
  src/pipeline/agent-pipeline.ts
  src/pipeline/articulator-pipeline.ts
  src/pipeline/outer-sub-pipeline.ts
  src/pipeline/rejection-insights.ts
  src/pipeline/session-complete.ts

MODIFY:
  src/index.ts  → add all 5 functions to serve({ functions: [...] })
```

## agent-pipeline.ts Step Order (from AGENT-PIPELINE.md)

```
Event:  canvas/node.created
Debounce: 10s by session_id

Step 1: Attunement (gemini-2.5-flash, thinking:OFF)
Step 2: canAgentFire() — drop silently if pending ghost
Step 3: Orchestrator → { route, question_style }
Step 4: buildSpawnDescriptor + redis.publish(SPAWN)
Step 5: inngest.sleep('ghost-animation', '1500ms')
Step 6: serialize(thread, agentRole) + inject rejection_insights
Step 7: agent.stream() → redis.publish(CHUNK) per token
Step 8: redis.publish(DONE) + appendMessage to thread + decrement deferrals
```

## Immediate Pipelines

| Pipeline | Event | Skips | Agent |
|---|---|---|---|
| articulator-pipeline | `canvas/edge.existing-nodes` | Attunement + Orchestrator | Articulator direct |
| outer-sub-pipeline | `canvas/edge.question` | Attunement + Orchestrator | Outer Subconscious direct |
| rejection-insights | `canvas/ghost.rejected` | All routing | Rejection Insights Engine |
| session-complete | `canvas/session.completed` | All routing | Observer (queued observations) |

## rejection-insights pipeline steps

```
Step 1: Load rejected ghost content + reason from event
Step 2: gemini-2.5-flash classify → { severity, insight_points[] }
Step 3: Insert into rejection_insights table
Step 4: Append insight IDs to agent_thread.active_rejection_insight_ids
```

## Supabase Migration
No.

## Inngest Events

| Event name | Fired from |
|---|---|
| `canvas/node.created` | POST /api/canvas-event route |
| `canvas/edge.existing-nodes` | POST /api/canvas-event route |
| `canvas/edge.question` | POST /api/canvas-event route |
| `canvas/ghost.rejected` | POST /api/ghost-status route |
| `canvas/session.completed` | POST /api/session/complete route |

## Risks
- ALL Supabase writes must be inside named `step.run()` blocks — never outside
- `canAgentFire()` must run BEFORE Orchestrator routing, not after
- `inngest.sleep()` syntax: `await inngest.sleep('name', '1500ms')` (not `step.sleep`)
- Fetch https://www.inngest.com/llms.txt before implementing for current API

## Task Breakdown
- **task-01:** agent-pipeline.ts (main debounced — Steps 1-8)
- **task-02:** articulator-pipeline.ts + outer-sub-pipeline.ts (immediate, skip routing)
- **task-03:** rejection-insights.ts + session-complete.ts
