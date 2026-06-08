---
feature: "inngest-pipelines"
type: task
task_id: task-03
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Implement the Rejection Insights pipeline (processes ghost rejections into negative constraints) and the Session Complete pipeline (queues Observer observations for human review).

## Files to Touch
```
CREATE:
  src/pipeline/rejection-insights.ts
  src/pipeline/session-complete.ts
```

## rejection-insights.ts

```typescript
export const rejectionInsightsPipeline = inngest.createFunction(
  { id: 'rejection-insights' },  // immediate — no debounce
  { event: 'canvas/ghost.rejected' },
  async ({ event, step }) => {
    // Step 1: Classify rejection with gemini-2.5-flash (thinking:low)
    const insight = await step.run('classify', async () => {
      // Call rejection insights agent (or direct Gemini call with structured output)
      // Input: event.data.rejected_ghost_content + event.data.rejection_reason
      // Output: { severity: 'hard_block'|'approach_pivot'|'temporal_deferral', insight_points[] }
    })

    // Step 2: Save to rejection_insights table
    const savedInsight = await step.run('save-insight', async () => {
      return db.rejectionInsights.createInsight({
        canvas_id: event.data.canvas_id,
        session_id: event.data.session_id,
        thread_id: event.data.thread_id,
        rejection_reason: event.data.rejection_reason,
        severity: insight.severity,
        insight_points: insight.insight_points,
        turns_remaining: insight.severity === 'temporal_deferral' ? 3 : null,
        active: true,
      })
    })

    // Step 3: Append insight ID to agent_thread.active_rejection_insight_ids
    await step.run('update-thread', async () => {
      const thread = await db.threads.getByCanvas(event.data.canvas_id, event.data.agent_role)
      const updated = [...(thread.active_rejection_insight_ids ?? []), savedInsight.id]
      await db.threads.updateActiveInsights(thread.id, updated)
    })
  }
)
```

## session-complete.ts

```typescript
export const sessionCompletePipeline = inngest.createFunction(
  { id: 'session-complete' },
  { event: 'canvas/session.completed' },
  async ({ event, step }) => {
    // Step 1: Run Observer to generate queued observations
    const observations = await step.run('observer-pass', async () => {
      const thread = await db.threads.getByCanvas(event.data.canvas_id, 'observer')
      const canvas = await db.canvases.getCanvas(event.data.canvas_id)
      const context = await serialize(thread, 'observer', canvas)
      return await observerAgent.generate(context)  // structured output — not streamed at session complete
    })

    // Step 2: Save observations to session_learnings (user reviews them in 3-screen flow)
    await step.run('save-observations', async () => {
      for (const obs of observations.items) {
        await db.sessionLearnings.create({
          canvas_id: event.data.canvas_id,
          session_id: event.data.session_id,
          content: obs.content,
          type: obs.type,
        })
      }
    })

    // Step 3: Close session
    await step.run('close-session', async () => {
      await db.sessions.closeSession(event.data.session_id)
    })
  }
)
```

## Depends On
task-01 + task-02. Agents: Observer (task-03) for session-complete. DB layer for rejection_insights.

## Definition of Done
- [ ] `rejection-insights` pipeline classifies and saves to DB within named steps
- [ ] Insight IDs correctly appended to `agent_thread.active_rejection_insight_ids`
- [ ] `session-complete` pipeline runs Observer and saves to `session_learnings`
- [ ] Session marked `status='closed'` after completion
- [ ] Both pipelines are immediate (no debounce)
- [ ] `npm run build` compiles
