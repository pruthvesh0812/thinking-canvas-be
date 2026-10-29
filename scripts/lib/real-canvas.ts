// Real-canvas mode for the prompt preview: loads a REAL canvas from Supabase and builds the same
// inputs a fixture would. READ-ONLY: this file only ever calls "get" functions, it never writes.
//
// Everything that touches the database comes in through `RealCanvasDeps`, so this logic can be
// unit-tested with fakes. The real deps are created by createDefaultDeps(), which imports the
// database modules lazily: fixture mode must keep working without any .env.

import type { AgentRole, AgentThread, Canvas, Node } from '../../types/index.js'
import type { AssembleParams } from '../../src/context/assemble.js'
import type { S1Source } from '../../src/context/retrieve-s1.js'
import { buildThreadMemory } from '../../src/context/thread-memory.js'

export type RealCanvasOptions = {
  canvasId: string
  focusNodeIds: string[]
  agent: AgentRole
  // The request is the (first) focus node's own text.
  sourceNode: boolean
  // The request is this context entry's text.
  entryId?: string
}

export type RealCanvasDeps = {
  getCanvas(canvasId: string): Promise<Canvas>
  createSource(canvasId: string): S1Source
  getThreads(canvasId: string): Promise<AgentThread[]>
  getConstraints(canvasId: string, agent: AgentRole): Promise<string>
  getNodes(ids: string[]): Promise<Node[]>
  getEntryText(canvasId: string, entryId: string): Promise<string | null>
}

export type RealCanvasInputs = {
  source: S1Source
  focusNodeIds: string[]
  excludeEntryId?: string
  assembleBase: Omit<AssembleParams, 'retrieval'>
}

export async function loadRealCanvas(options: RealCanvasOptions, deps: RealCanvasDeps): Promise<RealCanvasInputs> {
  const { canvasId, focusNodeIds, agent, sourceNode, entryId } = options

  // ── 1. check the options make sense together ──
  if (sourceNode && entryId) throw new Error('use either --source-node or --entry, not both')

  // ── 2. what is the request? (the invoking text, read live) ──
  let task: AssembleParams['task'] = { text: null, sourceType: 'context_entry' } // null = agent default task

  if (sourceNode) {
    // the focus node's own text is the request
    const [node] = await deps.getNodes([focusNodeIds[0]])
    if (!node) throw new Error(`--source-node: node ${focusNodeIds[0]} not found (or set aside)`)
    task = { text: node.content, sourceType: 'node', sourceNodeId: node.id }
  } else if (entryId) {
    const text = await deps.getEntryText(canvasId, entryId)
    if (text === null) throw new Error(`--entry: note ${entryId} not found on this canvas, deleted, or has no active link`)
    task = { text, sourceType: 'context_entry' }
  }

  // ── 3. everything else the prompt needs, loaded in parallel ──
  const [canvas, threads, constraintsBlock] = await Promise.all([
    deps.getCanvas(canvasId),
    deps.getThreads(canvasId),
    deps.getConstraints(canvasId, agent),
  ])

  // ── 4. hand back the same shape a fixture produces ──
  return {
    source: deps.createSource(canvasId),
    focusNodeIds,
    excludeEntryId: entryId,
    assembleBase: {
      agent,
      canvas: { title: canvas.title, original_intent: canvas.original_intent },
      constraintsBlock,
      threadMemory: buildThreadMemory(threads),
      task,
    },
  }
}

// The real dependencies. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
export async function createDefaultDeps(): Promise<RealCanvasDeps> {
  // load .env ourselves (only in this mode, so fixture mode never needs one).
  // Missing file is fine: the variables may already be set in the shell.
  try {
    process.loadEnvFile('.env')
  } catch {
    // no .env file, the check below tells the user if variables are missing
  }

  // check first, so a missing .env gives a clear message (we only ever name the variables, never print values)
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(name => !process.env[name])
  if (missing.length > 0) {
    throw new Error(`real canvas mode needs ${missing.join(' and ')} in .env (see .env.example)`)
  }

  // lazy imports: these modules create the Supabase client when loaded
  const [{ getCanvas }, { getAllByCanvas }, { getNodesByIds }, { getInvokingEntryText }, { buildRejectionBlock }, { createDbSource }] =
    await Promise.all([
      import('../../src/db/canvases.js'),
      import('../../src/db/threads.js'),
      import('../../src/db/nodes.js'),
      import('../../src/db/context-notes.js'),
      import('../../src/serializer/rejection.js'),
      import('../../src/context/db-source.js'),
    ])

  return {
    getCanvas,
    createSource: createDbSource,
    getThreads: getAllByCanvas,
    getConstraints: buildRejectionBlock,
    getNodes: getNodesByIds,
    getEntryText: getInvokingEntryText,
  }
}
