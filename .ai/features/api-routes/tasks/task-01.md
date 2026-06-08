---
feature: "api-routes"
type: task
task_id: task-01
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Implement the POST /api/canvas-event route — the entry point for all user canvas actions. This route generates the directional summary, the embedding, and fires the correct Inngest event.

## Files to Touch
```
CREATE:
  src/routes/canvas-event.ts
```

## Route logic

```
POST /api/canvas-event
Body: canvasEventSchema (canvas_id, session_id, node_id?, edge_id?, event_type)

If node event:
  1. Validate with Zod
  2. Read node from Supabase by node_id
  3. Generate directional summary → gemini-2.5-flash (thinking:low, structured output)
     → nodes.summary + nodes.direction_marker
  4. Generate embedding → gemini-embedding-2 → nodes.embedding (VECTOR 3072)
  5. Update nodes.summary, direction_marker, embedding in Supabase
  6. Append node_id to sessions.node_sequence
  7. Fire Inngest event:
     → canvas/node.created

If edge event:
  1. Validate
  2. Read edge from Supabase by edge_id
  3. Fire Inngest event:
     → both_existing=true, edge_type≠question → canvas/edge.existing-nodes
     → edge_type=question                     → canvas/edge.question
     → otherwise (new node edge)              → canvas/node.created
```

## Directional summary generation

```typescript
// gemini-2.5-flash with structured output (thinking:low)
// Prompt: "Summarize in exactly one sentence.
// Begin with: establishes | questions | contradicts | explores
// Max 15 words after the marker."

// Output: { summary: string, direction_marker: DirectionMarker }
```

## Depends On
`db-layer` task-01 (nodes.ts), `core-types` (Zod schemas), `project-bootstrap` task-02 (inngest singleton).

## Definition of Done
- [ ] POST /api/canvas-event accepts `canvasEventSchema` and rejects invalid input (400)
- [ ] Directional summary generated and written to `nodes.summary` + `nodes.direction_marker`
- [ ] Embedding generated and written to `nodes.embedding` using `gemini-embedding-2`
- [ ] Correct Inngest event fired based on event_type + edge flags
- [ ] `npm run build` compiles
