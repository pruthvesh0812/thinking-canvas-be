---
feature: "inngest-pipelines"
type: task
task_id: task-01
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Implement the main debounced agent pipeline — the 8-step orchestration function that handles all node creation events and fires the correct agent.

## Files to Touch
```
CREATE:
  src/pipeline/agent-pipeline.ts
```

## 8-step implementation (from AGENT-PIPELINE.md)

```typescript
export const agentPipeline = inngest.createFunction(
  {
    id: 'agent-pipeline',
    debounce: { period: '10s', key: 'event.data.session_id' },
  },
  { event: 'canvas/node.created' },
  async ({ event, step }) => {
    // Step 1: Attunement
    const attunement = await step.run('attunement', async () => {
      const recentNodes = await db.nodes.getRecentNodes(event.data.canvas_id, 5)
      return await attunementAgent.generate(/* format nodes for attunement */)
    })

    // Step 2: canAgentFire check
    const canFire = await step.run('guard-check', async () => {
      return canAgentFire(event.data.canvas_id, 'expander', event.data.node_id)
    })
    if (!canFire) return  // drop silently

    // Step 3: Orchestrator → route
    const route = await step.run('orchestrator', async () => {
      const tier = await getSubscriptionTier(event.data.canvas_id)
      const available = getAvailableAgents(tier)
      return await orchestratorAgent.generate(/* attunement + available agents */)
    })

    // Step 4: Build SpawnDescriptor + publish SPAWN
    const descriptor = await step.run('publish-spawn', async () => {
      const d = buildSpawnDescriptor({ ...route, trigger_node_id: event.data.node_id, session_id: event.data.session_id })
      await publishSpawn(event.data.session_id, d)
      return d
    })

    // Step 5: Sleep for ghost animation
    await inngest.sleep('ghost-animation', '1500ms')

    // Step 6: Serialize thread + inject rejection_insights
    const context = await step.run('serialize', async () => {
      const thread = await db.threads.getByCanvas(event.data.canvas_id, route.agent)
      const canvas = await db.canvases.getCanvas(event.data.canvas_id)
      return serialize(thread, route.agent, canvas)
    })

    // Step 7: Stream agent output → Redis chunks
    await step.run('stream-context', async () => {
      const agentStream = await getAgent(route.agent).stream(context)
      await streamAgentOutput(agentStream.textStream, descriptor.context_node.ghost_id, event.data.session_id)
    })

    // Step 8: Publish DONE + save thread + decrement deferrals
    await step.run('finalize', async () => {
      await publishDone(event.data.session_id)
      await db.threads.appendMessage(thread.id, { role: 'assistant', /* ... */ })
      await db.rejectionInsights.decrementTemporalDeferrals(event.data.canvas_id)
    })
  }
)
```

## Depends On
All previous stories: agents, serializer, ghost-streaming, db-layer must be complete.

## Definition of Done
- [ ] Debounce: `period: '10s', key: 'event.data.session_id'`
- [ ] All 8 steps are named `step.run()` blocks
- [ ] `canAgentFire()` called before Orchestrator routing (Step 2)
- [ ] `inngest.sleep('ghost-animation', '1500ms')` between spawn and streaming (Step 5)
- [ ] Rejection insights injected in serialization (Step 6)
- [ ] Pipeline drops silently (returns early) if canAgentFire returns false
