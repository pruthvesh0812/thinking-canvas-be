import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { streamExpander } from '../agents/expander.js'
import { createDbSource } from '../context/db-source.js'
import { getCanvas } from '../db/canvases.js'
import { getAllByCanvas, getOrCreateThread, appendMessage } from '../db/threads.js'
import { getNodesByIds } from '../db/nodes.js'
import { getInvokingEntryText } from '../db/context-notes.js'
import { getRun, markRunning, markDone, markFailed } from '../db/agent-runs.js'
import { buildRejectionBlock } from '../serializer/rejection.js'
import { publishStructureStart, publishGhostChunk, publishStructureDone, publishStructureError } from '../streaming/structure.js'
import { executeAgentRun, type ExecuteRunDeps } from './execute-run.js'

// The real dependencies for executeAgentRun (database, model, Redis).
const realDeps: ExecuteRunDeps = {
  getRun,
  markRunning,
  markDone,
  markFailed,
  getCanvas,
  getAllThreads: getAllByCanvas,
  getOrCreateThread,
  appendMessage,
  getConstraints: buildRejectionBlock,
  createSource: createDbSource,

  // Read the invoking text live from the row the request points at.
  getInvokingText: async run => {
    if (run.source_type === 'context_entry') return getInvokingEntryText(run.canvas_id, run.source_id)

    // a node: its own text is the request (and it must be a node of this canvas)
    const [node] = (await getNodesByIds([run.source_id])).filter(n => n.canvas_id === run.canvas_id)
    return node?.content ?? null
  },

  // Only the Expander exists so far. Other agents are added here as their slices land.
  streamAgent: async ({ canvasId, prompt }) => {
    const output = await streamExpander({ canvas_id: canvasId, prompt })
    return { partials: output.objectStream, getFinal: async () => output.object }
  },

  publisher: {
    start: publishStructureStart,
    chunk: publishGhostChunk,
    done: publishStructureDone,
    error: publishStructureError,
  },
}

// ─────────────────────────────────────────────────────────────────────────
// RUN-AGENT PIPELINE: fires when POST /api/agent/run accepts a request.
// One agent run = one execution of executeAgentRun (see execute-run.ts for the flow).
//
// Concurrency: one run at a time per canvas + agent. Different agents run in parallel
// (they never write to the canvas, so they can't read each other's half-written state).
// retries: 0 on purpose. A retry would stream a SECOND answer over the first one, and pay
// for the model twice. A failed run is marked failed and the user can ask again.
// ─────────────────────────────────────────────────────────────────────────
export const runAgentPipeline = inngest.createFunction(
  {
    id: 'run-agent',
    triggers: [{ event: 'agent/run.requested' }],
    concurrency: { key: 'event.data.canvas_id + "-" + event.data.agent', limit: 1 },
    retries: 0,
  },
  async ({ event, step }) => {
    const { run_id } = event.data as { run_id: string }
    logger.info('[pipeline:run-agent] start', { run_id })

    // One step: the model stream cannot be split into resumable steps.
    return step.run('execute', () => executeAgentRun(run_id, realDeps))
  },
)

