import { serialize } from '../src/serializer/index.js'
import { serializeJudgeContext } from '../src/serializer/index.js'
import { buildNeighborhoodBlock } from '../src/serializer/neighborhood.js'
import { getCanvas } from '../src/db/canvases.js'
import { getNode } from '../src/db/nodes.js'
import { getOrCreateThread } from '../src/db/threads.js'
import { getEdge } from '../src/db/edges.js'
import type { AgentRole, AgentThread } from '../types/index.js'

// ─────────────────────────────────────────────────────────────────────────
// Prints the serialized CONTEXT an agent reasons on — the user-message half
// of its input. (The system prompt and any in-loop tool results are NOT here;
// for the complete model input including those, read the Langfuse trace.)
//
//   npx tsx --env-file=.env scripts/inspect-context.ts <canvas_id> <agent_role>
//   npx tsx --env-file=.env scripts/inspect-context.ts <canvas_id> judge [trigger_node_id]
//   npx tsx --env-file=.env scripts/inspect-context.ts <canvas_id> articulator --edge <edge_id>
//
// agent_role: expander | stress_tester | observer | outer_subconscious |
//             articulator | judge
//
// Default: serializes the agent's CURRENT thread as it stands in the DB.
// --edge <id> (articulator only): simulates the pipeline's next run for that
//   edge — builds the neighbourhood + the canvas_event turn the way
//   articulator-pipeline.ts would — so you can preview a trigger before drawing it.
// ─────────────────────────────────────────────────────────────────────────

const BAR = '═'.repeat(78)

function frame(title: string, body: string): string {
  return `\n${BAR}\n  ${title}\n${BAR}\n${body}\n`
}

async function main() {
  const [canvas_id, roleArg, ...rest] = process.argv.slice(2)
  if (!canvas_id || !roleArg) {
    console.error('usage: inspect-context <canvas_id> <agent_role> [trigger_node_id | --edge <edge_id>]')
    process.exit(1)
  }

  const canvas = await getCanvas(canvas_id)

  // Judge has no thread — its own full-canvas context builder.
  if (roleArg === 'judge') {
    const triggerNodeId = rest[0]
    const ctx = await serializeJudgeContext(canvas, triggerNodeId)
    console.log(frame(`JUDGE CONTEXT — canvas ${canvas_id.slice(0, 8)} "${canvas.title}"`, ctx))
    console.log(`\n[${ctx.length} chars]`)
    return
  }

  const role = roleArg as AgentRole

  // Articulator --edge: simulate the next run for a specific edge.
  const edgeFlag = rest.indexOf('--edge')
  if (role === 'articulator' && edgeFlag !== -1) {
    const edge_id = rest[edgeFlag + 1]
    const edge = await getEdge(edge_id)
    const from_node_id = edge.from_node_id
    const to_node_id = edge.to_node_id

    const [fromNode, toNode, neighborhood, thread] = await Promise.all([
      getNode(from_node_id),
      getNode(to_node_id),
      buildNeighborhoodBlock({ canvas_id, from_node_id, to_node_id }),
      getOrCreateThread(canvas_id, 'articulator'),
    ])
    const content = [
      'Edge drawn connecting two existing nodes.',
      `FROM [${from_node_id}]: "${fromNode.content ?? fromNode.summary ?? ''}"`,
      `TO [${to_node_id}]: "${toNode.content ?? toNode.summary ?? ''}"`,
      ...(neighborhood ? ['', neighborhood] : []),
    ].join('\n')

    // Clone the real thread and append the simulated turn (does NOT write to DB).
    const simulated: AgentThread = {
      ...thread,
      messages: [
        ...thread.messages,
        { role: 'user', turn_type: 'canvas_event', node_id: from_node_id, content, timestamp: new Date().toISOString() },
      ],
    }
    const ctx = await serialize(simulated, 'articulator', canvas, { triggerEdgeId: edge_id })
    console.log(frame(`ARTICULATOR CONTEXT (simulated for edge ${edge_id.slice(0, 8)})`, ctx))
    console.log(`\n[${ctx.length} chars — simulated, not written to the thread]`)
    return
  }

  // Default: serialize the agent's current thread as it stands.
  const triggerNodeId = rest.find(a => !a.startsWith('--'))
  const thread = await getOrCreateThread(canvas_id, role)
  const ctx = await serialize(thread, role, canvas, triggerNodeId ? { triggerNodeId } : undefined)
  console.log(frame(
    `${role.toUpperCase()} CONTEXT — canvas ${canvas_id.slice(0, 8)} "${canvas.title}" — ${thread.messages.length} thread msgs`,
    ctx || '(empty — no canvas_event turns on this thread yet)',
  ))
  console.log(`\n[${ctx.length} chars]`)
}

main().catch(err => {
  console.error('inspect-context failed:', (err as Error).message)
  process.exit(1)
})
