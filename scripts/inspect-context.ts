import { serialize } from '../src/serializer/index.js'
import { serializeJudgeContext } from '../src/serializer/index.js'
import { getCanvas } from '../src/db/canvases.js'
import { getOrCreateThread } from '../src/db/threads.js'
import type { AgentRole } from '../types/index.js'

// ─────────────────────────────────────────────────────────────────────────
// Prints the serialized CONTEXT an agent reasons on — the user-message half
// of its input. (The system prompt and any in-loop tool results are NOT here;
// for the complete model input including those, read the Langfuse trace.)
//
//   npx tsx --env-file=.env scripts/inspect-context.ts <canvas_id> <agent_role>
//   npx tsx --env-file=.env scripts/inspect-context.ts <canvas_id> judge [trigger_node_id]
//
// agent_role: expander | stress_tester | observer | general | judge
//
// Default: serializes the agent's CURRENT thread as it stands in the DB.
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
