---
feature: "intervention-spectrum"
type: task
task_id: task-04
story: ../story.md
created: 2026-07-05
status: draft
---

## Scope
The **decide → wait → generate** handshake: restructure the pipeline to judge →
publish `waiting` → `step.waitForEvent` → re-judge-if-changed → generate/stream.
Adds the offer publishers, the offers DB helpers, and the intervention route.
See DESIGN.md §2, §4d, §4f.

## Files to Touch
```
CREATE:
  src/streaming/offer.ts        → publishWaiting / publishOffer / publishWithdraw
  src/db/intervention-offers.ts → create/read/update offers (seq via task-05 helper)
  src/routes/intervention.ts    → POST /trigger, /process, /dismiss
MODIFY:
  src/pipeline/agent-pipeline.ts → the handshake (below)
  src/index.ts                   → register the intervention route + (renamed) pipeline
  src/lib/inngest.ts / types     → events canvas/intervention.trigger, canvas/intervention.process
```

## Pipeline shape (Inngest)
```typescript
// trigger: canvas/intervention.trigger
const decision = await step.run('judge', () => runJudge(...))            // task-03
if (!decision.mature) return                                             // silent "no pipeline"

const offer = await step.run('create-offer', () => createOffer({        // status='waiting'
  ...decision, seq, context_fingerprint,                                 // seq via task-05
}))
await step.run('publish-waiting', () => publishWaiting(session_id, offer))

const go = await step.waitForEvent('go', {
  event: 'canvas/intervention.process',
  timeout: '10m',                                                        // hard timeout
  match: 'data.offer_id',
})
if (!go) { await expireAndWithdraw(offer); return }                      // abandoned tab

// re-judge if the canvas fingerprint moved during the wait (DESIGN §4d)
// version guard: offer.seq must still be latest before publishing (task-05)
await step.run('generate', () => /* buildSpawnDescriptor + stream (existing) */)
await step.run('show', () => /* set directness + headline (task-07), publish */)
```

## Depends On
task-01 (types / offers table / RedisMessage), task-03 (judge). Version guard +
seq allocation come from task-05; show ruleset from task-07 (stub directness first).

## Definition of Done
- [ ] `canvas/intervention.trigger` → judge → (mature) create offer(`waiting`) + publish `waiting`
- [ ] `step.waitForEvent` with a hard **timeout**; on timeout → withdraw + `expired`
- [ ] `canvas/intervention.process` resumes → generate + stream (reuses spawn/tokens)
- [ ] Re-judge when `context_fingerprint` changed at wake
- [ ] `POST /trigger` `/process` `/dismiss` registered in `src/index.ts`
- [ ] `npm run build` compiles
