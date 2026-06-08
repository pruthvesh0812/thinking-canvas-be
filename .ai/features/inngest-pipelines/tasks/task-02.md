---
feature: "inngest-pipelines"
type: task
task_id: task-02
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Implement two immediate pipelines that bypass attunement and orchestrator: the Articulator pipeline (edge between existing nodes) and the Outer Subconscious pipeline (question edge).

## Files to Touch
```
CREATE:
  src/pipeline/articulator-pipeline.ts
  src/pipeline/outer-sub-pipeline.ts
```

## articulator-pipeline.ts

```typescript
export const articulatorPipeline = inngest.createFunction(
  { id: 'articulator-pipeline' },  // no debounce
  { event: 'canvas/edge.existing-nodes' },
  async ({ event, step }) => {
    // No Attunement, no Orchestrator
    // Direct: Articulator agent → spawn → stream

    // Step 1: canAgentFire check (still required)
    const canFire = await step.run('guard', async () =>
      canAgentFire(event.data.canvas_id, 'articulator', event.data.edge_id))
    if (!canFire) return

    // Step 2: Build descriptor + publish spawn
    const descriptor = await step.run('publish-spawn', async () => {
      const d = buildSpawnDescriptor({
        trigger_node_id: event.data.from_node_id,
        session_id: event.data.session_id,
        agent_role: 'articulator',
        context_node_type: 'reframe',  // Articulator picks the type
        has_question_node: false,
      })
      await publishSpawn(event.data.session_id, d)
      return d
    })

    await inngest.sleep('ghost-animation', '1500ms')

    // Step 3: Serialize (stateless — both endpoint nodes only)
    const context = await step.run('serialize', async () => {
      const fromNode = await db.nodes.getNode(event.data.from_node_id)
      const toNode = await db.nodes.getNode(event.data.to_node_id)
      return serialize(null, 'articulator', null, { fromNode, toNode })
    })

    // Step 4: Stream + done
    await step.run('stream', async () => {
      const stream = await articulatorAgent.stream(context)
      await streamAgentOutput(stream.textStream, descriptor.context_node.ghost_id, event.data.session_id)
      await publishDone(event.data.session_id)
    })
  }
)
```

## outer-sub-pipeline.ts

Same pattern as articulator but:
- Event: `canvas/edge.question`
- Agent: `outerSubconsciousAgent`
- Stateless — receives question edge source node + edge context
- Has question node: `true` (always produces a question)
- Stream both context node AND question node tokens

## Depends On
task-01 must be complete. Agents task-02 (Articulator) and task-03 (Outer Sub) must be complete.

## Definition of Done
- [ ] Both pipelines have no debounce
- [ ] Both call `canAgentFire()` before proceeding
- [ ] Both skip Attunement and Orchestrator
- [ ] `inngest.sleep('ghost-animation', '1500ms')` present in both
- [ ] Outer Sub pipeline streams both context + question node tokens
- [ ] `npm run build` compiles
